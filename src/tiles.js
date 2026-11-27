// Pixel Enemies - dibujo de las casillas en pixel art (se dibujan con código, sin imágenes).
// Vista inclinada: el hexágono se ve "aplastado" (28x24) y se ve su lado (6 px), como una maqueta.
// Luego el juego amplía los píxeles sin suavizar.
(function (root) {
  'use strict';

  const W = 28, H = 24;          // cara de arriba del hexágono
  const TOP = 14, SIDE = 6;      // hueco arriba para árboles/montañas y grosor del lado
  const TW = W, TH = TOP + H + SIDE;
  const WATER_DROP = 4;           // el agua queda un poco más baja que la tierra
  const ROW_STEP = H * 3 / 4, COL_STEP = W;

  const PALETTE = {
    mar:     { base: '#2a5c9a', dot: '#3b74b8', dark: '#22497c' },
    costa:   { base: '#4c97cf', dot: '#6db3e0', dark: '#3d7fb0' },
    llanura: { base: '#8cc152', dot: '#a3d168', dark: '#76a843', side: '#8a6a3e', side2: '#6b4f2c' },
    bosque:  { base: '#6ea544', dot: '#82b853', dark: '#5a8a37', side: '#7d6038', side2: '#5f4628' },
    montana: { base: '#9aa765', dot: '#adb979', dark: '#808c52', side: '#7a7466', side2: '#5c574b' },
    rio:     { base: '#8cc152', dot: '#a3d168', dark: '#76a843', side: '#8a6a3e', side2: '#6b4f2c' },
  };

  function insideHex(x, y) {
    const dx = Math.abs(x + 0.5 - W / 2), dy = Math.abs(y + 0.5 - H / 2);
    return dx <= W / 2 && dy <= H / 2 - dx * ((H / 4) / (W / 2));
  }
  function edgeHex(x, y) {
    if (!insideHex(x, y)) return false;
    return !insideHex(x - 1, y) || !insideHex(x + 1, y) || !insideHex(x, y - 1) || !insideHex(x, y + 1);
  }
  function rng(seed) {
    let s = seed >>> 0;
    return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  }
  function px(ctx, x, y, color) { ctx.fillStyle = color; ctx.fillRect(x, y, 1, 1); }

  // Dibuja una figura hecha con letras: cada letra es un color de "map".
  function sprite(ctx, ox, oy, rows, map) {
    rows.forEach((line, y) => {
      for (let x = 0; x < line.length; x++) {
        const c = map[line[x]];
        if (c) px(ctx, ox + x, oy + y, c);
      }
    });
  }

  const TREE = ['..g..', '.gGg.', 'gGGgg', '.ggg.', '..t..'];
  const TREE_TALL = ['..g..', '.gGg.', '.gGg.', 'gGGgg', 'gGGgg', '.ggg.', '..t..', '..t..'];
  const TREE_MAP = { g: '#2f6b2a', G: '#3f8a35', t: '#5a3a1e' };
  const MOUNTAIN = [
    '.....w.....',
    '....wwr....',
    '...wwrrr...',
    '..mlmrrrr..',
    '.mllmmrrrr.',
    'mllllmmrrrr',
  ];
  const MOUNTAIN_TALL = [
    '.....w.....',
    '....wwr....',
    '....wwr....',
    '...wwrrr...',
    '...lmrrr...',
    '..mlmrrrr..',
    '..llmmrrr..',
    '.mllmmrrrr.',
    '.mlllmmrrr.',
    'mllllmmrrrr',
    'mllllmmmrrr',
  ];
  const MOUNTAIN_MAP = { w: '#f2f2ee', l: '#a7a59c', m: '#8a877e', r: '#6b685f' };

  function makeTerrainCanvas(terrain, variant, relief) {
    const cv = document.createElement('canvas');
    cv.width = TW; cv.height = TH;
    const ctx = cv.getContext('2d');
    const p = PALETTE[terrain];
    const r = rng(variant * 977 + terrain.length * 131);
    const water = terrain === 'mar' || terrain === 'costa';
    const oy = TOP + (water && relief ? WATER_DROP : 0); // el agua queda más baja que la tierra

    // Grosor (lado de la "maqueta").
    if (relief && !water) {
      for (let d = SIDE; d >= 1; d--)
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
          if (insideHex(x, y)) px(ctx, x, TOP + y + d, d > SIDE / 2 ? p.side2 || p.side : p.side);
    }
    // Cara de arriba con algo de textura.
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!insideHex(x, y)) continue;
      let c = p.base;
      const v = r();
      if (v < 0.10) c = p.dot; else if (v < 0.16) c = p.dark;
      if (water && (y + variant * 3) % 6 === 0 && (x + y) % 6 < 3) c = p.dot; // olitas
      if (edgeHex(x, y)) c = p.dark;
      px(ctx, x, oy + y, c);
    }

    if (terrain === 'bosque') {
      const spots = [[4, 4], [14, 1], [19, 6], [8, 10], [17, 12]];
      spots.forEach(([x, y], i) => {
        if (i === 4 && variant % 2) return;
        sprite(ctx, x + (variant % 3) - 1, TOP + y - (relief ? 2 : 0), TREE_TALL, TREE_MAP);
      });
    }
    if (terrain === 'montana') {
      if (relief) sprite(ctx, 3, TOP + 4, MOUNTAIN.slice(2).map(l => l.slice(2, 9)), MOUNTAIN_MAP);
      sprite(ctx, 9 + (variant % 2), TOP - 2, MOUNTAIN_TALL, MOUNTAIN_MAP);
    }
    return cv;
  }

  // Iconos de recursos, 10x10.
  const RES_SPRITES = {
    trigo: { rows: ['..y..y..y.', '.yYy.yYy.Y', '..y..y..y.', '..s..s..s.', '..s..s..s.', '..s..s..s.', '..s..s..s.', '.ssssssss.'],
      map: { y: '#e8c34a', Y: '#f6dc7a', s: '#b08a2e' } },
    caza: { rows: ['b.b.......', '.bb.......', '.BBB......', '.BBBBBBBB.', '..BBBBBBB.', '..B.B..BB.', '..B.B..B.B'],
      map: { b: '#d8c7a0', B: '#8a5a30' } },
    pesca: { rows: ['..........', '..ffff..f.', '.fFFFFf.ff', 'fFeFFFFfff', '.fFFFFf.ff', '..ffff..f.'],
      map: { f: '#e07a3c', F: '#f2a463', e: '#1b1b1b' } },
    mineral: { rows: ['...gggg...', '..gGGgyg..', '.gGgyggGg.', '.ggGggyGg.', 'gGyggGggGg', 'gggggggggg'],
      map: { g: '#55555f', G: '#7a7a86', y: '#f3d23b' } },
    cantera: { rows: ['.cccc.....', '.cCCc.cccc', '.cccc.cCCc', 'cccc..cccc', 'cCCc.cccc.', 'cccc.cCCc.', '.....cccc.'],
      map: { c: '#8f8f8f', C: '#c8c8c8' } },
    lena: { rows: ['..........', '.wwwwwwwo.', 'wWWWWWWWwo', '.wwwwwwwo.', '.wwwwwwwo.', 'wWWWWWWWwo', '.wwwwwwwo.'],
      map: { w: '#7a4a22', W: '#a66a35', o: '#d9b07a' } },
  };
  function makeResourceCanvas(res) {
    const cv = document.createElement('canvas');
    cv.width = 12; cv.height = 10;
    const ctx = cv.getContext('2d');
    const s = RES_SPRITES[res];
    // Fondo redondo claro para que se vea sobre cualquier terreno.
    ctx.fillStyle = 'rgba(255,250,230,0.85)';
    ctx.fillRect(1, 0, 10, 10); ctx.fillRect(0, 1, 12, 8);
    sprite(ctx, 1, 10 - s.rows.length - 1 + (s.rows.length > 7 ? 1 : 0), s.rows, s.map);
    return cv;
  }

  function makeFogCanvas() {
    const cv = document.createElement('canvas');
    cv.width = TW; cv.height = TH;
    const ctx = cv.getContext('2d');
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!insideHex(x, y)) continue;
      px(ctx, x, TOP + y, (x + y) % 2 ? '#1d1a26' : '#26222f');
    }
    // Grosor de la casilla, aún más oscuro.
    for (let d = SIDE; d >= 1; d--) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
      if (insideHex(x, y) && !insideHex(x, y + d)) px(ctx, x, TOP + y + d, '#15131c');
    return cv;
  }

  function makeOutlineCanvas(color) {
    const cv = document.createElement('canvas');
    cv.width = TW; cv.height = TH;
    const ctx = cv.getContext('2d');
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
      if (edgeHex(x, y) || edgeHex(x + 1, y) && insideHex(x, y) && x > W - 3) px(ctx, x, TOP + y, color);
    return cv;
  }

  function makeFlagCanvas(color) {
    const cv = document.createElement('canvas');
    cv.width = 10; cv.height = 14;
    const ctx = cv.getContext('2d');
    sprite(ctx, 0, 0, [
      '.kfffff...', '.kFFFFFf..', '.kFFFFFFf.', '.kFFFFFf..', '.kfffff...', '.k........',
      '.k........', '.k........', '.k........', '.k........', 'kkk.......', 'kkk.......'],
      { k: '#2b1d1a', f: color, F: color });
    return cv;
  }

  // Centro de cada casilla en el mundo (en píxeles sin ampliar).
  function tileOrigin(col, row) {
    return { x: col * COL_STEP + (row & 1) * (COL_STEP / 2), y: row * ROW_STEP };
  }

  root.PETiles = {
    W, H, TW, TH, TOP, SIDE, WATER_DROP, ROW_STEP, COL_STEP, VARIANTS: 4,
    makeTerrainCanvas, makeResourceCanvas, makeFogCanvas, makeOutlineCanvas, makeFlagCanvas,
    tileOrigin, insideHex,
  };
})(this);
