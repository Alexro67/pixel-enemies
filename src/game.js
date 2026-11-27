// Pixel Enemies - pantalla del mapa (Phaser 3).
(function () {
  'use strict';
  const T = window.PETiles, M = window.PEMap;
  const FACTION_COLORS = ['#d23b3b', '#e8c021', '#3b6fd2', '#3fa34d', '#8e4bc4', '#ee8a2a'];
  const FACTION_NAMES = ['Hondarribia', 'Irun', 'Donosti', 'Lekumberri', 'Alli', 'Leitza'];
  const RELIEF = true; // casillas con un poco de relieve, como una maqueta

  const state = {
    size: localGet('pe.size', 'mediano'),
    type: localGet('pe.type', 'costas'),
    abundance: localGet('pe.abundance', 'normal'),
    fog: false,
    map: null,
  };
  function localGet(k, d) { try { return localStorage.getItem(k) || d; } catch (e) { return d; } }
  function localSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sin guardado */ } }

  class MapScene extends Phaser.Scene {
    constructor() { super('map'); }

    create() {
      this.makeTextures();
      this.cameras.main.setBackgroundColor('#1b2f4f');
      this.input.addPointer(2);
      this.setupControls();
      this.scale.on('resize', () => this.fitCamera());
      window.PEGame = this;
      this.newMap(new URLSearchParams(location.search).get('mapa') || undefined);
    }

    makeTextures() {
      for (const terrain of Object.keys(M.TERRAIN))
        for (let v = 0; v < T.VARIANTS; v++)
          this.textures.addCanvas(`t_${terrain}_${v}`, T.makeTerrainCanvas(terrain, v, RELIEF));
      for (const res of Object.keys(M.RESOURCE)) this.textures.addCanvas(`r_${res}`, T.makeResourceCanvas(res));
      FACTION_COLORS.forEach((c, i) => this.textures.addCanvas(`flag_${i}`, T.makeFlagCanvas(c)));
      this.textures.addCanvas('fog', T.makeFogCanvas());
      this.textures.addCanvas('select', T.makeOutlineCanvas('#fff6c8'));
    }

    newMap(seed) {
      if (this.layer) this.layer.destroy(true);
      this.selected = null;
      const map = M.generate({ seed, size: state.size, type: state.type, abundance: state.abundance });
      state.map = map;
      this.layer = this.add.container(0, 0);
      this.tileObjs = [];
      this.tileImgs = [];
      this.decor = [];
      const tex = (t) => `t_${t.terrain}_${(t.col * 7 + t.row * 13) % T.VARIANTS}`;

      for (const t of map.tiles) {
        const o = T.tileOrigin(t.col, t.row);
        const img = this.add.image(o.x, o.y, tex(t)).setOrigin(0, 0);
        img.setDepth(t.row);
        this.layer.add(img);
        this.tileImgs.push(img);
        const decor = [];
        this.decor.push(decor);
        if (t.terrain === 'rio') { const g = this.drawRiver(map, t, o); this.layer.add(g); decor.push(g); }
        if (t.resource) {
          const water = M.TERRAIN[t.terrain].water;
          const r = this.add.image(o.x + T.W / 2, o.y + T.TOP + T.H / 2 + (water && RELIEF ? T.WATER_DROP : 0) + 4,
            `r_${t.resource}`).setDepth(t.row + 0.6);
          this.layer.add(r);
          decor.push(r);
        }
      }
      map.starts.forEach((s, i) => {
        const o = T.tileOrigin(s.col, s.row);
        const f = this.add.image(o.x + T.W / 2 + 1, o.y + T.TOP + T.H / 2 - 6, `flag_${i}`).setDepth(s.row + 0.7);
        this.layer.add(f);
        this.decor[s.row * map.cols + s.col].push(f);
      });
      this.selectImg = this.add.image(0, 0, 'select').setOrigin(0, 0).setVisible(false).setDepth(999);
      this.layer.add(this.selectImg);
      this.layer.sort('depth');

      this.texOf = tex;
      this.worldW = map.cols * T.COL_STEP + T.COL_STEP / 2;
      this.worldH = (map.rows - 1) * T.ROW_STEP + T.TH;
      this.applyFog();
      this.fitCamera();
      ui.onMap(map);
    }

    drawRiver(map, t, o) {
      const g = this.add.graphics().setDepth(t.row + 0.5);
      const cx = o.x + T.W / 2, cy = o.y + T.TOP + T.H / 2;
      const targets = M.neighbors(t.col, t.row, map.cols, map.rows)
        .map(([c, r]) => map.tiles[r * map.cols + c])
        .filter(n => n.terrain === 'rio' || M.TERRAIN[n.terrain].water);
      g.fillStyle(0x3d8fd0, 1);
      for (const n of targets) {
        const no = T.tileOrigin(n.col, n.row);
        const nx = no.x + T.W / 2, ny = no.y + T.TOP + T.H / 2;
        const ex = (cx + nx) / 2, ey = (cy + ny) / 2;
        // Tramo pixelado del centro al borde.
        const steps = 12;
        for (let i = 0; i <= steps; i++) {
          const x = Math.round(cx + (ex - cx) * i / steps), y = Math.round(cy + (ey - cy) * i / steps);
          g.fillRect(x - 2, y - 2, 4, 4);
        }
      }
      g.fillStyle(0x6db3e0, 1);
      g.fillRect(Math.round(cx) - 1, Math.round(cy) - 1, 2, 2);
      return g;
    }

    applyFog() {
      const map = state.map, me = map.starts[0];
      map.tiles.forEach((t, i) => {
        const hidden = state.fog && me && M.distance(t.col, t.row, me.col, me.row) > 2;
        // Con niebla, la casilla se ve oscura y sin nada encima.
        this.tileImgs[i].setTexture(hidden ? 'fog' : this.texOf(t));
        this.decor[i].forEach(d => d.setVisible(!hidden));
        t.hidden = hidden;
      });
    }

    // --- Cámara: mover con un dedo, zoom con dos dedos o la rueda ---------
    fitCamera() {
      const cam = this.cameras.main;
      const w = this.scale.width, h = this.scale.height - ui.barHeight();
      this.minZoom = Math.min(w / this.worldW, h / this.worldH) * 0.9;
      this.maxZoom = Math.max(6, this.minZoom * 4);
      cam.setZoom(this.minZoom);
      cam.centerOn(this.worldW / 2, this.worldH / 2 + ui.barHeight() / 2 / this.minZoom);
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
          if (tapStart && Math.hypot(p.x - tapStart.x, p.y - tapStart.y) > 10) tapStart = null;
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

    tap(sx, sy) {
      const w = this.worldAt(sx, sy), map = state.map;
      let hit = null;
      for (const t of map.tiles) {
        const o = T.tileOrigin(t.col, t.row);
        const lower = M.TERRAIN[t.terrain].water && RELIEF ? T.WATER_DROP : 0;
        if (T.insideHex(Math.floor(w.x - o.x), Math.floor(w.y - o.y - T.TOP - lower))) { hit = t; }
      }
      if (!hit || hit === this.selected) { this.selected = null; this.selectImg.setVisible(false); ui.onTile(null); return; }
      this.selected = hit;
      const o = T.tileOrigin(hit.col, hit.row);
      const lower = M.TERRAIN[hit.terrain].water && RELIEF ? T.WATER_DROP : 0;
      this.selectImg.setPosition(o.x, o.y + lower).setVisible(true);
      const startIdx = map.starts.findIndex(s => s.col === hit.col && s.row === hit.row);
      ui.onTile(hit, startIdx);
    }
  }

  // --- Botones y textos (HTML encima del mapa) ----------------------------
  const $ = (id) => document.getElementById(id);
  const ui = {
    barHeight() { return $('topbar').offsetHeight; },
    onMap(map) {
      $('code').textContent = map.seed;
      $('size').value = state.size;
      $('type').value = state.type;
      $('abundance').value = state.abundance;
      $('fog').classList.toggle('on', state.fog);
      ui.onTile(null);
      try { history.replaceState(null, '', `?mapa=${map.seed}`); } catch (e) { /* nada */ }
    },
    onTile(t, startIdx) {
      const el = $('info');
      if (!t) { el.textContent = 'Toca una casilla para ver qué hay. Arrastra para moverte; pellizca para el zoom.'; return; }
      if (t.hidden) { el.textContent = 'Casilla sin explorar'; return; }
      const terr = M.TERRAIN[t.terrain].label;
      let txt = terr;
      if (t.resource) { const r = M.RESOURCE[t.resource]; txt += ` · ${r.label} (da ${r.kind})`; }
      if (startIdx >= 0) txt += ` · Salida de ${FACTION_NAMES[startIdx]}`;
      el.textContent = txt;
    },
  };

  function wireUi() {
    $('new').onclick = () => window.PEGame.newMap();
    $('size').onchange = (e) => { state.size = e.target.value; localSet('pe.size', state.size); window.PEGame.newMap(); };
    $('type').onchange = (e) => { state.type = e.target.value; localSet('pe.type', state.type); window.PEGame.newMap(); };
    $('abundance').onchange = (e) => { state.abundance = e.target.value; localSet('pe.abundance', state.abundance); window.PEGame.newMap(state.map.seed); };
    $('fog').onclick = () => { state.fog = !state.fog; $('fog').classList.toggle('on', state.fog); window.PEGame.applyFog(); };
    $('code').onclick = () => {
      const c = window.prompt('Escribe un código de mapa para repetirlo:', state.map.seed);
      if (c && c.trim()) window.PEGame.newMap(c.trim().toUpperCase().slice(0, 12));
    };
    for (const [k, v] of Object.entries(M.SIZES)) $('size').add(new Option(`${v.label} ${v.cols}×${v.rows}`, k));
    for (const [k, v] of Object.entries(M.MAP_TYPES)) $('type').add(new Option(v.label, k));
    for (const [k, v] of Object.entries(M.ABUNDANCE)) $('abundance').add(new Option(v.label, k));
  }

  window.addEventListener('load', () => {
    wireUi();
    new Phaser.Game({
      type: Phaser.AUTO,
      parent: 'game',
      pixelArt: true,
      backgroundColor: '#1b2f4f',
      scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
      scene: [MapScene],
      banner: false,
    });
  });
})();
