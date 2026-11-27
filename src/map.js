// Pixel Enemies - generador del mapa de hexágonos.
// No depende de Phaser: con el mismo código de mapa (semilla) sale siempre el mismo mapa,
// así todos los jugadores de una partida verán exactamente lo mismo.
(function (root) {
  'use strict';

  // --- Opciones (se ajustan aquí) ----------------------------------------
  const SIZES = {
    pequeno: { cols: 12, rows: 12, players: 2, label: 'Pequeño' },
    mediano: { cols: 16, rows: 16, players: 4, label: 'Mediano' },
    grande:  { cols: 20, rows: 20, players: 6, label: 'Grande' },
  };
  // land = parte del mapa que es tierra; freq = lo "troceada" que sale la tierra.
  const MAP_TYPES = {
    continente: { land: 0.66, freq: 1.6, edge: 0.9, label: 'Continente' },
    costas:     { land: 0.50, freq: 2.2, edge: 0.7, label: 'Costas' },
    islas:      { land: 0.38, freq: 3.0, edge: 0.3, islands: true, label: 'Islas' },
  };
  // Probabilidad de que una casilla útil tenga recurso ("normal" = unos 2 por ciudad).
  const ABUNDANCE = {
    escasos:    { chance: 0.17, label: 'Pocos recursos' },
    normal:     { chance: 0.30, label: 'Recursos normal' },
    abundantes: { chance: 0.45, label: 'Muchos recursos' },
  };

  const TERRAIN = {
    mar:      { label: 'Mar', water: true },
    costa:    { label: 'Costa', water: true },
    llanura:  { label: 'Llanura' },
    bosque:   { label: 'Bosque' },
    montana:  { label: 'Montaña' },
    rio:      { label: 'Río' },
  };
  const RESOURCE = {
    caza:    { label: 'Caza', kind: 'comida' },
    pesca:   { label: 'Pesca', kind: 'comida' },
    trigo:   { label: 'Trigo', kind: 'comida' },
    mineral: { label: 'Mineral', kind: 'oro' },
    cantera: { label: 'Cantera', kind: 'oro' },
    lena:    { label: 'Leña', kind: 'oro' },
  };

  // --- Azar con semilla ---------------------------------------------------
  function hashString(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return (h >>> 0);
  }
  function makeRng(seed) {
    let a = hashString(String(seed));
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  function randomCode() {
    let s = '';
    for (let i = 0; i < 6; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    return s;
  }

  // Ruido suave: una rejilla de valores al azar interpolada, en varias capas.
  function makeNoise(rng) {
    const N = 64, grid = new Float32Array(N * N);
    for (let i = 0; i < grid.length; i++) grid[i] = rng();
    const ox = rng() * 32, oy = rng() * 32;
    const v = (x, y) => grid[((y % N + N) % N) * N + ((x % N + N) % N)];
    const smooth = t => t * t * (3 - 2 * t);
    function base(x, y) {
      x += ox; y += oy;
      const xi = Math.floor(x), yi = Math.floor(y);
      const tx = smooth(x - xi), ty = smooth(y - yi);
      const a = v(xi, yi), b = v(xi + 1, yi), c = v(xi, yi + 1), d = v(xi + 1, yi + 1);
      return (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty;
    }
    return function (x, y) {
      let sum = 0, amp = 1, f = 1, norm = 0;
      for (let o = 0; o < 4; o++) { sum += base(x * f, y * f) * amp; norm += amp; amp *= 0.5; f *= 2; }
      return sum / norm;
    };
  }

  // --- Geometría de hexágonos (filas desplazadas, punta arriba) ----------
  function neighbors(col, row, cols, rows) {
    const odd = row & 1;
    const d = odd
      ? [[1, 0], [-1, 0], [0, -1], [1, -1], [0, 1], [1, 1]]
      : [[1, 0], [-1, 0], [-1, -1], [0, -1], [-1, 1], [0, 1]];
    const out = [];
    for (const [dc, dr] of d) {
      const c = col + dc, r = row + dr;
      if (c >= 0 && c < cols && r >= 0 && r < rows) out.push([c, r]);
    }
    return out;
  }
  function toCube(col, row) {
    const x = col - (row - (row & 1)) / 2;
    return [x, row, -x - row];
  }
  function distance(c1, r1, c2, r2) {
    const a = toCube(c1, r1), b = toCube(c2, r2);
    return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
  }

  // --- Generación ----------------------------------------------------------
  function generate(opts) {
    const size = SIZES[opts.size] || SIZES.mediano;
    const type = MAP_TYPES[opts.type] || MAP_TYPES.costas;
    const seed = String(opts.seed || randomCode()).toUpperCase();
    const abundance = ABUNDANCE[opts.abundance] || ABUNDANCE.normal;
    const rng = makeRng(seed + '|' + opts.size + '|' + opts.type);
    const { cols, rows } = size;
    const players = opts.players || size.players;
    const elevN = makeNoise(rng), moistN = makeNoise(rng), rockN = makeNoise(rng);

    // Mapa de islas: varias islas separadas por mar (al menos una por jugador).
    let centers = null;
    if (type.islands) {
      centers = [];
      const want = players + 2 + Math.floor(rng() * 3), minD = 0.85 / Math.sqrt(want);
      for (let tries = 0; centers.length < want && tries < 500; tries++) {
        const k = { x: 0.12 + rng() * 0.76, y: 0.12 + rng() * 0.76, rad: minD * (0.55 + rng() * 0.35) };
        if (centers.every(o => Math.hypot(o.x - k.x, o.y - k.y) > minD)) centers.push(k);
      }
    }
    const tiles = [];
    const at = (c, r) => tiles[r * cols + c];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        // Posición real del centro (las filas impares van medio hueco a la derecha).
        const px = (c + (r & 1) * 0.5) / cols, py = r / rows;
        const nx = px * type.freq * 2, ny = py * type.freq * 2;
        // Los bordes tienden a ser mar.
        const dx = px - 0.5, dy = py - 0.5;
        const edge = Math.min(1, Math.sqrt(dx * dx + dy * dy) * 2);
        let elev = elevN(nx, ny) - edge * edge * type.edge;
        if (centers) elev = elev * 0.6 + Math.max(...centers.map(k => 1 - Math.hypot(px - k.x, py - k.y) / k.rad)) * 0.9;
        tiles.push({ col: c, row: r, elev, moist: moistN(nx * 1.3 + 9, ny * 1.3), rock: rockN(nx * 1.7, ny * 1.7 + 5),
          terrain: 'mar', resource: null });
      }
    }

    // Tierra: el % exacto que pide el tipo de mapa.
    const sortedElev = tiles.map(t => t.elev).sort((a, b) => b - a);
    const seaLevel = sortedElev[Math.floor(tiles.length * type.land) - 1];
    const land = tiles.filter(t => t.elev >= seaLevel);
    land.forEach(t => (t.terrain = 'llanura'));

    // Montañas: lo más alto y rocoso (~15% de la tierra).
    const byRock = land.slice().sort((a, b) => (b.elev + b.rock * 0.8) - (a.elev + a.rock * 0.8));
    byRock.slice(0, Math.round(land.length * 0.15)).forEach(t => (t.terrain = 'montana'));
    // Bosques: lo más húmedo (~30% de la tierra).
    const flat = land.filter(t => t.terrain === 'llanura').sort((a, b) => b.moist - a.moist);
    flat.slice(0, Math.round(land.length * 0.30)).forEach(t => (t.terrain = 'bosque'));

    // Costa: agua que toca tierra.
    for (const t of tiles) {
      if (t.terrain !== 'mar') continue;
      if (neighbors(t.col, t.row, cols, rows).some(([c, r]) => !TERRAIN[at(c, r).terrain].water)) t.terrain = 'costa';
    }

    // Ríos: nacen junto a una montaña y bajan hasta el agua.
    const distWater = new Array(tiles.length).fill(Infinity);
    const queue = [];
    tiles.forEach((t, i) => { if (TERRAIN[t.terrain].water) { distWater[i] = 0; queue.push(t); } });
    for (let qi = 0; qi < queue.length; qi++) {
      const t = queue[qi], d = distWater[t.row * cols + t.col];
      for (const [c, r] of neighbors(t.col, t.row, cols, rows)) {
        const i = r * cols + c;
        if (distWater[i] > d + 1) { distWater[i] = d + 1; queue.push(at(c, r)); }
      }
    }
    const wantRivers = Math.max(1, Math.round(land.length / 70));
    const sources = land.filter(t => t.terrain !== 'montana' && distWater[t.row * cols + t.col] >= 3 &&
      neighbors(t.col, t.row, cols, rows).some(([c, r]) => at(c, r).terrain === 'montana'));
    let made = 0;
    while (made < wantRivers && sources.length) {
      const src = sources.splice(Math.floor(rng() * sources.length), 1)[0];
      if (src.terrain === 'rio') continue;
      const path = [src];
      let cur = src, ok = false;
      for (let step = 0; step < 40; step++) {
        const d = distWater[cur.row * cols + cur.col];
        if (d <= 1) { ok = true; break; }
        const next = neighbors(cur.col, cur.row, cols, rows).map(([c, r]) => at(c, r))
          .filter(n => distWater[n.row * cols + n.col] === d - 1 && n.terrain !== 'montana' && n.terrain !== 'rio');
        if (!next.length) break;
        cur = next[Math.floor(rng() * next.length)];
        path.push(cur);
      }
      if (ok && path.length >= 2) { path.forEach(t => (t.terrain = 'rio')); made++; }
    }

    // Recursos.
    const options = {
      llanura: ['trigo', 'trigo', 'cantera'],
      bosque: ['caza', 'lena'],
      montana: ['mineral', 'mineral', 'cantera'],
      costa: ['pesca'],
      rio: ['pesca'],
    };
    for (const t of tiles) {
      const list = options[t.terrain];
      if (!list) continue;
      if (t.terrain === 'costa' && rng() > 0.6) continue; // menos pesca, que hay mucha costa
      if (rng() < abundance.chance) t.resource = list[Math.floor(rng() * list.length)];
    }

    // Puntos de salida: casillas de llanura o bosque, lo más separadas posible.
    const startable = tiles.filter(t => (t.terrain === 'llanura' || t.terrain === 'bosque') &&
      t.col > 0 && t.row > 0 && t.col < cols - 1 && t.row < rows - 1);
    const starts = [];
    if (startable.length) {
      starts.push(startable[Math.floor(rng() * startable.length)]);
      while (starts.length < players && starts.length < startable.length) {
        let best = null, bestD = -1;
        for (const t of startable) {
          const d = Math.min(...starts.map(s => distance(s.col, s.row, t.col, t.row)));
          if (d > bestD) { bestD = d; best = t; }
        }
        starts.push(best);
      }
    }

    return {
      seed, size: opts.size, type: opts.type, abundance: opts.abundance, cols, rows,
      tiles: tiles.map(t => ({ col: t.col, row: t.row, terrain: t.terrain, resource: t.resource })),
      starts: starts.map(t => ({ col: t.col, row: t.row })),
    };
  }

  const api = { SIZES, MAP_TYPES, ABUNDANCE, TERRAIN, RESOURCE, generate, neighbors, distance, randomCode };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PEMap = api;
})(this);
