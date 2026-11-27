// Pixel Enemies - generador del mapa de hexágonos.
// No depende de Phaser: con el mismo código de mapa (semilla) sale siempre el mismo mapa,
// así todos los jugadores de una partida verán exactamente lo mismo.
(function (root) {
  'use strict';

  // --- Opciones (se ajustan aquí) ----------------------------------------
  const SIZES = {
    // radius = casillas del centro al borde; el mapa es un hexágono de lado radius+1.
    // Unas 140-165 casillas por jugador.
    pequeno: { radius: 10, players: 2, label: 'Pequeño' },  // 21 de ancho, 331 casillas
    mediano: { radius: 13, players: 4, label: 'Mediano' },  // 27 de ancho, 547 casillas
    grande:  { radius: 16, players: 6, label: 'Grande' },   // 33 de ancho, 817 casillas
  };
  // land = parte del mapa que es tierra; freq = lo "troceada" que sale la tierra.
  const MAP_TYPES = {
    continente: { land: 0.56, freq: 1.8, edge: 1.3, label: 'Continente' },
    costas:     { land: 0.46, freq: 2.4, edge: 0.9, label: 'Costas' },
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
    rio:      { label: 'Río', fresh: true },
  };
  // Recursos NATURALES que trae el mapa. Los edificios que los aprovechan los construye el jugador.
  // (La cantera no es un recurso: se construye en cualquier montaña sin mineral.)
  const RESOURCE = {
    caza:    { label: 'Animales', kind: 'comida', build: 'Puesto de caza' },
    pesca:   { label: 'Peces', kind: 'comida', build: 'Puerto pesquero' },
    trigo:   { label: 'Trigo silvestre', kind: 'comida', build: 'Plantación de trigo' },
    mineral: { label: 'Vetas de mineral', kind: 'oro', build: 'Mina' },
    lena:    { label: 'Madera buena', kind: 'oro', build: 'Aserradero' },
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
  // El mapa tiene forma de hexágono: casillas a "radius" pasos o menos del centro.
  function generate(opts) {
    const size = SIZES[opts.size] || SIZES.mediano;
    const type = MAP_TYPES[opts.type] || MAP_TYPES.costas;
    const seed = String(opts.seed || randomCode()).toUpperCase();
    const abundance = ABUNDANCE[opts.abundance] || ABUNDANCE.normal;
    const rng = makeRng(seed + '|' + opts.size + '|' + opts.type);
    const R = size.radius, cols = 2 * R + 1, rows = 2 * R + 1;
    const players = opts.players || size.players;
    const elevN = makeNoise(rng), moistN = makeNoise(rng), rockN = makeNoise(rng);

    // Posición (de -1 a 1) del centro de cada casilla respecto al centro del mapa.
    const pos = (c, r) => ({ x: ((c + (r & 1) * 0.5) - (R + (R & 1) * 0.5)) / R, y: (r - R) * (Math.sqrt(3) / 2) / R });

    // Mapa de islas: varias islas separadas por mar (al menos una por jugador).
    let centers = null;
    if (type.islands) {
      centers = [];
      const want = players + 2 + Math.floor(rng() * 3), minD = 1.7 / Math.sqrt(want);
      for (let tries = 0; centers.length < want && tries < 800; tries++) {
        const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * 0.72;
        const k = { x: Math.cos(a) * d, y: Math.sin(a) * d, rad: minD * (0.55 + rng() * 0.35) };
        if (centers.every(o => Math.hypot(o.x - k.x, o.y - k.y) > minD)) centers.push(k);
      }
    }

    const grid = new Array(cols * rows).fill(null);
    const tiles = [];
    const at = (c, r) => (c >= 0 && c < cols && r >= 0 && r < rows ? grid[r * cols + c] : null);
    const nb = (t) => neighbors(t.col, t.row, cols, rows).map(([c, r]) => at(c, r)).filter(Boolean);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const ring = distance(c, r, R, R);
        if (ring > R) continue;
        const p = pos(c, r);
        const nx = (p.x + 1) * type.freq, ny = (p.y + 1) * type.freq;
        // Los bordes tienden a ser mar.
        const edge = ring / R;
        let elev = elevN(nx, ny) - edge * edge * type.edge;
        if (centers) elev = elev * 0.6 + Math.max(...centers.map(k => 1 - Math.hypot(p.x - k.x, p.y - k.y) / k.rad)) * 0.9;
        elev -= Math.max(0, edge - 0.8) * 4; // la última vuelta del mapa casi siempre es mar
        const t = { i: tiles.length, col: c, row: r, ring, elev, moist: moistN(nx * 1.3 + 9, ny * 1.3),
          rock: rockN(nx * 1.7, ny * 1.7 + 5), terrain: 'mar', resource: null };
        grid[r * cols + c] = t;
        tiles.push(t);
      }
    }

    // Tierra: el % exacto que pide el tipo de mapa.
    const sortedElev = tiles.map(t => t.elev).sort((a, b) => b - a);
    const seaLevel = sortedElev[Math.floor(tiles.length * type.land) - 1];
    const land = tiles.filter(t => t.elev >= seaLevel);
    land.forEach(t => (t.terrain = 'llanura'));

    // Montañas: varias sierras cortas repartidas por el mapa (~15% de la tierra),
    // con huecos entre ellas para que no corten todo el paso.
    const wantMountains = Math.round(land.length * 0.15);
    const step = (t, d) => { // d: 0=E 1=NE 2=NO 3=O 4=SO 5=SE
      const odd = t.row & 1;
      const D = odd ? [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]]
                    : [[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]];
      return at(t.col + D[d][0], t.row + D[d][1]);
    };
    const near = (t, dist) => tiles.some(o => o.terrain === 'montana' && distance(o.col, o.row, t.col, t.row) <= dist);
    let mountains = 0;
    const byHeight = land.slice().sort((a, b) => (b.elev + b.rock) - (a.elev + a.rock));
    for (let tries = 0; mountains < wantMountains && tries < 400; tries++) {
      // empieza en una zona alta, pero lejos de otras sierras
      const pool = byHeight.slice(0, Math.max(8, Math.round(byHeight.length * 0.6)));
      let cur = pool[Math.floor(rng() * pool.length)];
      if (cur.terrain === 'montana' || near(cur, 2)) continue;
      let dir = Math.floor(rng() * 6);
      const length = 3 + Math.floor(rng() * 4); // 3 a 6 montañas
      for (let k = 0; k < length && cur && mountains < wantMountains; k++) {
        if (cur.terrain === 'llanura') { cur.terrain = 'montana'; mountains++; }
        if (rng() < 0.15) { // a veces un pico al lado
          const side = step(cur, (dir + 2) % 6);
          if (side && side.terrain === 'llanura' && mountains < wantMountains) { side.terrain = 'montana'; mountains++; }
        }
        dir = (dir + (rng() < 0.3 ? (rng() < 0.5 ? 1 : 5) : 0)) % 6;
        const next = step(cur, dir);
        cur = next && next.terrain === 'llanura' ? next : null;
      }
    }
    // Bosques: lo más húmedo (~30% de la tierra).
    const flat = land.filter(t => t.terrain === 'llanura').sort((a, b) => b.moist - a.moist);
    flat.slice(0, Math.round(land.length * 0.30)).forEach(t => (t.terrain = 'bosque'));

    // Costa: agua que toca tierra.
    for (const t of tiles) {
      if (t.terrain === 'mar' && nb(t).some(n => !TERRAIN[n.terrain].water)) t.terrain = 'costa';
    }

    // Ríos: nacen junto a una montaña y bajan hasta el agua.
    const distWater = new Array(tiles.length).fill(Infinity);
    const queue = tiles.filter(t => TERRAIN[t.terrain].water);
    queue.forEach(t => (distWater[t.i] = 0));
    for (let qi = 0; qi < queue.length; qi++) {
      const t = queue[qi];
      for (const n of nb(t)) if (distWater[n.i] > distWater[t.i] + 1) { distWater[n.i] = distWater[t.i] + 1; queue.push(n); }
    }
    const wantRivers = Math.max(1, Math.round(land.length / 70));
    const sources = land.filter(t => t.terrain !== 'montana' && distWater[t.i] >= 3 && nb(t).some(n => n.terrain === 'montana'));
    let made = 0;
    while (made < wantRivers && sources.length) {
      const src = sources.splice(Math.floor(rng() * sources.length), 1)[0];
      if (src.terrain === 'rio' || nb(src).some(n => n.terrain === 'rio')) continue;
      const path = [src];
      let cur = src, ok = false;
      for (let step = 0; step < 40; step++) {
        const d = distWater[cur.i];
        if (d <= 1) { ok = true; break; }
        const next = nb(cur).filter(n => distWater[n.i] === d - 1 && n.terrain !== 'montana' && n.terrain !== 'rio');
        if (!next.length) break;
        cur = next[Math.floor(rng() * next.length)];
        path.push(cur);
      }
      if (ok && path.length >= 2) { path.forEach(t => (t.terrain = 'rio')); made++; }
    }

    // Recursos: cambian el dibujo de la propia casilla.
    const options = {
      llanura: ['trigo'],
      bosque: ['caza', 'lena'],
      montana: ['mineral'],
      costa: ['pesca'],
      rio: ['pesca'],
    };
    for (const t of tiles) {
      const list = options[t.terrain];
      if (!list) continue;
      if (t.terrain === 'costa' && rng() > 0.6) continue; // menos pesca, que hay mucha costa
      if (rng() < abundance.chance) t.resource = list[Math.floor(rng() * list.length)];
    }

    // Puntos de salida: casillas de llanura o bosque, lo más separadas posible y lejos del borde.
    const startable = tiles.filter(t => (t.terrain === 'llanura' || t.terrain === 'bosque') && !t.resource && t.ring < R);
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

    const out = tiles.map(t => ({ col: t.col, row: t.row, terrain: t.terrain, resource: t.resource }));
    const index = new Array(cols * rows).fill(-1);
    out.forEach((t, i) => (index[t.row * cols + t.col] = i));
    return {
      seed, size: opts.size, type: opts.type, abundance: opts.abundance, radius: R, cols, rows,
      tiles: out, index,
      starts: starts.map(t => ({ col: t.col, row: t.row })),
    };
  }
  function tileAt(map, col, row) {
    if (col < 0 || row < 0 || col >= map.cols || row >= map.rows) return null;
    const i = map.index[row * map.cols + col];
    return i >= 0 ? map.tiles[i] : null;
  }

  const api = { SIZES, MAP_TYPES, ABUNDANCE, TERRAIN, RESOURCE, generate, tileAt, neighbors, distance, randomCode };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PEMap = api;
})(this);
