// Pixel Enemies - pantalla del mapa (Phaser 3).
(function () {
  'use strict';
  const T = window.PETiles, M = window.PEMap;
  const FACTION_COLORS = ['#d23b3b', '#e8c021', '#3b6fd2', '#3fa34d', '#8e4bc4', '#ee8a2a'];
  const FACTION_NAMES = ['Hondarribia', 'Irun', 'Donosti', 'Lekumberri', 'Alli', 'Leitza'];
  const RELIEF = true; // casillas con un poco de relieve, como una maqueta
  const DPR = Math.min(3, window.devicePixelRatio || 1); // más resolución en pantallas nítidas

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
      window.addEventListener('resize', () => {
        this.scale.resize(window.innerWidth * DPR, window.innerHeight * DPR);
        this.scale.setZoom(1 / DPR);
        this.fitCamera();
      });
      window.PEGame = this;
      this.newMap(new URLSearchParams(location.search).get('mapa') || undefined);
    }

    makeTextures() {
      const combos = { llanura: ['trigo'], bosque: ['caza', 'lena'], montana: ['mineral'],
        costa: ['pesca'], rio: ['pesca'], mar: [] };
      for (const terrain of Object.keys(M.TERRAIN).filter(k => k !== 'rio'))
        for (const res of [null, ...combos[terrain]])
          for (let v = 0; v < T.VARIANTS; v++)
            this.addTex(`t_${terrain}_${res || 'nada'}_${v}`, T.makeTerrainCanvas(terrain, res, v));
      FACTION_COLORS.forEach((c, i) => this.addTex(`flag_${i}`, T.makeFlagCanvas(c)));
      this.addTex('fog', T.makeFogCanvas());
      this.addTex('select', T.makeOutlineCanvas('#fff6c8'));
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

    newMap(seed) {
      if (this.layer) this.layer.destroy(true);
      this.selected = null;
      const map = M.generate({ seed, size: state.size, type: state.type, abundance: state.abundance });
      state.map = map;
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
      map.starts.forEach((s, i) => {
        const o = T.tileOrigin(s.col, s.row);
        const f = this.add.image(o.x + T.W / 2 + 4, o.y + T.TOP + T.H / 2 - 8, `flag_${i}`).setDepth(s.row + 0.7);
        this.layer.add(f);
        this.decor[map.index[s.row * map.cols + s.col]].push(f);
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

    applyFog() {
      const map = state.map, me = map.starts[0];
      map.tiles.forEach((t, i) => {
        const hidden = state.fog && me && M.distance(t.col, t.row, me.col, me.row) > 2;
        // Con niebla, la casilla se ve oscura y sin nada encima.
        this.tileImgs[i].setTexture(hidden ? 'fog' : this.texOf(t));
        this.tileImgs[i].setDepth(M.TERRAIN[t.terrain].water && !hidden ? t.row - 1000 : t.row);
        this.decor[i].forEach(d => d.setVisible(!hidden));
        t.hidden = hidden;
      });
      this.layer.sort('depth');
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
    topHeight() { return $('topbar').offsetHeight; },
    bottomHeight() { return $('bottombar').offsetHeight; },
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
      if (t.resource) { const r = M.RESOURCE[t.resource]; txt += ` · ${r.label} (${r.kind}). Se puede construir: ${r.build}`; }
      else if (t.terrain === 'montana') txt += ' · Se puede construir: Cantera (oro)';
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
    for (const [k, v] of Object.entries(M.SIZES)) $('size').add(new Option(`${v.label} (${2 * v.radius + 1} de ancho)`, k));
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
      scale: { mode: Phaser.Scale.NONE, width: window.innerWidth * DPR, height: window.innerHeight * DPR, zoom: 1 / DPR },
      scene: [MapScene],
      banner: false,
    });
  });
})();
