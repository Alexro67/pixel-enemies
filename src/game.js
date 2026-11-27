// Pixel Enemies - pantalla de juego (Phaser 3): mapa, tropas y turnos.
(function () {
  'use strict';
  const T = window.PETiles, M = window.PEMap, R = window.PERules, U = window.PEUnits;
  const FACTION_COLORS = ['#d23b3b', '#e8c021', '#3b6fd2', '#3fa34d', '#8e4bc4', '#ee8a2a'];
  const FACTION_NAMES = ['Hondarribia', 'Irun', 'Donosti', 'Lekumberri', 'Alli', 'Leitza'];
  const PLAYERS = [0, 1];       // de momento: Hondarribia contra Irun, en el mismo móvil
  const RELIEF = true;          // casillas con un poco de relieve, como una maqueta
  const DPR = Math.min(3, window.devicePixelRatio || 1); // más resolución en pantallas nítidas
  const SAVE_KEY = 'pe.partida';

  const state = {
    size: localGet('pe.size', 'pequeno'),
    type: localGet('pe.type', 'costas'),
    abundance: localGet('pe.abundance', 'normal'),
    armies: ({ cerca: 'prueba', lejos: 'real' })[localGet('pe.armies', 'prueba')] || localGet('pe.armies', 'prueba'),
    fog: false,
    map: null,
    game: null,
  };
  window.PEState = state; // para pruebas desde la consola
  function localGet(k, d) { try { return localStorage.getItem(k) || d; } catch (e) { return d; } }
  function localSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sin guardado */ } }
  const factionOf = (owner) => state.game.players[owner].faction;
  const nameOf = (owner) => FACTION_NAMES[factionOf(owner)];
  const unitName = (u) => `${R.UNITS[u.type].label} de ${nameOf(u.owner)}`;

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
      if (saved.game) {
        state.size = saved.size; state.type = saved.type; state.abundance = saved.abundance; state.armies = ({ cerca: 'prueba', lejos: 'real' })[saved.armies] || saved.armies;
      }
      const map = M.generate({ seed: saved.seed, size: state.size, type: state.type, abundance: state.abundance, players: PLAYERS.length });
      state.map = map;
      state.game = saved.game || R.newGame({ map, players: PLAYERS, close: state.armies === 'prueba', army: state.armies });
      this.drawMap();
      this.drawUnits();
      this.applyFog();
      this.fitCamera();
      ui.onMap(map);
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
        const key = `t_rio_${t.resource || 'nada'}_${variant(t)}_${open}`;
        if (!this.textures.exists(key)) this.addTex(key, T.makeTerrainCanvas('rio', t.resource, variant(t), open));
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
      // Banderas de salida (donde irá la capital). En la prueba de tropas no se ponen, para no liar.
      if (state.armies !== 'prueba') map.starts.forEach((s, i) => {
        const o = T.tileOrigin(s.col, s.row);
        const f = this.add.image(o.x + T.W / 2 + 4, o.y + T.TOP + T.H / 2 - 8, `flag_${PLAYERS[i]}`).setDepth(s.row + 0.7);
        this.layer.add(f);
        this.decor[map.index[s.row * map.cols + s.col]].push(f);
      });
      this.hlLayer = [];
      this.selectImg = this.add.image(0, 0, 'select').setOrigin(0, 0).setVisible(false).setDepth(999);
      this.layer.add(this.selectImg);
      this.unitViews = new Map();
      this.layer.sort('depth');

      this.texOf = tex;
      this.worldW = map.cols * T.COL_STEP + T.COL_STEP / 2;
      this.worldH = (map.rows - 1) * T.ROW_STEP + T.TH;
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
      const mine = game.units.filter(u => u.owner === game.turn);
      map.tiles.forEach((t, i) => {
        const hidden = state.fog && !mine.some(u => M.distance(t.col, t.row, u.col, u.row) <= R.visionOf(map, u));
        this.tileImgs[i].setTexture(hidden ? 'fog' : this.texOf(t));
        this.tileImgs[i].setDepth(M.TERRAIN[t.terrain].water && !hidden ? t.row - 1000 : t.row);
        this.decor[i].forEach(d => d.setVisible(!hidden));
        t.hidden = hidden;
      });
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
      const path = R.move(state.game, state.map, u, dest.col, dest.row);
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
      const result = R.attack(state.game, state.map, att, def);
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
      const canLeave = att.hp > 0 && state.game.winner === null && R.reachable(state.game, state.map, att).size > 0;
      this.selectUnit(canLeave ? att : null);
      let msg = `${unitName(att)} ataca al ${unitName(def)} y le quita ${result.dealt}.`;
      if (result.kills) msg += ' ¡Lo elimina!';
      else if (result.back) msg += ` Contraataque: le devuelve ${result.back}` + (result.dies ? ' y lo elimina.' : '.');
      if (canLeave) msg += ' Aún puede moverse.';
      ui.say(msg);
      if (state.game.winner !== null) ui.showWinner();
    }
    // Un golpe: el atacante se lanza (o dispara una flecha) y sale el daño flotando.
    async strike(from, to, ranged, dmg) {
      if (ranged) {
        const a = this.add.image(from.x, from.y - 18, 'arrow').setDepth(9999);
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
    tween(cfg) { return new Promise(res => this.tweens.add({ ...cfg, onComplete: () => res() })); }
    wait(ms) { return new Promise(res => this.time.delayedCall(ms, res)); }

    endTurn() {
      if (this.busy || state.game.winner !== null) return;
      R.endTurn(state.game);
      this.selectUnit(null);
      this.applyFog();
      saveGame();
      ui.showHandover(false);
    }
    // Al empezar un turno, la cámara va hacia las tropas del jugador.
    focusPlayer() {
      const mine = state.game.units.filter(u => u.owner === state.game.turn);
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
      if (sel && sel.owner === game.turn) {
        if (touched && this.targets.includes(touched)) return this.doAttack(sel, touched);
        const dest = tile && this.moves.get(R.key(tile.col, tile.row));
        if (dest && !(touched && touched.owner !== game.turn)) return this.doMove(sel, dest);
      }
      if (touched && touched !== sel && !this.isHidden(touched.col, touched.row)) return this.selectUnit(touched);
      this.selectUnit(null);
      if (!tile || (sel && touched === sel) || (sel && sel.tile === tile)) return;
      this.selected = { tile };
      this.selectTile(tile);
      ui.onTile(tile);
    }
  }

  // --- Guardado en el propio móvil -----------------------------------------
  function saveGame() {
    const m = state.map;
    localSet(SAVE_KEY, JSON.stringify({ seed: m.seed, size: state.size, type: state.type, abundance: state.abundance,
      armies: state.armies, game: state.game }));
  }
  function loadGame() {
    try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); return s && s.game && s.seed ? s : null; } catch (e) { return null; }
  }

  // --- Botones y textos (HTML encima del mapa) ----------------------------
  const $ = (id) => document.getElementById(id);
  const ui = {
    topHeight() { return $('topbar').offsetHeight; },
    bottomHeight() { return $('bottombar').offsetHeight; },
    overlayOpen() { return !$('ov-box').parentNode.hidden; },
    onMap(map) {
      $('code').textContent = map.seed;
      $('size').value = state.size;
      $('type').value = state.type;
      $('abundance').value = state.abundance;
      $('armies').value = state.armies;
      $('fog').classList.toggle('on', state.fog);
      ui.onTurn();
      try { history.replaceState(null, '', `?mapa=${map.seed}`); } catch (e) { /* nada */ }
    },
    onTurn() {
      const g = state.game, f = factionOf(g.turn);
      const chip = $('turn');
      chip.textContent = `Ronda ${g.round} · ${FACTION_NAMES[f]}`;
      chip.style.background = FACTION_COLORS[f];
      chip.style.color = f === 1 ? '#2b1d3a' : '#fff';
      ui.say('Toca una de tus tropas para ver a dónde puede ir.');
    },
    say(text) { $('info').textContent = text; },
    onUnit(u) {
      const map = state.map, g = state.game, s = R.UNITS[u.type];
      const bonus = R.terrainDef(map, u, undefined, undefined, g);
      const t = M.tileAt(map, u.col, u.row);
      let txt = `${unitName(u)} · Vida ${u.hp}/${s.hp} · Ataque ${s.atk} · Defensa ${R.defenseOf(map, u, g)}`;
      if (bonus) txt += ` (${bonus > 0 ? '+' : ''}${bonus} por ${M.TERRAIN[t.terrain].label.toLowerCase()})`;
      txt += ` · Mueve ${s.move}` + (s.range > 1 ? ` · Alcance ${s.range}` : '');
      txt += ` · Ve a ${R.visionOf(map, u)}`;
      txt += ` · ${R.CLASSES[s.cls].label}` + s.skills.map(k => ` · ${R.SKILLS[k].label}: ${R.SKILLS[k].text}`).join('');
      if (R.weak(u)) txt += ' · Herido: pega 1 menos';
      if (u.owner === g.turn) {
        const sc = window.PEGame, canMove = sc.moves && sc.moves.size, canHit = sc.targets && sc.targets.length;
        if (canMove && canHit) txt += '. Azul: moverse. Rojo: atacar.';
        else if (canMove) txt += '. Toca una casilla azul para moverte.';
        else if (canHit) txt += '. Toca un enemigo en rojo para atacar.';
        else txt += '. Ya ha hecho todo este turno.';
      }
      ui.say(txt);
    },
    onTile(t) {
      if (!t) { ui.say('Toca una de tus tropas para ver a dónde puede ir.'); return; }
      if (t.hidden) { ui.say('Casilla sin explorar'); return; }
      const g = R.GROUND[t.terrain];
      let txt = M.TERRAIN[t.terrain].label;
      if (!g.walk) txt += ' · Las tropas de tierra no pueden entrar';
      else {
        if (g.stop) txt += ' · Al entrar se acaba el movimiento';
        if (t.terrain === 'montana') txt += ' · Desde aquí se ve a 2 casillas';
        const parts = Object.values(R.CLASSES).map(c => { const b = c.terrain[t.terrain] || 0; return b ? `${c.label} ${b > 0 ? '+' : ''}${b}` : null; }).filter(Boolean);
        if (parts.length) txt += ` · Defensa: ${parts.join(', ')}`;
      }
      if (t.resource) { const r = M.RESOURCE[t.resource]; txt += ` · ${r.label} (${r.kind})`; }
      ui.say(txt);
    },
    // Pantalla que tapa el mapa para pasar el móvil al otro jugador.
    showHandover(first) {
      const g = state.game, f = factionOf(g.turn);
      ui.onTurn();
      ui.overlay(`Turno de ${FACTION_NAMES[f]}`,
        first ? `Nueva partida: ${PLAYERS.map(p => FACTION_NAMES[p]).join(' contra ')}. Empieza ${FACTION_NAMES[f]}.`
              : `Ronda ${g.round}. Pasa el móvil a ${FACTION_NAMES[f]}.`,
        'Empezar mi turno', FACTION_COLORS[f], () => window.PEGame.focusPlayer());
    },
    showWinner() {
      const g = state.game;
      if (g.winner < 0) { ui.overlay('Empate', 'No queda ninguna tropa en pie.', 'Nueva partida', '#8a7a9a', () => newGame()); return; }
      const f = factionOf(g.winner);
      ui.overlay(`¡Gana ${FACTION_NAMES[f]}!`, `Ha eliminado todas las tropas enemigas en ${g.round} rondas.`,
        'Nueva partida', FACTION_COLORS[f], () => newGame(), true);
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
    $('code').onclick = () => {
      ui.overlay('Código de mapa', 'Escribe el código de un mapa para jugar en él. Empieza una partida nueva.', 'Jugar en ese mapa', '#4a3563',
        (c) => { if (c && c.trim()) window.PEGame.startGame({ seed: c.trim().toUpperCase().slice(0, 12) }); },
        true, { input: state.map.seed, cancel: 'Cancelar' });
    };
    for (const [k, v] of Object.entries(M.SIZES)) $('size').add(new Option(`${v.label} (${2 * v.radius + 1})`, k));
    for (const [k, v] of Object.entries(M.MAP_TYPES)) $('type').add(new Option(v.label, k));
    for (const [k, v] of Object.entries(M.ABUNDANCE)) $('abundance').add(new Option(v.label, k));
    $('armies').add(new Option('Prueba: 3 tropas cerca', 'prueba'));
    $('armies').add(new Option('Real: 1 miliciano', 'real'));
  }

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
