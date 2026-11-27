// Pixel Enemies - pantalla de juego (Phaser 3): mapa, ciudades, tropas y turnos.
(function () {
  'use strict';
  const T = window.PETiles, M = window.PEMap, R = window.PERules, U = window.PEUnits;
  const FACTION_COLORS = ['#d23b3b', '#e8c021', '#3b6fd2', '#3fa34d', '#8e4bc4', '#ee8a2a'];
  const FACTION_NAMES = ['Hondarribia', 'Irun', 'Donosti', 'Lekumberri', 'Alli', 'Leitza'];
  const PLAYERS = [0, 1];       // de momento: Hondarribia contra Irun, en el mismo móvil
  const RELIEF = true;          // casillas con un poco de relieve, como una maqueta
  const DPR = Math.min(3, window.devicePixelRatio || 1); // más resolución en pantallas nítidas
  const SAVE_KEY = 'pe.partida3'; // (v2: con ciudades; las partidas guardadas de antes no sirven)

  const state = {
    size: localGet('pe.size', 'pequeno'),
    type: localGet('pe.type', 'costas'),
    abundance: localGet('pe.abundance', 'normal'),
    armies: ({ cerca: 'prueba', lejos: 'real' })[localGet('pe.armies', 'prueba')] || localGet('pe.armies', 'prueba'),
    fog: false,
    map: null,
    game: null,
    me: null,      // en partidas online: qué jugador eres tú (null = todos en el mismo móvil)
    orders: [],    // órdenes hechas en este turno
  };
  window.PEState = state; // para pruebas desde la consola
  function localGet(k, d) { try { return localStorage.getItem(k) || d; } catch (e) { return d; } }
  function localSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sin guardado */ } }
  const factionOf = (owner) => state.game.players[owner].faction;
  const nameOf = (owner) => FACTION_NAMES[factionOf(owner)];
  const unitName = (u) => `${R.UNITS[u.type].label} de ${nameOf(u.owner)}`;
  // La capital se llama como la facción; las demás llevan un número (Irun 2, Irun 3...).
  const cityName = (c) => FACTION_NAMES[state.game.players[c.origin].faction] + (c.number > 1 ? ' ' + c.number : '');
  const citySize = (lvl) => (lvl <= 2 ? 1 : lvl <= 4 ? 2 : 3);
  // Vecinos en el orden E, O, NO, NE, SO, SE (el mismo que usan los dibujos).
  function sideNeighbors(col, row) {
    const odd = row & 1;
    const dirs = odd ? [[1, 0], [-1, 0], [0, -1], [1, -1], [0, 1], [1, 1]] : [[1, 0], [-1, 0], [-1, -1], [0, -1], [-1, 1], [0, 1]];
    return dirs.map(([dc, dr]) => [col + dc, row + dr]);
  }

  class MapScene extends Phaser.Scene {
    constructor() { super('map'); }

    create() {
      this.makeTextures();
      this.cameras.main.setBackgroundColor('#1b2f4f');
      this.input.addPointer(2);
      this.setupControls();
      window.addEventListener('resize', () => {
        this.scale.resize(window.innerWidth * DPR, window.innerHeight * DPR);
        this.scale.setZoom(1 / DPR);
        this.fitCamera();
      });
      window.PEGame = this;
      if (window.PEOnline && window.PEOnline.boot()) return; // enlace de partida online
      this.startLocal();
    }
    // Partida en un solo móvil: la guardada, o una nueva.
    startLocal() {
      const asked = new URLSearchParams(location.search).get('mapa');
      const saved = loadGame();
      if (saved && (!asked || asked === saved.seed)) this.startGame(saved);
      else this.startGame({ seed: asked || undefined });
    }

    makeTextures() {
      const combos = { llanura: ['trigo'], bosque: ['caza', 'lena'], montana: ['mineral'],
        costa: ['pesca'], rio: ['pesca'], mar: [] };
      for (const terrain of Object.keys(M.TERRAIN).filter(k => k !== 'rio'))
        for (const res of [null, ...combos[terrain]])
          for (let v = 0; v < T.VARIANTS; v++)
            this.addTex(`t_${terrain}_${res || 'nada'}_${v}`, T.makeTerrainCanvas(terrain, res, v));
      FACTION_COLORS.forEach((c, i) => {
        this.addTex(`flag_${i}`, T.makeFlagCanvas(c));
        U.TYPES.forEach(type => this.addTex(`u_${type}_${i}`, U.makeUnitCanvas(type, c)));
      });
      this.addTex('fog', T.makeFogCanvas());
      this.addTex('select', T.makeOutlineCanvas('#fff6c8'));
      this.addTex('hl_move', T.makeFillCanvas('#dff4ff', 120, '#bfe8ff'));
      this.addTex('hl_attack', T.makeFillCanvas('#ff4a3a', 120, '#ff3b2e'));
      const arrow = new T.Pix(12, 3);
      arrow.rect(0, 1, 9, 1, '#6b4426'); arrow.rect(9, 0, 2, 3, '#c9ced6'); arrow.set(11, 1, '#e4e8ee');
      arrow.set(0, 0, '#f4f0e0'); arrow.set(0, 2, '#f4f0e0');
      this.addTex('arrow', arrow.done());
      const ball = new T.Pix(6, 6);
      ball.ellipse(3, 3, 2.8, 2.8, null, (u, v) => (u + v < -0.4 ? '#c9ced6' : '#4a4e56'));
      this.addTex('ball', ball.done());
    }
    // Al alejar el zoom, suaviza (se ve mejor); al acercar, píxeles nítidos.
    addTex(key, canvas) {
      const tex = this.textures.addCanvas(key, canvas);
      const gl = this.renderer.gl, glt = tex && tex.source[0].glTexture;
      if (gl && glt) {
        gl.bindTexture(gl.TEXTURE_2D, glt.webGLTexture || glt);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.bindTexture(gl.TEXTURE_2D, null);
      }
    }

    // --- Partida -------------------------------------------------------------
    // saved: { seed, size, type, abundance, armies, game } o solo { seed } para una nueva.
    startGame(saved) {
      const online = !!saved.online;
      state.me = online ? saved.me : null;
      state.names = online ? saved.names : null;
      state.orders = saved.orders || [];
      document.body.classList.toggle('online', online);
      if (online) state.fog = true; // en online la niebla va siempre puesta
      const players = saved.players || PLAYERS;
      if (saved.game || online) {
        state.size = saved.size; state.type = saved.type; state.abundance = saved.abundance; state.armies = ({ cerca: 'prueba', lejos: 'real' })[saved.armies] || saved.armies;
      }
      const map = M.generate({ seed: saved.seed, size: state.size, type: state.type, abundance: state.abundance, players: players.length });
      state.map = map;
      state.game = saved.game || R.newGame({ map, players, close: state.armies === 'prueba', army: state.armies });
      R.applyCleared(state.game, map);
      this.drawMap();
      this.drawUnits();
      this.applyFog();
      this.fitCamera();
      ui.onMap(map);
      if (online) { if (state.game.winner !== null) ui.showWinner(); return; }
      saveGame();
      if (state.game.winner !== null) ui.showWinner();
      else ui.showHandover(!saved.game);
    }

    drawMap() {
      const map = state.map;
      if (this.layer) this.layer.destroy(true);
      this.selected = null;
      this.layer = this.add.container(0, 0);
      this.tileImgs = [];
      this.decor = [];
      const variant = (t) => (t.col * 7 + t.row * 13) % T.VARIANTS;
      const tex = (t) => {
        const b = state.game.buildings[R.key(t.col, t.row)];
        if (b && t.terrain !== 'rio') {
          const key = `t_${t.terrain}_${t.resource || 'nada'}_${variant(t)}_${b}`;
          if (!this.textures.exists(key)) this.addTex(key, T.makeTerrainCanvas(t.terrain, t.resource, variant(t), 0, b));
          return key;
        }
        if (t.terrain !== 'rio') return `t_${t.terrain}_${t.resource || 'nada'}_${variant(t)}`;
        // Los ríos se dibujan según hacia dónde siguen (otro río o el mar).
        const odd = t.row & 1;
        const dirs = odd ? [[1, 0], [-1, 0], [0, -1], [1, -1], [0, 1], [1, 1]]
                         : [[1, 0], [-1, 0], [-1, -1], [0, -1], [-1, 1], [0, 1]];
        let open = 0;
        dirs.forEach(([dc, dr], i) => {
          const n = M.tileAt(map, t.col + dc, t.row + dr);
          if (n && (n.terrain === 'rio' || M.TERRAIN[n.terrain].water)) open |= 1 << i;
        });
        const key = `t_rio_${t.resource || 'nada'}_${variant(t)}_${open}` + (b ? '_' + b : '');
        if (!this.textures.exists(key)) this.addTex(key, T.makeTerrainCanvas('rio', t.resource, variant(t), open, b));
        return key;
      };

      for (const t of map.tiles) {
        const o = T.tileOrigin(t.col, t.row);
        const img = this.add.image(o.x, o.y, tex(t)).setOrigin(0, 0);
        // El agua va siempre por debajo, así se ve el borde de la tierra sobre ella.
        img.setDepth(M.TERRAIN[t.terrain].water ? t.row - 1000 : t.row);
        this.layer.add(img);
        this.tileImgs.push(img);
        this.decor.push([]);
      }
      this.hlLayer = [];
      this.selectImg = this.add.image(0, 0, 'select').setOrigin(0, 0).setVisible(false).setDepth(999);
      this.layer.add(this.selectImg);
      this.unitViews = new Map();
      this.cityObjs = [];
      this.layer.sort('depth');

      this.texOf = tex;
      this.worldW = map.cols * T.COL_STEP + T.COL_STEP / 2;
      this.worldH = (map.rows - 1) * T.ROW_STEP + T.TH;
    }

    // --- Ciudades y territorio en pantalla ---------------------------------
    drawCities() {
      const game = state.game, map = state.map;
      this.cityObjs.forEach(o => o.destroy());
      this.cityObjs = [];
      // Territorio: velo y borde del color del dueño en las casillas que son suyas.
      for (const t of map.tiles) {
        if (t.hidden) continue;
        const city = R.ownerOfTile(game, t.col, t.row);
        if (!city) continue;
        let mask = 0;
        sideNeighbors(t.col, t.row).forEach(([c, r], i) => {
          const other = R.ownerOfTile(game, c, r);
          if (!other || other.owner !== city.owner) mask |= 1 << i;
        });
        const f = factionOf(city.owner), key = `border_${f}_${mask}`;
        if (!this.textures.exists(key)) this.addTex(key, T.makeBorderCanvas(FACTION_COLORS[f], mask));
        const water = M.TERRAIN[t.terrain].water;
        const img = this.add.image(T.tileOrigin(t.col, t.row).x, this.tileY(t), key).setOrigin(0, 0)
          .setDepth(water ? t.row - 1000 + 0.3 : t.row + 0.3);
        this.layer.add(img); this.cityObjs.push(img);
      }
      // Caminos (en el río, puentes).
      for (const t of map.tiles) {
        if (t.hidden || !game.roads[R.key(t.col, t.row)]) continue;
        let mask = 0;
        sideNeighbors(t.col, t.row).forEach(([c, r], i) => { if (R.hasRoad(game, c, r)) mask |= 1 << i; });
        const bridge = t.terrain === 'rio' ? 1 : 0, key = `road_${mask}_${bridge}`;
        if (!this.textures.exists(key)) this.addTex(key, T.makeRoadCanvas(mask, !!bridge));
        const img = this.add.image(T.tileOrigin(t.col, t.row).x, T.tileOrigin(t.col, t.row).y, key).setOrigin(0, 0).setDepth(t.row + 0.25);
        this.layer.add(img); this.cityObjs.push(img);
      }
      for (const c of game.cities) {
        const t = M.tileAt(map, c.col, c.row);
        if (t.hidden) continue;
        const o = T.tileOrigin(c.col, c.row), lvl = R.cityLevel(game, map, c), f = factionOf(c.owner);
        const ckey = `city_${f}_${citySize(lvl)}_${c.capital ? 1 : 0}_${c.fort ? 1 : 0}`;
        if (!this.textures.exists(ckey)) this.addTex(ckey, T.makeCityCanvas(FACTION_COLORS[f], citySize(lvl), c.capital, c.fort));
        const img = this.add.image(o.x, o.y, ckey).setOrigin(0, 0).setDepth(c.row + 0.6);
        const label = this.add.text(o.x + T.W / 2, o.y + T.TOP + T.H + 2, `${cityName(c)} · Nv ${lvl}`,
          { fontFamily: 'monospace', fontStyle: 'bold', fontSize: '9px', color: f === 1 ? '#2b1d3a' : '#ffffff',
            backgroundColor: FACTION_COLORS[f], padding: { x: 3, y: 1 } }).setResolution(6).setOrigin(0.5, 0.5).setDepth(990); // el nombre siempre por encima
        this.layer.add([img, label]); this.cityObjs.push(img, label);
      }
      this.layer.sort('depth');
    }

    // --- Tropas en pantalla -------------------------------------------------
    unitPos(col, row) {
      const o = T.tileOrigin(col, row);
      return { x: o.x + T.W / 2, y: o.y + T.TOP + T.H / 2 + 9 };
    }
    drawUnits() {
      const game = state.game, alive = new Set(game.units.map(u => u.id));
      for (const [id, v] of this.unitViews) if (!alive.has(id)) { v.destroy(); this.unitViews.delete(id); }
      for (const u of game.units) {
        let v = this.unitViews.get(u.id);
        if (!v) {
          v = this.add.container(0, 0);
          const img = this.add.image(0, 0, `u_${u.type}_${factionOf(u.owner)}`).setOrigin(0.5, 1);
          img.setFlipX(u.owner % 2 === 1); // los de Irun miran a la izquierda
          const hp = this.add.text(11, -33, '', { fontFamily: 'monospace', fontStyle: 'bold', fontSize: '11px',
            color: '#ffffff', stroke: '#1a1420', strokeThickness: 3 }).setResolution(6).setOrigin(0.5, 0.5);
          const ring = this.add.ellipse(0, -2, 26, 9).setStrokeStyle(2, Phaser.Display.Color.HexStringToColor(FACTION_COLORS[factionOf(u.owner)]).color, 0.95);
          v.add([ring, img, hp]);
          v.img = img; v.hp = hp;
          this.layer.add(v);
          this.unitViews.set(u.id, v);
        }
        const p = this.unitPos(u.col, u.row);
        v.setPosition(p.x, p.y).setDepth(u.row + 0.8);
        this.refreshUnit(u);
      }
      this.layer.sort('depth');
    }
    refreshUnit(u) {
      const v = this.unitViews.get(u.id), game = state.game;
      if (!v) return;
      v.hp.setText(String(u.hp));
      v.hp.setColor(R.weak(u) ? '#ff7a6a' : u.hp < R.UNITS[u.type].hp ? '#ffe08a' : '#ffffff');
      // Las tropas del jugador que ya no pueden hacer nada se ven apagadas.
      const tired = u.owner === game.turn && !R.canDoSomething(game, state.map, u);
      v.img.setTint(tired ? 0xb4b4b4 : 0xffffff);
      v.setAlpha(tired ? 0.75 : 1);
      v.setVisible(!this.isHidden(u.col, u.row));
    }
    refreshAll() { state.game.units.forEach(u => this.refreshUnit(u)); }

    // --- Niebla: solo se ve lo que ven tus tropas (1 casilla; 2 si exploran o están en montaña) ---
    isHidden(col, row) {
      const t = M.tileAt(state.map, col, row);
      return !!(t && t.hidden);
    }
    applyFog() {
      const map = state.map, game = state.game;
      const me = state.me === null ? game.turn : state.me; // en online, ves lo tuyo aunque no sea tu turno
      const mine = game.units.filter(u => u.owner === me);
      const myCities = game.cities.filter(c => c.owner === me);
      map.tiles.forEach((t, i) => {
        const hidden = state.fog && !mine.some(u => M.distance(t.col, t.row, u.col, u.row) <= R.visionOf(map, u))
          && !myCities.some(c => M.distance(t.col, t.row, c.col, c.row) <= R.ECON.cityVision);
        this.tileImgs[i].setTexture(hidden ? 'fog' : this.texOf(t));
        this.tileImgs[i].setDepth(M.TERRAIN[t.terrain].water && !hidden ? t.row - 1000 : t.row);
        this.decor[i].forEach(d => d.setVisible(!hidden));
        t.hidden = hidden;
      });
      this.drawCities();
      this.refreshAll();
      this.layer.sort('depth');
    }

    // --- Seleccionar, mover y atacar -----------------------------------------
    clearHighlights() {
      this.hlLayer.forEach(o => o.destroy());
      this.hlLayer = [];
    }
    tileY(t) { return T.tileOrigin(t.col, t.row).y + (M.TERRAIN[t.terrain].water && RELIEF ? T.WATER_DROP : 0); }
    selectTile(t) {
      if (!t) { this.selectImg.setVisible(false); return; }
      this.selectImg.setPosition(T.tileOrigin(t.col, t.row).x, this.tileY(t)).setVisible(true);
    }
    selectUnit(u) {
      this.clearHighlights();
      this.selected = u;
      if (!u) { this.selectTile(null); ui.onTile(null); return; }
      this.selectTile(M.tileAt(state.map, u.col, u.row));
      const game = state.game, map = state.map;
      if (u.owner === game.turn) {
        this.moves = R.reachable(game, map, u);
        for (const m of this.moves.values()) {
          const o = T.tileOrigin(m.col, m.row);
          const img = this.add.image(o.x, o.y, 'hl_move').setOrigin(0, 0).setDepth(m.row + 0.5);
          this.layer.add(img); this.hlLayer.push(img);
        }
        // Colono: una banderita en las casillas azules donde podría fundar.
        this.foundSpots = 0;
        if (u.type === 'colono') for (const m of this.moves.values()) {
          if (R.foundProblem(game, map, Object.assign({}, u, { col: m.col, row: m.row, acted: false }))) continue;
          this.foundSpots++;
          const o = T.tileOrigin(m.col, m.row);
          const f = this.add.image(o.x + T.W / 2 + 4, o.y + T.TOP + T.H / 2 - 6, `flag_${factionOf(u.owner)}`).setDepth(m.row + 0.55);
          this.layer.add(f); this.hlLayer.push(f);
        }
        this.targets = R.targets(game, u).filter(e => !this.isHidden(e.col, e.row));
        for (const e of this.targets) {
          const o = T.tileOrigin(e.col, e.row), pv = R.preview(game, map, u, e);
          const img = this.add.image(o.x, o.y, 'hl_attack').setOrigin(0, 0).setDepth(e.row + 0.5);
          // Cuánto le quitarías (y cuánto te devolvería), antes de atacar.
          const txt = this.add.text(o.x + T.W / 2 - 14, o.y + T.TOP + T.H - 12, `-${pv.dealt}` + (pv.back ? ` ↩${pv.back}` : ''),
            { fontFamily: 'monospace', fontStyle: 'bold', fontSize: '10px', color: '#ffe0d8', stroke: '#5a0d08', strokeThickness: 3 })
            .setResolution(6).setOrigin(0.5, 0.5).setDepth(e.row + 0.9);
          this.layer.add([img, txt]); this.hlLayer.push(img, txt);
        }
      } else { this.moves = new Map(); this.targets = []; }
      this.layer.sort('depth');
      ui.onUnit(u);
    }

    async doMove(u, dest) {
      this.busy = true;
      this.clearHighlights();
      this.selectTile(null);
      const path = this.order({ a: 'move', u: u.id, col: dest.col, row: dest.row });
      if (!path) { this.busy = false; return; }
      const v = this.unitViews.get(u.id);
      for (const step of path) {
        const p = this.unitPos(step.col, step.row);
        if (p.x !== v.x) v.img.setFlipX(p.x < v.x);
        const fromRow = Math.round(v.depth - 0.8);
        v.setDepth(Math.max(fromRow, step.row) + 0.8); this.layer.sort('depth');
        await this.tween({ targets: v, x: p.x, y: p.y, duration: 150, ease: 'Sine.easeInOut' });
        v.setDepth(step.row + 0.8); this.layer.sort('depth');
      }
      v.setDepth(u.row + 0.8);
      this.applyFog();
      saveGame();
      this.busy = false;
      if (this.replaying) { ui.say(`${unitName(u)} se mueve.`); return; }
      // Si después de moverse puede atacar, se queda seleccionada.
      if (R.targets(state.game, u).some(e => !this.isHidden(e.col, e.row))) this.selectUnit(u);
      else { this.selectUnit(null); ui.say(`${R.UNITS[u.type].label} se ha movido.`); }
    }

    async doAttack(att, def) {
      this.busy = true;
      this.clearHighlights();
      this.selectTile(null);
      const ranged = R.UNITS[att.type].range > 1 && M.distance(att.col, att.row, def.col, def.row) > 1;
      const counterRanged = R.UNITS[def.type].range > 1 && M.distance(att.col, att.row, def.col, def.row) > 1;
      const result = this.order({ a: 'attack', u: att.id, t: def.id });
      if (!result) { this.busy = false; return; }
      const va = this.unitViews.get(att.id), vd = this.unitViews.get(def.id);
      va.img.setFlipX(vd.x < va.x);
      await this.strike(va, vd, ranged, result.dealt);
      if (result.back > 0) {
        vd.img.setFlipX(va.x < vd.x);
        await this.strike(vd, va, counterRanged, result.back);
      }
      const dead = [[def, vd], [att, va]].filter(([u]) => u.hp <= 0);
      await Promise.all(dead.map(([, v]) => this.tween({ targets: v, alpha: 0, y: v.y + 6, duration: 380 })));
      this.drawUnits();
      this.refreshAll();
      saveGame();
      this.busy = false;
      // Un hostigador que aún no se ha movido puede irse después de atacar.
      const canLeave = !this.replaying && att.hp > 0 && state.game.winner === null && R.reachable(state.game, state.map, att).size > 0;
      const again = !this.replaying && att.hp > 0 && state.game.winner === null && result.kills && R.targets(state.game, att).some(e => !this.isHidden(e.col, e.row));
      this.selectUnit(canLeave || again ? att : null);
      let msg = `${unitName(att)} ataca al ${unitName(def)} y le quita ${result.dealt}.`;
      if (result.kills) msg += ' ¡Lo elimina!';
      else if (result.back) msg += ` Contraataque: le devuelve ${result.back}` + (result.dies ? ' y lo elimina.' : '.');
      if (canLeave) msg += ' Aún puede moverse.';
      if (again) msg += ' ¡Implacable: puede volver a atacar!';
      ui.say(msg);
      if (state.game.winner !== null && !this.replaying) ui.showWinner();
    }
    // Un golpe: el atacante se lanza (o dispara una flecha) y sale el daño flotando.
    async strike(from, to, ranged, dmg) {
      if (ranged) {
        const ball = R.UNITS[(this.unitTypeOf(from) || 'arquero')].cls === 'maquina';
        const a = this.add.image(from.x, from.y - 18, ball ? 'ball' : 'arrow').setDepth(9999);
        a.setRotation(Math.atan2(to.y - from.y, to.x - from.x));
        this.layer.add(a);
        await this.tween({ targets: a, x: to.x, y: to.y - 16, duration: 260, ease: 'Quad.easeIn' });
        a.destroy();
      } else {
        const bx = from.x, by = from.y;
        await this.tween({ targets: from, x: bx + (to.x - bx) * 0.45, y: by + (to.y - by) * 0.45, duration: 110, ease: 'Quad.easeIn' });
        this.tween({ targets: from, x: bx, y: by, duration: 160, ease: 'Quad.easeOut' });
      }
      to.img.setTintFill(0xffffff);
      this.time.delayedCall(90, () => to.img.clearTint());
      const t = this.add.text(to.x, to.y - 40, `-${dmg}`, { fontFamily: 'monospace', fontStyle: 'bold', fontSize: '14px',
        color: '#ff5040', stroke: '#1a0a08', strokeThickness: 4 }).setResolution(6).setOrigin(0.5).setDepth(9999);
      this.layer.add(t);
      this.tween({ targets: t, y: t.y - 16, alpha: 0, delay: 350, duration: 500 }).then(() => t.destroy());
      await this.wait(260);
    }
    unitTypeOf(view) { for (const [id, v] of this.unitViews) if (v === view) { const u = R.unitById(state.game, id); return u && u.type; } return null; }
    tween(cfg) { return new Promise(res => this.tweens.add({ ...cfg, onComplete: () => res() })); }
    wait(ms) { return new Promise(res => this.time.delayedCall(ms, res)); }

    endTurn() {
      if (this.busy || state.game.winner !== null || !this.myTurn()) return;
      this.order({ a: 'end' });
      if (state.me !== null) { // online: se manda el turno y los demás lo verán
        this.selectUnit(null); this.drawUnits(); this.applyFog(); ui.onTurn();
        window.PEOnline.endTurn();
        return;
      }
      this.selectUnit(null);
      this.drawUnits(); // las tropas de un jugador eliminado desaparecen
      this.applyFog();
      saveGame();
      if (state.game.winner !== null) ui.showWinner();
      else ui.showHandover(false);
    }

    // --- Acciones de ciudad y de tropa (botones de abajo) -------------------
    doFound(u) {
      const problem = R.foundProblem(state.game, state.map, u);
      if (problem) { ui.say(`Aquí no se puede fundar: ${problem}`); return; }
      const city = this.order({ a: 'found', u: u.id });
      if (!city) return;
      this.drawUnits(); this.applyFog(); saveGame(); ui.refreshRes();
      this.showTile(M.tileAt(state.map, city.col, city.row));
      ui.say(`¡Nueva ciudad: ${cityName(city)}! Su territorio son las casillas de alrededor que no eran de nadie.`);
    }
    doBuild(t) {
      const type = this.order({ a: 'build', col: t.col, row: t.row });
      if (!type) return;
      this.applyFog(); saveGame(); ui.refreshRes();
      this.showTile(t);
      const city = R.ownerOfTile(state.game, t.col, t.row), b = R.BUILDINGS[type];
      const can = !R.levelUpProblem(state.game, state.map, city);
      ui.say(`${b.label} construido: ${R.givesText(R.buildingGives(state.game, state.map, t))} por turno.` + (can ? ` ${cityName(city)} ya puede subir de nivel.` : ''));
    }
    doRoad(t) {
      if (!this.order({ a: 'road', col: t.col, row: t.row })) return;
      this.applyFog(); saveGame(); ui.refreshRes();
      this.showTile(t);
      const n = R.connectedCities(state.game, state.map, state.game.turn).length;
      ui.say('Camino construido.' + (n ? ` Tienes ${n} ciudad${n > 1 ? 'es' : ''} unida${n > 1 ? 's' : ''} a la capital.` : ''));
    }
    doCity(city, what) {
      const g = state.game, map = state.map;
      const ok = this.order({ a: what, city: city.id });
      if (!ok) return;
      this.applyFog(); saveGame(); ui.refreshRes();
      this.showTile(M.tileAt(map, city.col, city.row));
      ui.say(what === 'nivel' ? `¡${cityName(city)} sube a nivel ${city.level}! Ahora produce más.`
        : what === 'ampliar' ? `${cityName(city)} amplía su territorio con ${ok} casillas nuevas.`
        : `${cityName(city)} está fortificada: quien la defienda tendrá +${R.ECON.fortDefense} de defensa.`);
    }
    doRecruit(city, type) {
      const u = this.order({ a: 'recruit', city: city.id, type });
      if (!u) return;
      this.drawUnits(); this.applyFog(); saveGame(); ui.refreshRes();
      this.selectUnit(null);
      ui.say(`${R.UNITS[type].label} reclutado en ${cityName(city)}. Podrá moverse en tu próximo turno.`);
    }
    // Monje: cura a las tropas de al lado.
    async doBless(u) {
      const healed = this.order({ a: 'sanar', u: u.id });
      if (!healed) return;
      for (const h of healed) {
        const x = R.unitById(state.game, h.id), v = this.unitViews.get(h.id);
        if (!x || !v) continue;
        this.refreshUnit(x);
        const t = this.add.text(v.x, v.y - 40, `+${h.n}`, { fontFamily: 'monospace', fontStyle: 'bold', fontSize: '14px',
          color: '#7dff8a', stroke: '#0a1a08', strokeThickness: 4 }).setResolution(6).setOrigin(0.5).setDepth(9999);
        this.layer.add(t);
        this.tween({ targets: t, y: t.y - 16, alpha: 0, delay: 350, duration: 500 }).then(() => t.destroy());
      }
      this.refreshUnit(u); saveGame();
      this.selectUnit(null);
      ui.say(`${unitName(u)} cura a ${healed.length} tropa${healed.length > 1 ? 's' : ''} de al lado.`);
      await this.wait(300);
    }
    doTech(id) {
      if (!this.order({ a: 'tech', id })) return false;
      saveGame(); ui.refreshRes();
      return true;
    }
    doHeal(u) {
      const n = this.order({ a: 'heal', u: u.id });
      if (!n) return;
      this.refreshUnit(u); saveGame(); ui.refreshRes();
      this.selectUnit(null);
      ui.say(`${unitName(u)} se cura ${n} de vida (ahora tiene ${u.hp}).`);
    }
    // Hace una orden (ver R.perform) y la apunta en las órdenes de este turno.
    order(o) {
      const r = R.perform(state.game, state.map, o);
      if (r && !this.replaying) { state.orders.push(o); if (window.PEOnline) window.PEOnline.onOrder(o); }
      return r;
    }
    // ¿Puede tocar cosas el que tiene el móvil? (en online, solo en tu turno)
    myTurn() { return !this.replaying && (state.me === null || state.game.turn === state.me); }
    // Repite lo que hizo otro jugador: desde la partida como estaba, con sus órdenes,
    // moviendo la cámara a cada cosa que pasa (si la ves; con niebla, lo oculto no se enseña).
    async replay(start, orders, speed) {
      this.replaying = true; this.busy = true; this.skip = false;
      let seen = 0; // cuántas cosas se han visto (las que pasan en la niebla no se enseñan)
      ui.setActions([]);
      state.game = JSON.parse(JSON.stringify(start));
      R.applyCleared(state.game, state.map);
      this.drawMap(); this.drawUnits(); this.applyFog();
      for (const o of orders) {
        if (this.skip) break;
        const g = state.game, u = o.u !== undefined ? R.unitById(g, o.u) : null, c = o.city !== undefined ? R.cityById(g, o.city) : null;
        const at = o.col !== undefined && o.a !== 'move' ? o : u || c;
        if (at && !this.isHidden(at.col, at.row)) { seen++; await this.panTo(at.col, at.row); await this.wait(250 / (speed || 1)); }
        this.busy = false;
        if (o.a === 'move' && u) await this.doMove(u, { col: o.col, row: o.row });
        else if (o.a === 'attack' && u) await this.doAttack(u, R.unitById(g, o.t));
        else if (o.a === 'found' && u) this.doFound(u);
        else if (o.a === 'build') this.doBuild(M.tileAt(state.map, o.col, o.row));
        else if (o.a === 'road') this.doRoad(M.tileAt(state.map, o.col, o.row));
        else if (o.a === 'recruit' && c) this.doRecruit(c, o.type);
        else if (o.a === 'heal' && u) this.doHeal(u);
        else if (o.a === 'sanar' && u) await this.doBless(u);
        else if (o.a === 'tech') R.perform(state.game, state.map, o); // las tecnologías de los demás no se ven
        else if (c) this.doCity(c, o.a);
        else if (o.a === 'end') R.perform(state.game, state.map, o);
        this.busy = true;
        if (at && !this.isHidden(at.col, at.row)) await this.wait(550 / (speed || 1));
      }
      this.selectUnit(null); this.selectTile(null);
      this.replaying = false; this.busy = false;
      this.drawUnits(); this.applyFog();
      return seen;
    }
    panTo(col, row) {
      const p = this.unitPos(col, row), cam = this.cameras.main;
      const zoom = Phaser.Math.Clamp(Math.max(cam.zoom, 1.3 * DPR), this.minZoom, this.maxZoom);
      const shift = (ui.topHeight() - ui.bottomHeight()) * DPR / 2 / zoom;
      return this.tween({ targets: cam, zoom, scrollX: p.x - cam.width / 2, scrollY: p.y - 20 - shift - cam.height / 2,
        duration: 420, ease: 'Sine.easeInOut' });
    }
    showTile(t) {
      this.selectUnit(null);
      this.selected = { tile: t };
      this.selectTile(t);
      ui.onTile(t);
    }
    // Al empezar un turno, la cámara va hacia las tropas del jugador.
    focusPlayer() {
      const mine = state.game.units.filter(u => u.owner === state.game.turn)
        .concat(state.game.cities.filter(c => c.owner === state.game.turn));
      if (!mine.length) return;
      const ps = mine.map(u => this.unitPos(u.col, u.row));
      const cx = ps.reduce((s, p) => s + p.x, 0) / ps.length, cy = ps.reduce((s, p) => s + p.y, 0) / ps.length - 20;
      const cam = this.cameras.main;
      const zoom = Phaser.Math.Clamp(Math.max(cam.zoom, 1.15 * DPR), this.minZoom, this.maxZoom);
      const shift = (ui.topHeight() - ui.bottomHeight()) * DPR / 2 / zoom;
      this.tweens.add({ targets: cam, zoom, scrollX: cx - cam.width / 2, scrollY: cy - shift - cam.height / 2,
        duration: 450, ease: 'Sine.easeInOut', onComplete: () => this.clampCamera() });
    }

    // --- Cámara: mover con un dedo, zoom con dos dedos o la rueda ---------
    fitCamera() {
      const cam = this.cameras.main;
      const top = ui.topHeight() * DPR, bottom = ui.bottomHeight() * DPR;
      const w = this.scale.width, h = this.scale.height - top - bottom;
      this.minZoom = Math.min(w / this.worldW, h / (this.worldH - T.TOP)) * 0.96;
      this.maxZoom = Math.max(3 * DPR, this.minZoom * 4);
      cam.setZoom(this.minZoom);
      cam.centerOn(this.worldW / 2, (this.worldH + T.TOP) / 2 + (top - bottom) / 2 / this.minZoom);
    }
    worldAt(sx, sy) {
      const cam = this.cameras.main;
      return { x: cam.scrollX + cam.width / 2 + (sx - cam.width / 2) / cam.zoom,
               y: cam.scrollY + cam.height / 2 + (sy - cam.height / 2) / cam.zoom };
    }
    zoomAround(sx, sy, newZoom) {
      const cam = this.cameras.main;
      newZoom = Phaser.Math.Clamp(newZoom, this.minZoom * 0.8, this.maxZoom);
      const before = this.worldAt(sx, sy);
      cam.zoom = newZoom;
      const after = this.worldAt(sx, sy);
      cam.scrollX += before.x - after.x;
      cam.scrollY += before.y - after.y;
      this.clampCamera();
    }
    clampCamera() {
      const cam = this.cameras.main;
      const vw = cam.width / cam.zoom, vh = cam.height / cam.zoom;
      const cx = cam.scrollX + cam.width / 2, cy = cam.scrollY + cam.height / 2; // centro visible
      const mx = Math.max(0, (vw - this.worldW) / 2) + vw * 0.3, my = Math.max(0, (vh - this.worldH) / 2) + vh * 0.3;
      const ncx = Phaser.Math.Clamp(cx, -mx + vw / 2, this.worldW + mx - vw / 2);
      const ncy = Phaser.Math.Clamp(cy, -my + vh / 2, this.worldH + my - vh / 2);
      cam.scrollX += ncx - cx; cam.scrollY += ncy - cy;
    }

    setupControls() {
      const pointers = new Map();
      let pinch = null, tapStart = null;
      const active = () => [...pointers.values()];

      this.input.on('pointerdown', (p) => {
        pointers.set(p.id, { x: p.x, y: p.y });
        if (pointers.size === 1) tapStart = { x: p.x, y: p.y, t: Date.now() };
        else { tapStart = null; pinch = null; }
      });
      this.input.on('pointermove', (p) => {
        const prev = pointers.get(p.id);
        if (!prev || !p.isDown) return;
        const cam = this.cameras.main;
        if (pointers.size === 1) {
          cam.scrollX -= (p.x - prev.x) / cam.zoom;
          cam.scrollY -= (p.y - prev.y) / cam.zoom;
          this.clampCamera();
          if (tapStart && Math.hypot(p.x - tapStart.x, p.y - tapStart.y) > 10 * DPR) tapStart = null;
        }
        prev.x = p.x; prev.y = p.y;
        if (pointers.size >= 2) {
          const [a, b] = active();
          const dist = Math.hypot(a.x - b.x, a.y - b.y), mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          if (pinch) {
            cam.scrollX -= (mid.x - pinch.mid.x) / cam.zoom;
            cam.scrollY -= (mid.y - pinch.mid.y) / cam.zoom;
            this.zoomAround(mid.x, mid.y, cam.zoom * dist / pinch.dist);
          }
          pinch = { dist: Math.max(dist, 1), mid };
        }
      });
      const up = (p) => {
        pointers.delete(p.id);
        if (pointers.size < 2) pinch = null;
        if (tapStart && pointers.size === 0 && Date.now() - tapStart.t < 500) this.tap(p.x, p.y);
        tapStart = null;
      };
      this.input.on('pointerup', up);
      this.input.on('pointerupoutside', up);
      this.input.on('wheel', (p, objs, dx, dy) => this.zoomAround(p.x, p.y, this.cameras.main.zoom * (dy > 0 ? 0.88 : 1.14)));
    }

    tileUnder(w) {
      const map = state.map;
      let hit = null;
      for (const t of map.tiles) {
        const o = T.tileOrigin(t.col, t.row);
        const lower = M.TERRAIN[t.terrain].water && RELIEF && !t.hidden ? T.WATER_DROP : 0;
        if (T.insideHex(Math.floor(w.x - o.x), Math.floor(w.y - o.y - T.TOP - lower))) hit = t;
      }
      return hit;
    }
    // Si se toca el cuerpo de una tropa (que sobresale hacia arriba), cuenta como su casilla.
    unitUnder(w) {
      let best = null;
      for (const u of state.game.units) {
        if (this.isHidden(u.col, u.row)) continue;
        const p = this.unitPos(u.col, u.row);
        if (Math.abs(w.x - p.x) <= 14 && w.y <= p.y + 2 && w.y >= p.y - 34 && (!best || u.row > best.row)) best = u;
      }
      return best;
    }

    tap(sx, sy) {
      if (this.busy || ui.overlayOpen()) return;
      const w = this.worldAt(sx, sy), game = state.game;
      const tile = this.tileUnder(w);
      const touched = this.unitUnder(w) || (tile && R.unitAt(game, tile.col, tile.row));
      const sel = this.selected;
      if (sel && sel.owner === game.turn && this.myTurn()) {
        if (touched && this.targets.includes(touched)) return this.doAttack(sel, touched);
        const dest = tile && this.moves.get(R.key(tile.col, tile.row));
        if (dest && !(touched && touched.owner !== game.turn)) return this.doMove(sel, dest);
      }
      if (touched && touched !== sel && !this.isHidden(touched.col, touched.row)) return this.selectUnit(touched);
      // Tocar otra vez la tropa elegida enseña su casilla (por ejemplo, la ciudad donde está).
      if (sel && touched === sel) return this.showTile(M.tileAt(state.map, sel.col, sel.row));
      this.selectUnit(null);
      if (!tile || (sel && sel.tile === tile)) return;
      this.showTile(tile);
    }
  }

  // --- Guardado en el propio móvil -----------------------------------------
  function saveGame() {
    if (state.me !== null || (window.PEGame && window.PEGame.replaying)) return; // las online se guardan en el servidor
    const m = state.map;
    localSet(SAVE_KEY, JSON.stringify({ seed: m.seed, size: state.size, type: state.type, abundance: state.abundance,
      armies: state.armies, game: state.game }));
  }
  function loadGame() {
    try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); return s && s.game && s.game.roads && s.seed ? s : null; } catch (e) { return null; }
  }

  // --- Botones y textos (HTML encima del mapa) ----------------------------
  const $ = (id) => document.getElementById(id);
  const ui = {
    topHeight() { return $('topbar').offsetHeight; },
    bottomHeight() { return $('bottombar').offsetHeight; },
    overlayOpen() { return !$('ov-box').parentNode.hidden || !$('tech').hidden; },
    onMap(map) {
      $('code').textContent = map.seed;
      $('size').value = state.size;
      $('type').value = state.type;
      $('abundance').value = state.abundance;
      $('armies').value = state.armies;
      $('fog').classList.toggle('on', state.fog);
      ui.onTurn();
      if (state.me === null) try { history.replaceState(null, '', `?mapa=${map.seed}`); } catch (e) { /* nada */ }
    },
    onTurn() {
      const g = state.game, f = factionOf(g.turn);
      const chip = $('turn');
      chip.textContent = `Ronda ${g.round} · ${FACTION_NAMES[f]}` + (state.names ? ` (${state.names[g.turn]})` : '');
      chip.style.background = FACTION_COLORS[f];
      chip.style.color = f === 1 ? '#2b1d3a' : '#fff';
      ui.refreshRes();
      ui.setActions([]);
      if (state.me !== null && g.turn !== state.me && g.winner === null)
        ui.say(`Le toca a ${state.names[g.turn]} (${FACTION_NAMES[f]}). Puedes mirar el mapa mientras tanto.`);
      else ui.say('Toca una tropa para moverla, o una ciudad para reclutar.');
      $('end').disabled = state.me !== null && g.turn !== state.me;
    },
    // Oro y comida del jugador que juega, y lo que cobra cada turno.
    refreshRes() {
      const g = state.game, who = state.me === null ? g.turn : state.me, p = g.players[who], inc = R.playerIncome(g, state.map, who);
      $('gold').textContent = `Oro ${p.gold} (+${inc.oro})`;
      $('food').textContent = `Comida ${p.food} (+${inc.comida})`;
    },
    say(text) { $('info').textContent = text; },
    // Botones de acción: [{ label, onClick, disabled, main }]
    setActions(list) {
      const box = $('actions');
      if (!window.PEGame || !window.PEGame.myTurn()) list = []; // no es tu turno (o se está repitiendo el de otro)
      box.innerHTML = '';
      box.hidden = !list.length;
      for (const a of list) {
        const b = document.createElement('button');
        b.textContent = a.label;
        b.disabled = !!a.disabled;
        if (a.main) b.className = 'main';
        b.onclick = () => { if (!window.PEGame.busy) a.onClick(); };
        box.appendChild(b);
      }
    },
    onUnit(u) {
      const map = state.map, g = state.game, s = R.UNITS[u.type];
      const bonus = R.terrainDef(map, u, undefined, undefined, g);
      const t = M.tileAt(map, u.col, u.row);
      let txt = `${unitName(u)} · Vida ${u.hp}/${s.hp} · Ataque ${s.atk} · Defensa ${R.defenseOf(map, u, g)}`;
      if (bonus) txt += ` (${bonus > 0 ? '+' : ''}${bonus} por ${M.TERRAIN[t.terrain].label.toLowerCase()})`;
      if (R.fortBonus(g, u)) txt += ` (+${R.fortBonus(g, u)} por la fortificación)`;
      txt += ` · Mueve ${s.move}` + (s.range > 1 ? ` · Alcance ${s.range}` : '');
      txt += ` · Ve a ${R.visionOf(map, u)}`;
      txt += ` · ${R.CLASSES[s.cls].label}` + s.skills.map(k => ` · ${R.SKILLS[k].label}: ${R.SKILLS[k].text}`).join('');
      if (R.weak(u)) txt += ' · Herido: pega 1 menos';
      const actions = [], sc = window.PEGame;
      if (u.owner === g.turn) {
        const canMove = sc.moves && sc.moves.size, canHit = sc.targets && sc.targets.length;
        if (canMove && canHit) txt += '. Azul: moverse. Rojo: atacar.';
        else if (canMove) txt += '. Toca una casilla azul para moverte.';
        else if (canHit) txt += '. Toca un enemigo en rojo para atacar.';
        else if (!R.canDoSomething(g, map, u)) txt += '. Ya ha hecho todo este turno.';
        if (u.type === 'colono') {
          const problem = R.foundProblem(g, map, u);
          actions.push({ label: problem ? 'Fundar ciudad (aquí no se puede)' : 'Fundar ciudad aquí', main: !problem, onClick: () => sc.doFound(u) });
          const where = sc.foundSpots ? ' Las banderitas marcan dónde sí puedes fundar.'
            : sc.moves && sc.moves.size ? ' Aléjate más: hace falta una casilla sin dueño, con 2 casillas libres hasta tus otras ciudades.' : '';
          let head;
          if (!problem) head = 'Este colono puede fundar una ciudad aquí.';
          else if (u.acted) head = 'Este colono acaba de salir: podrá moverse y fundar en tu próximo turno.';
          else head = `Aquí no se puede fundar: ${problem}${where}`;
          txt = `${head} · ${txt}`;
        }
        if (R.has(u, 'sanador')) {
          const problem = R.blessProblem(g, map, u);
          actions.push({ label: 'Curar a los de al lado', main: !problem, disabled: !!problem, onClick: () => sc.doBless(u) });
          if (problem && !u.acted) txt += ` · ${problem}`;
        }
        if (u.hp < s.hp) {
          const problem = R.healProblem(g, map, u);
          actions.push({ label: `Curar +${R.healAmount(g, u)} (${R.ECON.healCost} comida)`, disabled: !!problem, onClick: () => sc.doHeal(u) });
          if (problem && !u.moved && !u.acted) txt += ` · ${problem}`;
        }
      }
      const c = R.cityAt(g, u.col, u.row);
      if (c) txt += ` · Está en ${cityName(c)}: toca otra vez para ver la ciudad.`;
      ui.setActions(actions);
      ui.say(txt);
    },
    onTile(t) {
      ui.setActions([]);
      if (!t) { ui.say('Toca una tropa para moverla, o una ciudad para reclutar.'); return; }
      if (t.hidden) { ui.say('Casilla sin explorar'); return; }
      const gm = state.game, map = state.map, city = R.cityAt(gm, t.col, t.row);
      if (city) { ui.onCity(city); return; }
      const g = R.GROUND[t.terrain];
      let txt = M.TERRAIN[t.terrain].label;
      if (!g.walk) txt += ' · Las tropas de tierra no pueden entrar';
      else {
        if (g.stop) txt += ' · Al entrar se acaba el movimiento';
        if (t.terrain === 'montana') txt += ' · Desde aquí se ve a 2 casillas';
        const parts = Object.values(R.CLASSES).map(c => { const b = c.terrain[t.terrain] || 0; return b ? `${c.label} ${b > 0 ? '+' : ''}${b}` : null; }).filter(Boolean);
        if (parts.length) txt += ` · Defensa: ${parts.join(', ')}`;
      }
      const b = gm.buildings[R.key(t.col, t.row)];
      if (gm.roads[R.key(t.col, t.row)]) txt += t.terrain === 'rio' ? ' · Puente' : ' · Camino';
      if (b) txt += ` · ${R.BUILDINGS[b].label}: ${R.givesText(R.buildingGives(gm, map, t))} por turno`;
      else if (t.resource) { const r = M.RESOURCE[t.resource]; txt += ` · ${r.label} (${r.kind})`; }
      const owner = R.ownerOfTile(gm, t.col, t.row);
      txt += owner ? ` · Territorio de ${cityName(owner)}` : ' · Sin dueño';
      const opt = R.buildOption(gm, map, t), actions = [];
      if (opt) {
        const bd = R.BUILDINGS[opt.type];
        const locked = bd.tech && !R.hasTech(gm, gm.turn, bd.tech);
        actions.push({ label: `${bd.label} (${bd.cost} oro)` + (locked ? ' 🔒' : ''), main: !opt.problem, disabled: !!opt.problem, onClick: () => window.PEGame.doBuild(t) });
        txt += ` · ${bd.label}: ${R.givesText(bd.gives)} por turno` + (bd.extra ? ` (${bd.extra})` : '');
        if (opt.problem) txt += ` · ${opt.problem}`;
      } else if (!b && owner && owner.owner === gm.turn && !R.buildingFor(t) && t.terrain !== 'mar' && t.terrain !== 'costa') {
        txt += ' · Aquí solo se puede hacer un camino';
      }
      if (R.canOfferRoad(gm, map, t)) {
        const problem = R.roadProblem(gm, map, t);
        actions.push({ label: `${t.terrain === 'rio' ? 'Puente' : 'Camino'} (${R.ECON.roadCost} oro)` + (R.hasTech(gm, gm.turn, 'caza') ? '' : ' 🔒'), disabled: !!problem, onClick: () => window.PEGame.doRoad(t) });
        if (problem && !opt) txt += ` · ${problem}`;
      }
      ui.setActions(actions);
      ui.say(txt);
    },
    // Ciudad: nivel, lo que produce y botones para reclutar.
    onCity(c) {
      const g = state.game, map = state.map, lvl = R.cityLevel(g, map, c), inc = R.cityIncome(g, map, c);
      const units = R.cityUnits(g, c).length, cap = R.cityCapacity(g, map, c);
      let txt = `${cityName(c)}${c.capital ? ' (capital)' : ''} de ${nameOf(c.owner)} · Nivel ${lvl}/${R.ECON.maxLevel}`;
      txt += ` · Da ${inc.oro} oro` + (inc.camino ? ` (${inc.camino} por caminos)` : '') + ` y ${inc.comida} comida por turno · Tropas ${units}/${cap}`;
      txt += ` · Edificios ${R.cityTiles(g, map, c).filter(t => g.buildings[R.key(t.col, t.row)]).length}`;
      if (c.fort) txt += ` · Fortificada (+${R.ECON.fortDefense} defensa)`;
      const occupier = R.unitAt(g, c.col, c.row);
      if (occupier && occupier.owner !== c.owner) txt += ` · ¡Ocupada por ${unitName(occupier)}! Si sigue aquí al empezar su turno, la conquista.`;
      if (c.owner === g.turn) {
        const sc = window.PEGame, E = R.ECON;
        const lvlProblem = R.levelUpProblem(g, map, c);
        if (lvlProblem && lvl < E.maxLevel) txt += ` · ${lvlProblem}`;
        const upgrades = [];
        if (lvl < E.maxLevel) upgrades.push({ label: `Subir a nivel ${lvl + 1} (${E.levelCost(lvl)} oro)`, main: !lvlProblem, disabled: !!lvlProblem, onClick: () => sc.doCity(c, 'nivel') });
        if (!c.expanded) upgrades.push({ label: `Ampliar territorio (${E.expandCost} oro)`, disabled: !!R.expandProblem(g, map, c), onClick: () => sc.doCity(c, 'ampliar') });
        if (!c.fort) upgrades.push({ label: `Fortificar (${E.fortCost} oro)` + (R.hasTech(g, c.owner, 'fortificacion') ? '' : ' 🔒'), disabled: !!R.fortProblem(g, map, c), onClick: () => sc.doCity(c, 'fortificar') });
        if (!c.expanded && lvl < E.expandLevel) txt += ` · Podrá ampliar su territorio al llegar a nivel ${E.expandLevel}.`;
        // Solo se enseñan las tropas que ya tienes (las demás salen al investigar).
        const list = R.RECRUITABLE.filter(type => !R.UNITS[type].tech || R.hasTech(g, c.owner, R.UNITS[type].tech)).map(type => {
          const problem = R.recruitProblem(g, map, c, type);
          return { label: `${R.UNITS[type].label} (${R.UNITS[type].cost} comida)`, disabled: !!problem, onClick: () => sc.doRecruit(c, type), problem };
        });
        const blocked = list.find(x => x.problem && !/comida/.test(x.problem));
        if (blocked) txt += ` · Reclutar: ${blocked.problem}`;
        ui.setActions(upgrades.concat(list));
      }
      ui.say(txt);
    },
    // --- Árbol de tecnologías ---------------------------------------------
    // Ves solo las tuyas. En tu turno puedes investigar; si no, solo mirar.
    showTechs(selected) {
      const g = state.game, who = state.me === null ? g.turn : state.me, p = g.players[who];
      const canAct = window.PEGame.myTurn() && g.turn === who && g.winner === null;
      const box = $('tech-box');
      const esc = (x) => String(x).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
      let html = `<h2>Tecnologías de ${esc(nameOf(who))}</h2><p class="small">Oro ${p.gold} · Tienes ${p.techs.length} de ${Object.keys(R.TECHS).length}.`
        + ' En cada rama se va en orden, y desde el nivel 2 hace falta una ciudad de ese nivel.</p>';
      for (const b of R.BRANCHES) {
        html += `<div class="tb"><h3>${b.label}</h3><div class="cards">`;
        for (const id of R.techsOfBranch(b.id)) {
          const t = R.TECHS[id], have = R.hasTech(g, who, id), problem = R.techProblem(g, who, id);
          const poorOnly = problem && /oro/.test(problem) && !/necesitas|antes/i.test(problem);
          const cls = have ? 'have' : !problem ? 'can' : poorOnly ? 'can poor' : '';
          const st = have ? '✓ Tuya' : (problem && !poorOnly ? '🔒 ' : '') + `${R.techCost(g, who, id)} oro`;
          html += `<button class="tc ${cls}${id === selected ? ' sel' : ''}" data-id="${id}"><b>${esc(t.label)}</b><span>Nivel ${t.level}</span><span class="st">${st}</span></button>`;
        }
        html += '</div></div>';
      }
      html += '<div id="tech-detail"></div>';
      box.innerHTML = html;
      const detail = $('tech-detail');
      const show = (id) => {
        let d = '';
        if (id) {
          const t = R.TECHS[id], have = R.hasTech(g, who, id), problem = R.techProblem(g, who, id);
          d = `<b>${esc(t.label)}</b> (${R.branchLabel(id)}, nivel ${t.level}): ${esc(t.text)}.` + (t.later ? ' <i>Esto llega más adelante en el juego.</i>' : '');
          if (have) d += '<br>✓ Ya la tienes.';
          else if (problem && (canAct || !/turno/.test(problem))) d += `<br>${esc(problem)}`;
          else if (!canAct) d += '<br>Podrás investigarla en tu turno.';
        } else d = 'Toca una tecnología para ver qué da.';
        d += '<div class="row">';
        if (id && canAct && !R.techProblem(g, who, id)) d += `<button class="main" id="tech-go">Investigar (${R.techCost(g, who, id)} oro)</button>`;
        d += '<button id="tech-close">Cerrar</button></div>';
        detail.innerHTML = d;
        $('tech-close').onclick = () => { $('tech').hidden = true; };
        if ($('tech-go')) $('tech-go').onclick = () => {
          if (window.PEGame.busy || !window.PEGame.doTech(id)) return;
          ui.showTechs(id);
          $('tech-detail').insertAdjacentHTML('afterbegin', `<div>¡Investigada ${esc(R.TECHS[id].label)}!</div>`);
          ui.say(`Has investigado ${R.TECHS[id].label}: ${R.TECHS[id].text}.`);
        };
      };
      box.querySelectorAll('.tc').forEach(el => { el.onclick = () => ui.showTechs(el.dataset.id); });
      show(selected);
      $('tech').hidden = false;
    },
    // Pantalla que tapa el mapa para pasar el móvil al otro jugador.
    showHandover(first) {
      const g = state.game, f = factionOf(g.turn);
      ui.onTurn();
      const news = (g.events || []).map(e => {
        if (e.kind === 'conquista') return `¡Has conquistado ${cityName(R.cityById(g, e.city))}!`;
        if (e.kind === 'eliminado') return `${nameOf(e.player)} ha perdido su última ciudad y queda eliminado.`;
        if (e.kind === 'cobro') return `Cobras ${e.oro} de oro y ${e.comida} de comida.`;
        return '';
      }).filter(Boolean).join(' ');
      // Aviso si hay enemigos dentro de una de tus ciudades.
      const danger = g.cities.filter(c => {
        const u = c.owner === g.turn && R.unitAt(g, c.col, c.row);
        return u && u.owner !== g.turn;
      }).map(cityName);
      const warn = danger.length ? ` ¡Cuidado: hay enemigos dentro de ${danger.join(' y ')}! Échalos o la perderás.` : '';
      ui.overlay(`Turno de ${FACTION_NAMES[f]}`,
        first ? `Nueva partida: ${PLAYERS.map(p => FACTION_NAMES[p]).join(' contra ')}. Cada uno empieza con su capital. Gana quien conquiste todas las ciudades enemigas. Empieza ${FACTION_NAMES[f]}.`
              : `Ronda ${g.round}. Pasa el móvil a ${FACTION_NAMES[f]}. ${news}${warn}`,
        'Empezar mi turno', FACTION_COLORS[f], () => window.PEGame.focusPlayer());
    },
    showWinner() {
      const g = state.game;
      const online = state.me !== null, again = online ? () => window.PEOnline.showList() : () => newGame();
      const label = online ? 'Volver a mis partidas' : 'Nueva partida';
      if (g.winner < 0) { ui.overlay('Empate', 'No queda ninguna ciudad en pie.', label, '#8a7a9a', again); return; }
      const f = factionOf(g.winner);
      ui.overlay(`¡Gana ${FACTION_NAMES[f]}${online ? ` (${state.names[g.winner]})` : ''}!`, `Ha conquistado todas las ciudades enemigas en ${g.round} rondas.`,
        label, FACTION_COLORS[f], again, true);
    },
    // Ventana encima del mapa. opts: { cancel: 'texto', onCancel, input: 'valor inicial', keepMap }
    overlay(title, text, button, color, onClose, keepMap, opts = {}) {
      const o = $('ov-box').parentNode, input = $('ov-input'), cancel = $('ov-cancel');
      $('ov-title').textContent = title;
      $('ov-title').style.color = color;
      $('ov-text').textContent = text;
      $('ov-btn').textContent = button;
      $('ov-btn').style.background = color;
      input.hidden = opts.input === undefined;
      input.value = opts.input || '';
      cancel.hidden = !opts.cancel;
      cancel.textContent = opts.cancel || '';
      o.classList.toggle('see-through', !!keepMap);
      o.hidden = false;
      $('ov-btn').onclick = () => { o.hidden = true; if (onClose) onClose(input.value); };
      cancel.onclick = () => { o.hidden = true; if (opts.onCancel) opts.onCancel(); };
      if (!input.hidden) input.focus();
    },
    // Pregunta antes de tirar una partida a medias (sin las ventanas del navegador).
    confirmNew(onYes, onNo) {
      if (!inProgress()) { onYes(); return; }
      ui.overlay('¿Partida nueva?', 'Se pierde la partida que está a medias.', 'Sí, empezar otra', '#b0402f',
        onYes, true, { cancel: 'Seguir con esta', onCancel: onNo });
    },
  };

  function inProgress() {
    const g = state.game;
    return g && g.winner === null && (g.round > 1 || g.turn > 0 || g.units.some(u => u.moved || u.acted));
  }
  function newGame(seed, ask) {
    const go = () => window.PEGame.startGame({ seed });
    if (ask) ui.confirmNew(go, () => ui.onMap(state.map)); else go();
  }
  // Cambiar un menú empieza otra partida: si hay una a medias, se pregunta antes.
  function onMenu(field, keepSeed) {
    return (e) => {
      const old = state[field], value = e.target.value;
      ui.confirmNew(() => {
        state[field] = value;
        localSet('pe.' + field, value);
        window.PEGame.startGame(keepSeed ? { seed: state.map.seed } : {});
      }, () => { state[field] = old; ui.onMap(state.map); });
    };
  }

  function wireUi() {
    $('new').onclick = () => newGame(undefined, true);
    $('size').onchange = onMenu('size', false);
    $('type').onchange = onMenu('type', false);
    $('abundance').onchange = onMenu('abundance', true);
    $('armies').onchange = onMenu('armies', true);
    $('fog').onclick = () => { state.fog = !state.fog; $('fog').classList.toggle('on', state.fog); window.PEGame.selectUnit(null); window.PEGame.applyFog(); };
    $('end').onclick = () => window.PEGame.endTurn();
    $('techs').onclick = () => { if (state.game && !(window.PEGame && window.PEGame.replaying)) ui.showTechs(); };
    $('code').onclick = () => {
      ui.overlay('Código de mapa', 'Escribe el código de un mapa para jugar en él. Empieza una partida nueva.', 'Jugar en ese mapa', '#4a3563',
        (c) => { if (c && c.trim()) window.PEGame.startGame({ seed: c.trim().toUpperCase().slice(0, 12) }); },
        true, { input: state.map.seed, cancel: 'Cancelar' });
    };
    for (const [k, v] of Object.entries(M.SIZES)) $('size').add(new Option(`${v.label} (${2 * v.radius + 1})`, k));
    for (const [k, v] of Object.entries(M.MAP_TYPES)) $('type').add(new Option(v.label, k));
    for (const [k, v] of Object.entries(M.ABUNDANCE)) $('abundance').add(new Option(v.label, k));
    $('armies').add(new Option('Prueba: todo cerca', 'prueba'));
    $('armies').add(new Option('Real: 1 miliciano', 'real'));
  }

  window.PEUI = ui;
  window.PEFactions = { names: FACTION_NAMES, colors: FACTION_COLORS };
  window.addEventListener('load', () => {
    wireUi();
    new Phaser.Game({
      type: Phaser.AUTO,
      parent: 'game',
      pixelArt: true,
      backgroundColor: '#1b2f4f',
      scale: { mode: Phaser.Scale.NONE, width: window.innerWidth * DPR, height: window.innerHeight * DPR, zoom: 1 / DPR },
      scene: [MapScene],
      banner: false,
    });
  });
})();
