// Pixel Enemies - dibujo de las casillas en pixel art (se dibujan con código, sin imágenes).
// Vista inclinada: el hexágono se ve "aplastado" (56x48) y se ve su lado, como una maqueta.
// Los recursos cambian el dibujo de la propia casilla (trigo creciendo, mina en la montaña...).
(function (root) {
  'use strict';

  const W = 56, H = 48;           // cara de arriba del hexágono
  const TOP = 40, SIDE = 12;      // hueco arriba para árboles/montañas y grosor del lado
  const TW = W, TH = TOP + H + SIDE;
  const WATER_DROP = 8;           // el agua queda más baja que la tierra
  const ROW_STEP = H * 3 / 4, COL_STEP = W;
  const VARIANTS = 3;

  function insideHex(x, y) {
    const dx = Math.abs(x + 0.5 - W / 2), dy = Math.abs(y + 0.5 - H / 2);
    return dx <= W / 2 && dy <= H / 2 - dx * ((H / 4) / (W / 2));
  }
  // Distancia (en píxeles) hasta el borde del hexágono, para orillas y sombras.
  function edgeDist(x, y) {
    if (!insideHex(x, y)) return 0;
    for (let d = 1; d < 8; d++)
      if (!insideHex(x - d, y) || !insideHex(x + d, y) || !insideHex(x, y - d) || !insideHex(x, y + d)) return d;
    return 8;
  }

  // Distancia a cada uno de los 6 lados, en el orden E, O, NO, NE, SO, SE.
  function sideDists(x, y) {
    const cx = x + 0.5, cy = y + 0.5, k = (H / 4) / (W / 2);
    return [W - cx, cx, cy - (W / 2 - cx) * k, cy - (cx - W / 2) * k,
      (H * 3 / 4 + cx * k) - cy, (H * 3 / 4 + (W - cx) * k) - cy];
  }

  // --- Lienzo de píxeles ----------------------------------------------------
  function hex2rgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function makeRng(seed) {
    let s = (seed * 2654435761) >>> 0 || 1;
    return () => ((s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9E3779B9) >>> 0) / 4294967296);
  }
  class Pix {
    constructor(w, h) {
      this.w = w; this.h = h;
      this.cv = document.createElement('canvas'); this.cv.width = w; this.cv.height = h;
      this.ctx = this.cv.getContext('2d');
      this.img = this.ctx.createImageData(w, h);
    }
    set(x, y, c, a = 255) {
      x |= 0; y |= 0;
      if (x < 0 || y < 0 || x >= this.w || y >= this.h || !c) return;
      const [r, g, b] = typeof c === 'string' ? hex2rgb(c) : c, i = (y * this.w + x) * 4, d = this.img.data;
      if (a >= 255) { d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255; return; }
      const k = a / 255;
      d[i] = d[i] * (1 - k) + r * k; d[i + 1] = d[i + 1] * (1 - k) + g * k; d[i + 2] = d[i + 2] * (1 - k) + b * k;
      d[i + 3] = Math.max(d[i + 3], a);
    }
    rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); }
    // Elipse rellena; "shade" decide el color según la posición relativa (-1..1).
    ellipse(cx, cy, rx, ry, c, shade) {
      for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
        const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry;
        if (u * u + v * v <= 1) this.set(x, y, shade ? shade(u, v) : c);
      }
    }
    // Triángulo de punta arriba (pinos) con lado izquierdo iluminado.
    peak(cx, top, bottom, halfW, light, dark, edgeC) {
      for (let y = top; y <= bottom; y++) {
        const t = (y - top) / Math.max(1, bottom - top), hw = halfW * t;
        for (let x = Math.floor(cx - hw); x <= Math.ceil(cx + hw); x++) {
          const isEdge = edgeC && (Math.abs(x - (cx - hw)) < 1 || Math.abs(x - (cx + hw)) < 1);
          this.set(x, y, isEdge ? edgeC : (x < cx ? light : dark));
        }
      }
    }
    line(x0, y0, x1, y1, c) {
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1;
      for (let i = 0; i <= n; i++) this.set(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), c);
    }
    done() { this.ctx.putImageData(this.img, 0, 0); return this.cv; }
  }

  // --- Colores --------------------------------------------------------------
  const C = {
    grass: ['#7fbf4d', '#8fcc5a', '#6fae42', '#9dd669'], grassEdge: '#5e9a38',
    forestFloor: ['#5f9c3c', '#6aa845', '#548d35', '#76b24f'],
    rockGround: ['#9aa46a', '#a8b17a', '#8a955c', '#b3bb87'],
    dirt: ['#8a6234', '#7a5530', '#6a4828', '#5a3c22'],
    stoneSide: ['#7d7a70', '#6c695f', '#5c5950', '#4c4a43'],
    sea: ['#2d64a8', '#3370b6', '#285c9b', '#3a7cc2'], seaHi: '#5d9ad6',
    coast: ['#3f8fcd', '#4a9bd6', '#3884c2', '#58a8de'], coastHi: '#9fd2f0', foam: '#e3f4fb',
    river: ['#3e9ad8', '#48a6e0', '#3790cd'], riverHi: '#a6dcf5', bank: '#c9b27a', reed: '#4f8a2f',
    pine: ['#3d7a34', '#2c5e29', '#204a20'], leaf: ['#5aa03c', '#3f7f2c', '#2e6424'], trunk: '#5b3a1f',
    rockL: '#b5b2a8', rockM: '#8e8b81', rockD: '#6a675e', snow: '#f4f6f8', snowS: '#c9d6e3',
    wheat: '#e9c149', wheatHi: '#f8e08a', wheatD: '#b88e2b', furrow: '#9c7a3c',
    gold: '#f5cf3a', goldHi: '#fff2a8', wood: '#8a5a2b', woodD: '#5e3c1c', woodHi: '#c08a52', ring: '#d9b27a',
    deer: '#9b6334', deerD: '#6e4220', deerL: '#c99566', fish: '#f08a3c', fishHi: '#ffc27a',
  };

  // Rellena la cara del hexágono con textura de puntos.
  function face(p, oy, pal, r, edgeColor) {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!insideHex(x, y)) continue;
      const v = r();
      let c = v < 0.55 ? pal[0] : v < 0.75 ? pal[1] : v < 0.92 ? pal[2] : pal[3];
      if (edgeColor && edgeDist(x, y) === 1) c = edgeColor;
      p.set(x, oy + y, c);
    }
  }
  // Lado de la casilla (tierra o roca en capas).
  function side(p, layers) {
    for (let d = SIDE; d >= 1; d--) {
      const c = layers[Math.min(layers.length - 1, Math.floor((d - 1) / (SIDE / layers.length)))];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
        if (insideHex(x, y) && !insideHex(x, y + d)) p.set(x, TOP + y + d, c);
    }
  }
  function shadowSoft(p, cx, cy, rx, ry) {
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry;
      if (u * u + v * v <= 1) p.set(x, y, '#1e3a14', 70);
    }
  }

  // --- Elementos ------------------------------------------------------------
  function pine(p, x, y, s) { // y = base del tronco
    shadowSoft(p, x + 2, y, 5 * s, 2 * s);
    p.rect(x - 1, y - 3 * s, 2, 3 * s, C.trunk);
    for (let k = 0; k < 3; k++) {
      const top = Math.round(y - 3 * s - (k + 1) * 4 * s - 2), bot = Math.round(y - 2 * s - k * 4 * s);
      p.peak(x, top, bot, (6 - k * 1.4) * s, C.pine[0], C.pine[1], C.pine[2]);
    }
  }
  function roundTree(p, x, y, s) {
    shadowSoft(p, x + 2, y, 6 * s, 2 * s);
    p.rect(x - 1, y - 5 * s, 2, 5 * s, C.trunk);
    p.ellipse(x, y - 9 * s, 6 * s, 5.5 * s, null, (u, v) =>
      (u + v < -0.7 ? '#7cc255' : u + v > 0.6 ? C.leaf[2] : u + v > 0 ? C.leaf[1] : C.leaf[0]));
  }
  function mountain(p, cx, base, top, halfW, snowy) {
    // cara iluminada (izq.) y en sombra (dcha.)
    for (let y = top; y <= base; y++) {
      const t = (y - top) / (base - top), hw = halfW * t;
      for (let x = Math.floor(cx - hw); x <= Math.ceil(cx + hw); x++) {
        let c = x < cx ? (x < cx - hw * 0.55 ? C.rockM : C.rockL) : C.rockD;
        if (Math.abs(x - (cx - hw)) < 1 || Math.abs(x - (cx + hw)) < 1) c = '#55524a';
        if (snowy && t < 0.32) c = x < cx ? C.snow : C.snowS;
        if (snowy && t >= 0.32 && t < 0.4 && ((x * 7 + y) % 5 < 2)) c = x < cx ? C.snow : C.snowS;
        p.set(x, y, c);
      }
    }
    // grietas
    p.line(cx - halfW * 0.35, base - 3, cx - halfW * 0.15, base - (base - top) * 0.45, C.rockM);
    p.line(cx + halfW * 0.3, base - 2, cx + halfW * 0.1, base - (base - top) * 0.5, '#57544b');
  }
  function grassTufts(p, oy, r, n, color) {
    for (let i = 0; i < n; i++) {
      const x = 4 + Math.floor(r() * (W - 8)), y = 4 + Math.floor(r() * (H - 8));
      if (edgeDist(x, y) < 3) continue;
      const c = color || '#5c9a36';
      p.set(x, oy + y, c); p.set(x + 1, oy + y - 1, c); p.set(x - 1, oy + y - 1, c);
    }
  }
  function flowers(p, oy, r, n) {
    for (let i = 0; i < n; i++) {
      const x = 5 + Math.floor(r() * (W - 10)), y = 5 + Math.floor(r() * (H - 10));
      if (edgeDist(x, y) < 3) continue;
      p.set(x, oy + y, r() < 0.5 ? '#fff6d0' : '#ffd84a');
    }
  }
  function waves(p, oy, r, n, hi) {
    for (let i = 0; i < n; i++) {
      const x = 4 + Math.floor(r() * (W - 10)), y = 4 + Math.floor(r() * (H - 8));
      if (edgeDist(x, y) < 3 || edgeDist(x + 4, y) < 3) continue;
      p.set(x, oy + y, hi); p.set(x + 1, oy + y - 1, hi); p.set(x + 2, oy + y - 1, hi); p.set(x + 3, oy + y, hi);
    }
  }
  // Trigo silvestre: matas sueltas de espigas doradas entre la hierba (sin arar).
  function wildWheat(p, oy, r) {
    const clumps = [];
    for (let tries = 0; clumps.length < 7 && tries < 80; tries++) {
      const x = 8 + Math.floor(r() * (W - 16)), y = 10 + Math.floor(r() * (H - 16));
      if (edgeDist(x, y) < 6 || clumps.some(c => Math.abs(c.x - x) < 9 && Math.abs(c.y - y) < 7)) continue;
      clumps.push({ x, y });
    }
    clumps.sort((a, b) => a.y - b.y).forEach(({ x, y }) => {
      shadowSoft(p, x + 1, oy + y + 1, 5, 1.5);
      // tallos verdes que se abren en abanico, con la espiga dorada arriba y sus barbas
      for (const k of [-4, -2, 0, 2, 4]) {
        const h = 8 + Math.floor(r() * 3) - Math.abs(k) / 2;
        let tx = x, ty = oy + y;
        for (let j = 0; j < h; j++) {
          tx = x + Math.round(k * j / h);
          p.set(tx, ty - j, j < h - 4 ? '#6f9a38' : C.wheatD);
        }
        const hx = tx, hy = ty - h;
        p.set(hx, hy, C.wheat); p.set(hx, hy - 1, C.wheatHi); p.set(hx, hy - 2, C.wheat); p.set(hx, hy - 3, C.wheatHi);
        p.set(hx - 1, hy - 1, C.wheatD); p.set(hx + 1, hy - 2, C.wheatD);
        p.set(hx + (k < 0 ? -1 : 1), hy - 4, '#f3e2a2');
      }
    });
  }

  // Un bloque de piedra cortada visto en perspectiva (cara de arriba clara, frente y lado).
  function block(p, x, y, w, h) {
    p.rect(x, y, w, 2, '#e4e0d4');            // arriba
    p.rect(x, y + 2, w, h, '#bdb8aa');        // frente
    p.rect(x + w, y + 1, 2, h + 1, '#8f8a7d'); // lado
    p.rect(x, y + 2 + h, w + 2, 1, '#4c4a43'); // sombra
    p.set(x + 1, y + 4, '#d4d0c4');
  }
  // Cantera (la construye el jugador en una montaña sin mineral): una roca grande natural a la que le han cortado un trozo en bloques rectos
  // (se ve la piedra clara recién cortada), con una grúa de madera y bloques apilados.
  function quarry(p, oy, onMountain) {
    const base = oy + 32, h = onMountain ? 1.7 : 1;
    // roca natural: varias masas redondeadas
    const lumps = [[18, base - 8 * h, 13, 11 * h], [32, base - 13 * h, 14, 15 * h], [43, base - 7 * h, 9, 9 * h]];
    for (const [cx, cy, rx, ry] of lumps) {
      p.ellipse(cx, cy, rx, ry, null, (u, v) => {
        if (v > 0.55) return null; // la base queda plana
        const l = -u * 0.6 - v;
        return l > 0.7 ? '#c2beb3' : l > 0.1 ? '#a19d92' : l > -0.5 ? '#86827a' : '#6b685f';
      });
    }
    // corte: piedra clara recién cortada en escalones con juntas de bloques
    const x0 = 19, x1 = 38, top = Math.round(base - 18 * h);
    for (let y = top; y <= base + 2; y++) {
      const row = Math.floor((y - top) / 5), inset = Math.max(0, 3 - row);
      for (let x = x0 + inset; x <= x1 - inset; x++) {
        let c = '#e3dac3';
        if ((y - top) % 5 === 0) c = '#f4eedd';                 // borde de escalón
        else if ((y - top) % 5 === 4) c = '#a89f88';            // sombra del escalón
        else if ((x + row * 4) % 8 === 0) c = '#b9b09a';        // junta entre bloques
        if (x <= x0 + inset + 1) c = '#8f8775';                 // pared interior en sombra
        p.set(x, y, c);
      }
    }
    // grúa de madera con un bloque colgando
    const gy = top - 10;
    p.rect(45, gy, 2, base + 6 - gy, C.woodD); p.rect(45, gy, 1, base + 6 - gy, C.wood);
    p.rect(30, gy, 18, 2, C.wood); p.rect(30, gy, 18, 1, C.woodHi);
    p.line(46, gy + 8, 41, gy + 1, C.woodD);
    p.rect(32, gy + 2, 1, 6, '#e8e0c8');
    block(p, 29, gy + 8, 6, 3);
    // bloques cortados apilados delante y un pico
    block(p, 6, base + 2, 6, 4); block(p, 13, base + 2, 6, 4); block(p, 9, base - 4, 6, 4);
    block(p, 40, base + 6, 6, 4);
    p.line(23, base + 12, 27, base + 5, '#7a5a3a');
    p.line(24, base + 4, 30, base + 6, '#c8ccd2'); p.set(24, base + 3, '#c8ccd2');
  }
  // Roca con mineral a la vista (brillos dorados).
  function oreRock(p, x, y) {
    p.ellipse(x, y - 3, 5, 4, null, (u, v) => (v > 0.6 ? null : -u - v > 0.5 ? '#a8a49a' : -u - v > -0.4 ? '#7d7a71' : '#5f5c55'));
    p.set(x - 2, y - 5, C.gold); p.set(x - 1, y - 5, C.goldHi); p.set(x + 1, y - 3, C.gold); p.set(x + 2, y - 4, C.gold);
  }
  function goldVeins(p, cx, base, top, halfW, r) {
    for (let i = 0; i < 9; i++) {
      const y = Math.floor(top + (base - top) * (0.35 + r() * 0.6));
      const t = (y - top) / (base - top), x = Math.floor(cx + (r() - 0.5) * 1.6 * halfW * t);
      p.set(x, y, C.gold); p.set(x + 1, y, C.gold); p.set(x, y - 1, C.goldHi);
    }
  }
  function deer(p, x, y) { // y = pezuñas
    shadowSoft(p, x + 1, y, 7, 2);
    p.rect(x - 5, y - 8, 10, 4, C.deer); p.rect(x - 5, y - 8, 10, 1, C.deerL);
    p.rect(x - 4, y - 4, 1, 4, C.deerD); p.rect(x - 2, y - 4, 1, 4, C.deerD);
    p.rect(x + 2, y - 4, 1, 4, C.deerD); p.rect(x + 4, y - 4, 1, 4, C.deerD);
    p.rect(x + 4, y - 11, 2, 4, C.deer); p.rect(x + 5, y - 12, 3, 2, C.deer); p.set(x + 7, y - 11, '#2a1a0e');
    p.set(x + 6, y - 12, '#1a1008');
    // cuernos
    p.line(x + 5, y - 13, x + 4, y - 16, '#e8dcc0'); p.line(x + 4, y - 15, x + 2, y - 16, '#e8dcc0');
    p.line(x + 6, y - 13, x + 7, y - 16, '#e8dcc0'); p.line(x + 7, y - 15, x + 9, y - 16, '#e8dcc0');
    p.set(x - 5, y - 8, '#f2e6d0'); // rabito
  }
  function fallenLog(p, x, y) {
    p.rect(x, y - 4, 16, 4, C.wood); p.rect(x, y - 4, 16, 1, C.woodHi); p.rect(x, y - 1, 16, 1, C.woodD);
    p.ellipse(x + 16, y - 2, 2, 2.4, null, (u, v) => (u * u + v * v < 0.3 ? C.woodHi : C.ring));
    p.set(x + 5, y - 5, '#5a9a3a'); p.set(x + 6, y - 6, '#5a9a3a'); p.set(x + 7, y - 5, '#5a9a3a');
  }
  function fish(p, x, y) {
    // pez saltando + ondas
    p.ellipse(x, y + 3, 6, 2, null, (u, v) => (u * u + v * v > 0.6 ? '#dff2fb' : null));
    p.rect(x - 3, y - 2, 6, 3, C.fish); p.rect(x - 3, y - 2, 6, 1, C.fishHi);
    p.set(x - 4, y - 1, C.fish); p.set(x + 3, y - 3, C.fish); p.set(x + 4, y - 4, C.fish); p.set(x + 3, y - 1, C.fish);
    p.set(x - 2, y - 2, '#1b1b1b');
  }
  function fishShadows(p, oy, r) {
    for (let i = 0; i < 3; i++) {
      const x = 14 + Math.floor(r() * 28), y = 14 + Math.floor(r() * 20);
      if (edgeDist(x, y) < 5) continue;
      p.rect(x, oy + y, 4, 1, '#1f4f86'); p.set(x + 4, oy + y - 1, '#1f4f86'); p.set(x + 4, oy + y + 1, '#1f4f86');
    }
  }

  // Coloca árboles repartidos por la cara, ordenados de atrás adelante.
  function forest(p, r, count, avoid) {
    const spots = [];
    for (let tries = 0; spots.length < count && tries < 200; tries++) {
      const x = 7 + Math.floor(r() * (W - 14)), y = 10 + Math.floor(r() * (H - 14));
      if (edgeDist(x, y) < 4) continue;
      if (avoid && avoid(x, y)) continue;
      if (spots.some(s => Math.abs(s.x - x) < 8 && Math.abs(s.y - y) < 6)) continue;
      spots.push({ x, y, kind: r() < 0.6 ? 'pine' : 'round', s: r() < 0.3 ? 1.2 : 1 });
    }
    spots.sort((a, b) => a.y - b.y).forEach(t => (t.kind === 'pine' ? pine : roundTree)(p, t.x, TOP + t.y, t.s));
  }


  // --- Edificios que construye el jugador -------------------------------------
  // Casita vista de frente con tejado a dos aguas. roof = [claro, medio, oscuro].
  function house(p, x, y, w, h, roof, wall) { // (x, y) = esquina de abajo a la izquierda del muro
    wall = wall || ['#efe2c0', '#d6c49a', '#a8946a'];
    shadowSoft(p, x + w / 2 + 2, y + 1, w / 2 + 3, 2);
    p.rect(x, y - h, w, h, wall[0]);
    p.rect(x + w - 2, y - h, 2, h, wall[1]);
    p.rect(x, y - 1, w, 1, wall[2]);
    // puerta y ventana
    p.rect(x + 1 + Math.floor(w / 2) - 1, y - 4, 2, 4, '#5b3a1f');
    if (w >= 7) p.rect(x + 1, y - h + 2, 2, 2, '#3a2a40');
    // tejado
    const rh = Math.ceil(w / 2) + 1;
    for (let j = 0; j < rh; j++) {
      const half = Math.round((w / 2 + 1) * (j + 1) / rh);
      for (let i = -half; i <= half; i++) {
        const xx = Math.round(x + w / 2 + i - 0.5);
        p.set(xx, y - h - rh + j, j === rh - 1 ? roof[2] : i < 0 ? roof[0] : roof[1]);
      }
    }
  }
  const THATCH = ['#e2c070', '#c59c48', '#8a6a2c'];
  const WOODROOF = ['#a8703c', '#86552a', '#5e3a1a'];

  function plowedField(p, oy) {
    // surcos arados con trigo en filas, y una cerca de madera
    for (let y = 8; y < H - 6; y++) for (let x = 6; x < W - 6; x++) {
      if (edgeDist(x, y) < 5) continue;
      const row = Math.floor((y + x * 0.25) / 3) % 2;
      p.set(x, oy + y, row ? C.furrow : (x + y) % 3 ? C.wheat : C.wheatD);
    }
    for (let y = 9; y < H - 6; y += 6) for (let x = 8; x < W - 8; x += 3) {
      if (edgeDist(x, y) < 6) continue;
      const yy = Math.round(y + x * 0.25) % (H - 4);
      p.set(x, oy + yy - 1, C.wheatHi); p.set(x, oy + yy - 2, C.wheat);
    }
    // espantapájaros
    p.rect(40, oy + 14, 1, 10, C.woodD); p.rect(37, oy + 17, 7, 1, C.wood);
    p.rect(39, oy + 12, 3, 3, '#e8d6a0'); p.rect(38, oy + 11, 5, 1, '#8a5a2b');
    p.rect(39, oy + 15, 3, 4, '#b0402f');
    house(p, 10, oy + 22, 7, 5, THATCH);
  }
  function hunterHut(p, oy) {
    house(p, 22, oy + 30, 10, 7, WOODROOF, ['#a8763f', '#86592c', '#5e3c1c']);
    // cuernos encima de la puerta
    p.line(26, oy + 18, 24, oy + 15, '#efe4c8'); p.line(28, oy + 18, 30, oy + 15, '#efe4c8');
    p.set(23, oy + 15, '#efe4c8'); p.set(31, oy + 15, '#efe4c8');
    // piel secándose en un bastidor
    p.rect(36, oy + 22, 1, 10, C.woodD); p.rect(44, oy + 22, 1, 10, C.woodD); p.rect(36, oy + 22, 9, 1, C.wood);
    p.rect(37, oy + 23, 7, 6, '#b07a48'); p.rect(38, oy + 24, 5, 4, '#c99566');
    // arco apoyado
    for (let y = 0; y < 9; y++) p.set(18 + Math.round(Math.sin(y / 8 * Math.PI) * 2), oy + 24 + y, C.wood);
    p.line(18, oy + 24, 18, oy + 32, '#efe6cf');
  }
  function sawmill(p, oy) {
    house(p, 30, oy + 26, 12, 7, WOODROOF, ['#b98a55', '#946a3a', '#6a4a26']);
    // troncos apilados (vistos por el corte)
    const logs = [[10, 34], [15, 34], [20, 34], [12.5, 30], [17.5, 30], [15, 26]];
    logs.forEach(([x, y]) => p.ellipse(x, oy + y, 2.6, 2.6, null, (u, v) => (u * u + v * v < 0.25 ? C.woodHi : u * u + v * v < 0.7 ? C.ring : C.woodD)));
    // caballete con sierra
    p.line(34, oy + 40, 37, oy + 33, C.woodD); p.line(40, oy + 40, 37, oy + 33, C.woodD);
    p.rect(30, oy + 33, 14, 2, C.wood); p.rect(30, oy + 33, 14, 1, C.woodHi);
    p.rect(42, oy + 30, 6, 1, '#c9ced6'); p.rect(48, oy + 29, 2, 3, C.woodD);
  }
  function mineEntrance(p, cx, base) {
    // boca de la mina con marco de madera, y una vagoneta con mineral
    p.ellipse(cx, base - 4, 6, 7, null, (u, v) => (v > 0.55 ? null : '#1a1418'));
    p.rect(cx - 7, base - 10, 2, 10, C.wood); p.rect(cx + 5, base - 10, 2, 10, C.woodD);
    p.rect(cx - 8, base - 12, 16, 2, C.wood); p.rect(cx - 8, base - 12, 16, 1, C.woodHi);
    p.rect(cx - 4, base + 2, 2, 8, '#6a5a4a'); p.rect(cx + 2, base + 2, 2, 8, '#6a5a4a'); // raíles
    for (let k = 0; k < 4; k++) p.rect(cx - 5, base + 3 + k * 2, 10, 1, C.woodD);
    const vy = base + 8;
    p.rect(cx + 8, vy - 4, 9, 4, '#5c5f66'); p.rect(cx + 8, vy - 4, 9, 1, '#8c9098');
    p.set(cx + 10, vy - 5, C.gold); p.set(cx + 12, vy - 6, C.goldHi); p.set(cx + 14, vy - 5, C.gold); p.set(cx + 11, vy - 5, '#7d7a71');
    p.rect(cx + 9, vy, 2, 2, '#2a2a2a'); p.rect(cx + 14, vy, 2, 2, '#2a2a2a');
  }
  function pier(p, w, river) {
    // muelle de tablas que sale de la orilla y una barca amarrada
    const x0 = river ? 14 : 8, y0 = river ? 30 : 26;
    for (let k = 0; k < 6; k++) { p.rect(x0 + k * 3, w + y0, 2, 9, k % 2 ? C.wood : C.woodHi); p.rect(x0 + k * 3, w + y0 + 9, 2, 3, C.woodD); }
    p.rect(x0 + 1, w + y0 + 9, 16, 1, C.woodD);
    const bx = x0 + 22, by = w + y0 + 6;
    p.rect(bx, by, 12, 3, '#8a5a2b'); p.rect(bx + 1, by + 3, 10, 2, '#5e3c1c'); p.rect(bx, by, 12, 1, C.woodHi);
    p.rect(bx + 5, by - 9, 1, 9, C.woodD); p.rect(bx + 6, by - 8, 5, 5, '#efe6cf'); p.rect(bx + 6, by - 4, 4, 1, '#d4c9a8');
    p.line(x0 + 17, w + y0 + 2, bx, by + 1, '#d9c79a'); // cuerda
    // red de pesca
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) p.set(x0 + 2 + i * 2, w + y0 - 3 + j * 2, '#c9c0a0');
  }

  // --- Ciudades ------------------------------------------------------------------
  // Tamaño según el nivel: 1-2 aldea, 3-4 villa con empalizada, 5-7 ciudad con torre.
  function makeCityCanvas(color, size, capital) {
    const p = new Pix(TW, TH), oy = TOP;
    const [r, g, b] = hex2rgb(color);
    const roof = [[Math.min(255, r + 60), Math.min(255, g + 60), Math.min(255, b + 60)], [r, g, b], [r * 0.6, g * 0.6, b * 0.6].map(Math.round)];
    // plaza de tierra
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const d = edgeDist(x, y);
      if (d >= 5) p.set(x, oy + y, (x * 3 + y * 5) % 7 === 0 ? '#b89a66' : (x + y) % 2 ? '#cdb07a' : '#c4a670');
    }
    const houses = size === 1
      ? [[12, 26, 9, 6], [30, 22, 10, 7], [22, 38, 9, 6]]
      : size === 2
        ? [[8, 24, 8, 6], [22, 20, 9, 7], [36, 24, 8, 6], [12, 38, 9, 6], [32, 40, 9, 6]]
        : [[6, 26, 8, 6], [38, 26, 8, 6], [8, 40, 9, 6], [36, 42, 9, 6], [20, 44, 8, 5]];
    if (size === 3) {
      // castillo en el centro: torre con almenas
      const tx = 22, ty = oy + 34;
      shadowSoft(p, tx + 8, ty + 1, 12, 3);
      p.rect(tx, ty - 22, 12, 22, '#c9c3b4'); p.rect(tx + 9, ty - 22, 3, 22, '#9e988a');
      for (let k = 0; k < 4; k++) p.rect(tx + k * 3, ty - 25, 2, 3, k === 3 ? '#9e988a' : '#c9c3b4');
      p.rect(tx + 4, ty - 6, 4, 6, '#3a2a20'); p.rect(tx + 3, ty - 15, 2, 3, '#2a2030'); p.rect(tx + 7, ty - 15, 2, 3, '#2a2030');
      for (let k = 0; k < 22; k += 4) p.rect(tx, ty - 22 + k, 9, 1, '#b4ae9f');
    }
    houses.sort((a, b) => a[1] - b[1]).forEach(([x, y, w, h]) => house(p, x, oy + y, w, h, roof));
    if (size >= 2) {
      // empalizada (o muralla de piedra en las grandes) por delante
      for (let x = 4; x < W - 4; x += 3) {
        const y = H - 6 - Math.abs(x + 1.5 - W / 2) * (H / 4) / (W / 2) * 0.9;
        if (edgeDist(x, Math.round(y)) < 2) continue;
        const stone = size === 3;
        p.rect(x, oy + Math.round(y) - 6, 2, 6, stone ? '#b4ae9f' : C.wood);
        p.set(x, oy + Math.round(y) - 7, stone ? '#d8d2c4' : C.woodHi);
        p.set(x + 1, oy + Math.round(y) - 6, stone ? '#8a8577' : C.woodD);
      }
    }
    // bandera de la facción (más alta en la capital, con corona)
    const fx = size === 3 ? 28 : 26, fy = size === 3 ? oy + 9 : oy + 14, fh = capital ? 22 : 16;
    p.rect(fx, fy - fh, 1, fh, '#3b2414');
    for (let y = 0; y < 6; y++) for (let x = 0; x < 9; x++) p.set(fx + 1 + x, fy - fh + y + Math.round(Math.sin(x / 2) * 0.7), y < 1 ? roof[0] : y > 4 ? roof[2] : roof[1]);
    if (capital) { p.rect(fx - 2, fy - fh - 3, 5, 2, '#f5cf3a'); p.set(fx - 2, fy - fh - 4, '#f5cf3a'); p.set(fx, fy - fh - 4, '#fff2a8'); p.set(fx + 2, fy - fh - 4, '#f5cf3a'); }
    return p.done();
  }


  // Territorio: un velo suave del color de la facción y una raya en los lados que dan fuera (mask: bits E, O, NO, NE, SO, SE).
  function makeBorderCanvas(color, mask) {
    const p = new Pix(TW, TH);
    const [r, g, b] = hex2rgb(color), dark = [r * 0.45, g * 0.45, b * 0.45].map(Math.round);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!insideHex(x, y)) continue;
      const ds = sideDists(x, y);
      let near = 99;
      ds.forEach((d, i) => { if (mask & (1 << i)) near = Math.min(near, d); });
      if (near < 1.6) p.set(x, TOP + y, dark, 200);
      else if (near < 4.2) p.set(x, TOP + y, [r, g, b], 235);
      else if (near < 6) p.set(x, TOP + y, [r, g, b], 70);
      else if ((x + y) % 4 === 0) p.set(x, TOP + y, [r, g, b], 40);
    }
    return p.done();
  }

  // --- Casilla completa -----------------------------------------------------
  function makeTerrainCanvas(terrain, resource, variant, open, building) {
    const p = new Pix(TW, TH);
    const r = makeRng(variant * 7919 + terrain.length * 131 + (resource ? resource.length * 17 : 0) + 3);
    const oy = TOP;

    if (terrain === 'mar' || terrain === 'costa') {
      const w = TOP + WATER_DROP, deep = terrain === 'mar';
      face(p, w, deep ? C.sea : C.coast, r, deep ? '#24548d' : '#3a86c2');
      waves(p, w, r, deep ? 5 : 4, deep ? C.seaHi : C.coastHi);
      if (!deep) for (let i = 0; i < 14; i++) { // espuma
        const x = Math.floor(r() * W), y = Math.floor(r() * H);
        if (edgeDist(x, y) === 2) p.set(x, w + y, C.foam);
      }
      if (resource === 'pesca') { fishShadows(p, w, r); if (building) pier(p, w, false); else fish(p, 28 + Math.floor(r() * 6) - 3, w + 22); }
      return p.done();
    }

    if (terrain === 'rio') {
      side(p, C.dirt);
      // El agua llega hasta los lados que tocan otro río o el mar ("open"); en el resto hay orilla.
      const bankDist = (x, y) => {
        if (!insideHex(x, y)) return 0;
        const ds = sideDists(x, y);
        let d = 99;
        ds.forEach((v, i) => { if (!(open & (1 << i))) d = Math.min(d, v); });
        return Math.max(1, Math.ceil(d));
      };
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const d = bankDist(x, y);
        if (d === 0) continue;
        let c;
        if (d === 1) c = C.grassEdge;
        else if (d === 2) c = C.grass[(x + y) % 3];
        else if (d === 3) c = C.bank;
        else if (d === 4) c = C.river[2];
        else {
          const flow = (x * 2 + y * 3 + variant * 5) % 13;
          c = flow === 0 ? C.riverHi : flow < 4 ? C.river[1] : C.river[0];
        }
        p.set(x, oy + y, c);
      }
      for (let i = 0; i < 24; i++) { // juncos
        const x = Math.floor(r() * W), y = Math.floor(r() * H);
        if (bankDist(x, y) !== 3) continue;
        p.set(x, oy + y, C.reed); p.set(x, oy + y - 1, C.reed); p.set(x, oy + y - 2, '#6aa83f');
      }
      if (resource === 'pesca') { if (building) pier(p, oy, true); else fish(p, 28, oy + 24); }
      return p.done();
    }

    if (terrain === 'llanura') {
      side(p, C.dirt);
      face(p, oy, C.grass, r, C.grassEdge);
      grassTufts(p, oy, r, 10);
      if (building) {
        plowedField(p, oy);
      } else if (resource === 'trigo') {
        wildWheat(p, oy, r);
      } else {
        flowers(p, oy, r, 6);
        if (r() < 0.5) roundTree(p, 12 + Math.floor(r() * 30), oy + 22 + Math.floor(r() * 12), 0.8);
      }
      return p.done();
    }

    if (terrain === 'bosque') {
      side(p, C.dirt);
      face(p, oy, C.forestFloor, r, '#4b7f2e');
      if (resource === 'caza' && building) {
        forest(p, r, 5, (x, y) => Math.abs(x - 30) < 18 && Math.abs(y - 26) < 12);
        hunterHut(p, oy);
      } else if (resource === 'lena' && building) {
        [[14, 18], [44, 20]].forEach(([x, y]) => roundTree(p, x, oy + y, 1.4));
        sawmill(p, oy);
      } else if (resource === 'caza') {
        forest(p, r, 5, (x, y) => Math.abs(x - 28) < 12 && Math.abs(y - 28) < 8);
        deer(p, 27, oy + 33);
      } else if (resource === 'lena') {
        // bosque de árboles grandes y viejos, con un tronco caído
        const big = [[14, 18], [38, 16], [26, 30], [44, 34], [10, 36]];
        big.forEach(([x, y]) => roundTree(p, x + Math.floor(r() * 3) - 1, oy + y, 1.5));
        fallenLog(p, 18, oy + 42);
      } else {
        grassTufts(p, oy, r, 6, '#4b8a2e');
        forest(p, r, 8);
      }
      return p.done();
    }

    if (terrain === 'montana') {
      side(p, C.stoneSide);
      face(p, oy, C.rockGround, r, '#7d875a');
      if (building === 'cantera') { quarry(p, oy, true); return p.done(); }
      const cx = 30 + Math.floor(r() * 4) - 2, base = oy + 34, top = oy - 30 + Math.floor(r() * 6);
      mountain(p, cx - 15, oy + 26, oy - 8, 11, false); // montañita de atrás
      mountain(p, cx, base, top, 20, true);
      if (resource === 'mineral') {
        goldVeins(p, cx, base, top, 20, r);
        if (building) mineEntrance(p, cx - 4, base + 2);
        else { oreRock(p, cx - 9, base + 6); oreRock(p, cx + 12, base + 8); }
      } else {
        grassTufts(p, oy, r, 4, '#6f7a48');
      }
      return p.done();
    }
    return p.done();
  }

  function makeFogCanvas() {
    const p = new Pix(TW, TH), r = makeRng(99);
    side(p, ['#15131c', '#100e16']);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!insideHex(x, y)) continue;
      const v = r();
      p.set(x, TOP + y, edgeDist(x, y) === 1 ? '#121019' : v < 0.15 ? '#2b2736' : (x + y) % 2 ? '#1d1a26' : '#221f2c');
    }
    return p.done();
  }

  function makeOutlineCanvas(color) {
    const p = new Pix(TW, TH);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const d = edgeDist(x, y);
      if (d === 1 || d === 2) p.set(x, TOP + y, color);
      else if (d === 3) p.set(x, TOP + y, '#000000', 90);
    }
    return p.done();
  }

  // Casilla resaltada (a dónde puede ir una tropa, o a quién puede atacar).
  function makeFillCanvas(fill, alpha, edge) {
    const p = new Pix(TW, TH);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const d = edgeDist(x, y);
      if (!d) continue;
      if (d <= 2) p.set(x, TOP + y, edge, 230);
      else if ((x + y) % 2 === 0 || d <= 4) p.set(x, TOP + y, fill, alpha);
    }
    return p.done();
  }

  function makeFlagCanvas(color) {
    const p = new Pix(20, 30);
    const [r, g, b] = hex2rgb(color);
    const light = [Math.min(255, r + 50), Math.min(255, g + 50), Math.min(255, b + 50)];
    const dark = [r * 0.65, g * 0.65, b * 0.65];
    p.ellipse(4, 28, 4, 1.5, [20, 30, 15]);
    p.rect(3, 2, 2, 26, '#3b2414'); p.rect(3, 2, 1, 26, '#6b4426');
    p.rect(2, 0, 4, 3, '#e8c34a');
    for (let y = 0; y < 12; y++) for (let x = 0; x < 13; x++) {
      const wave = Math.round(Math.sin((x / 13) * Math.PI * 1.5) * 1.5);
      const c = y < 2 ? light : y > 9 ? dark : [r, g, b];
      if (x > 9 && (y < 3 || y > 8)) continue;
      p.set(5 + x, 3 + y + wave, c);
    }
    return p.done();
  }

  // Esquina de arriba a la izquierda de cada casilla en el mundo.
  function tileOrigin(col, row) {
    return { x: col * COL_STEP + (row & 1) * (COL_STEP / 2), y: row * ROW_STEP };
  }

  root.PETiles = {
    W, H, TW, TH, TOP, SIDE, WATER_DROP, ROW_STEP, COL_STEP, VARIANTS,
    makeTerrainCanvas, makeCityCanvas, makeBorderCanvas, makeFogCanvas, makeOutlineCanvas, makeFlagCanvas, makeFillCanvas, tileOrigin, insideHex, edgeDist, Pix, hex2rgb,
  };
})(this);
