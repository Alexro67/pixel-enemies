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
  function wheatField(p, oy, r) {
    // tierra arada en surcos y espigas creciendo
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (edgeDist(x, y) < 4) continue;
      const band = (x + y * 2) % 8;
      p.set(x, oy + y, band < 2 ? C.furrow : band < 3 ? '#b38d45' : '#c9a24a');
    }
    for (let y = 8; y < H - 2; y += 3) for (let x = 4; x < W - 3; x += 3) {
      const xx = x + ((y / 3) % 2 ? 1 : 0) + Math.floor(r() * 2);
      if (edgeDist(xx, y) < 5) continue;
      const h = 4 + Math.floor(r() * 3);
      for (let k = 0; k < h; k++) p.set(xx, oy + y - k, k < 2 ? C.wheatD : C.wheat);
      p.set(xx, oy + y - h, C.wheatHi); p.set(xx + 1, oy + y - h + 1, C.wheat); p.set(xx - 1, oy + y - h + 1, C.wheatD);
    }
  }
  function stoneBlocks(p, cx, cy, r, n) {
    for (let i = 0; i < n; i++) {
      const x = cx + Math.floor((r() - 0.5) * 18), y = cy + Math.floor((r() - 0.5) * 8);
      const w = 5 + Math.floor(r() * 3), h = 4;
      p.rect(x, y, w, h, '#9a978e'); p.rect(x, y, w, 1, '#d2cfc5'); p.rect(x + w - 1, y, 1, h, '#6a675e');
      p.rect(x, y + h, w, 1, '#4c4a43');
    }
  }
  function quarryPit(p, oy) {
    // terrazas de piedra cortada en el suelo
    for (let k = 0; k < 4; k++) {
      const x0 = 12 + k * 2, x1 = 44 - k * 2, y = oy + 18 + k * 4;
      p.rect(x0, y, x1 - x0, 4, k % 2 ? '#8e8b81' : '#a4a196');
      p.rect(x0, y, x1 - x0, 1, '#c8c5bb');
      for (let x = x0 + 3; x < x1; x += 6) p.set(x, y + 2, '#6a675e');
    }
  }
  function mineEntrance(p, cx, base) {
    p.rect(cx - 5, base - 9, 10, 9, C.woodD);
    p.rect(cx - 4, base - 8, 8, 8, '#1a1410');
    p.rect(cx - 5, base - 10, 10, 2, C.wood); p.rect(cx - 5, base - 10, 10, 1, C.woodHi);
    p.rect(cx - 6, base - 9, 2, 9, C.wood); p.rect(cx + 4, base - 9, 2, 9, C.wood);
    // vagoneta con oro
    p.rect(cx + 8, base - 4, 7, 4, '#5a5a62'); p.rect(cx + 8, base - 4, 7, 1, '#8a8a94');
    p.set(cx + 9, base - 5, C.gold); p.set(cx + 10, base - 6, C.goldHi); p.set(cx + 12, base - 5, C.gold); p.set(cx + 13, base - 5, C.gold);
    p.set(cx + 9, base, '#222'); p.set(cx + 13, base, '#222');
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
  function logPile(p, x, y) {
    for (const [dx, dy] of [[0, 0], [5, 0], [10, 0], [2.5, -4], [7.5, -4], [5, -8]]) {
      p.ellipse(x + dx, y + dy - 2, 2.6, 2.4, null, (u, v) => (u * u + v * v < 0.25 ? C.woodHi : u * u + v * v < 0.6 ? C.ring : C.woodD));
    }
  }
  function stump(p, x, y, axe) {
    p.rect(x - 3, y - 3, 6, 3, C.wood); p.ellipse(x, y - 3, 3, 1.5, C.ring);
    if (axe) { p.line(x + 1, y - 4, x + 4, y - 10, '#7a5a3a'); p.rect(x + 3, y - 11, 3, 2, '#c8ccd2'); }
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

  // --- Casilla completa -----------------------------------------------------
  function makeTerrainCanvas(terrain, resource, variant, open) {
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
      if (resource === 'pesca') { fishShadows(p, w, r); fish(p, 28 + Math.floor(r() * 6) - 3, w + 22); }
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
      if (resource === 'pesca') fish(p, 28, oy + 24);
      return p.done();
    }

    if (terrain === 'llanura') {
      side(p, C.dirt);
      face(p, oy, C.grass, r, C.grassEdge);
      if (resource === 'trigo') {
        wheatField(p, oy, r);
      } else if (resource === 'cantera') {
        quarryPit(p, oy); stoneBlocks(p, 28, oy + 10, r, 2);
      } else {
        grassTufts(p, oy, r, 14); flowers(p, oy, r, 6);
        if (r() < 0.5) roundTree(p, 12 + Math.floor(r() * 30), oy + 22 + Math.floor(r() * 12), 0.8);
      }
      return p.done();
    }

    if (terrain === 'bosque') {
      side(p, C.dirt);
      face(p, oy, C.forestFloor, r, '#4b7f2e');
      if (resource === 'caza') {
        forest(p, r, 5, (x, y) => Math.abs(x - 28) < 12 && Math.abs(y - 28) < 8);
        deer(p, 27, oy + 33);
      } else if (resource === 'lena') {
        forest(p, r, 4, (x, y) => y > 22);
        stump(p, 16, oy + 32, true); stump(p, 40, oy + 36, false); logPile(p, 24, oy + 40);
      } else {
        grassTufts(p, oy, r, 6, '#4b8a2e');
        forest(p, r, 8);
      }
      return p.done();
    }

    if (terrain === 'montana') {
      side(p, C.stoneSide);
      face(p, oy, C.rockGround, r, '#7d875a');
      const cx = 30 + Math.floor(r() * 4) - 2, base = oy + 34, top = oy - 30 + Math.floor(r() * 6);
      mountain(p, cx - 15, oy + 26, oy - 8, 11, false); // montañita de atrás
      mountain(p, cx, base, top, 20, resource !== 'cantera');
      if (resource === 'mineral') {
        goldVeins(p, cx, base, top, 20, r);
        mineEntrance(p, cx - 6, base + 4);
      } else if (resource === 'cantera') {
        // la falda cortada en bloques
        for (let k = 0; k < 3; k++) {
          const y = base - 14 + k * 5, hw = 6 + k * 4;
          p.rect(cx - hw, y, hw * 2, 5, k % 2 ? '#a4a196' : '#bab7ad');
          p.rect(cx - hw, y, hw * 2, 1, '#dcd9cf');
          p.rect(cx + hw - 2, y, 2, 5, '#77746b');
        }
        stoneBlocks(p, cx - 2, base + 4, r, 2);
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
    makeTerrainCanvas, makeFogCanvas, makeOutlineCanvas, makeFlagCanvas, tileOrigin, insideHex,
  };
})(this);
