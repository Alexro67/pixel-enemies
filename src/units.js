// Pixel Enemies - dibujo de las tropas en pixel art (con código, sin imágenes).
// Cada tropa se pinta con el color de su facción. Todas miran a la derecha;
// el juego les da la vuelta cuando miran a la izquierda.
(function (root) {
  'use strict';
  const { Pix, hex2rgb } = root.PETiles;

  const SKIN = ['#f1c29a', '#d9a477', '#b07e55'];
  const WOOD = ['#a9773f', '#80562a', '#5b3b1c'];
  const STEEL = ['#e4e8ee', '#a9b1bc', '#6d7580'];
  const LEATHER = ['#8b5a32', '#6a4224', '#4a2d17'];
  const OUTLINE = [26, 20, 32];

  function shades(color) {
    const [r, g, b] = hex2rgb(color);
    const mix = (k, t) => [r + (t[0] - r) * k, g + (t[1] - g) * k, b + (t[2] - b) * k].map(Math.round);
    return [mix(0.35, [255, 255, 235]), [r, g, b], mix(0.38, [20, 10, 30]), mix(0.6, [20, 10, 30])];
  }

  // Contorno oscuro de 1 píxel para que la tropa se lea bien sobre cualquier terreno.
  function outline(p) {
    const d = p.img.data, w = p.w, h = p.h, solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 200;
    const add = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
      if (!solid(x, y) && d[(y * w + x) * 4 + 3] === 0 && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) add.push([x, y]);
    add.forEach(([x, y]) => p.set(x, y, OUTLINE));
  }
  function shadow(p, cx, cy, rx) {
    for (let y = -2; y <= 2; y++) for (let x = -rx; x <= rx; x++)
      if ((x * x) / (rx * rx) + (y * y) / 4 <= 1) p.set(cx + x, cy + y, [10, 20, 10], 90);
  }
  function head(p, cx, cy) { // cara de 6x6 con ojo y nariz, mirando a la derecha
    p.ellipse(cx, cy, 3.2, 3.4, null, (u, v) => (u < -0.3 ? SKIN[1] : SKIN[0]));
    p.set(cx + 1, cy, '#2a1a12');               // ojo
    p.set(cx + 3, cy + 1, SKIN[1]);             // nariz
    p.set(cx - 1, cy + 2, SKIN[2]); p.set(cx, cy + 2, SKIN[1]);
  }
  function body(p, x, y, w, h, c) { // túnica con luz por la izquierda
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const narrow = j > h - 3 && (i === 0 || i === w - 1) ? false : true;
      if (!narrow) continue;
      p.set(x + i, y + j, i === 0 ? c[0] : i >= w - 2 ? c[2] : c[1]);
    }
  }
  function legs(p, x, y, pants) {
    p.rect(x, y, 2, 5, pants[1]); p.rect(x + 3, y, 2, 5, pants[2]);
    p.rect(x - 1, y + 5, 3, 2, LEATHER[2]); p.rect(x + 3, y + 5, 3, 2, LEATHER[2]);
  }

  function miliciano(color) {
    const c = shades(color), p = new Pix(28, 36);
    shadow(p, 14, 33, 8);
    // lanza detrás del brazo
    p.line(21, 4, 21, 32, WOOD[1]); p.line(22, 6, 22, 31, WOOD[2]);
    p.set(21, 1, STEEL[0]); p.rect(20, 2, 3, 3, STEEL[1]); p.set(21, 2, STEEL[0]); p.set(22, 4, STEEL[2]);
    legs(p, 11, 25, LEATHER);
    body(p, 10, 16, 8, 10, c);
    p.rect(10, 22, 8, 1, LEATHER[2]); p.set(14, 22, '#d8b04a');      // cinturón con hebilla
    p.rect(11, 15, 6, 2, c[0]);                                       // hombros
    p.rect(18, 18, 3, 3, SKIN[0]); p.set(20, 19, SKIN[1]);            // mano en la lanza
    head(p, 14, 11);
    // gorro de cuero
    p.rect(10, 6, 8, 3, LEATHER[1]); p.rect(11, 5, 6, 1, LEATHER[0]); p.rect(9, 9, 10, 1, LEATHER[2]);
    // escudo redondo con el color de la facción
    p.ellipse(9, 21, 5, 5.5, null, (u, v) => {
      const r2 = u * u + v * v;
      if (r2 > 0.62) return WOOD[r2 > 0.85 ? 2 : 1];
      if (r2 < 0.08) return STEEL[0];
      return u + v < -0.3 ? c[0] : u + v > 0.5 ? c[2] : c[1];
    });
    outline(p);
    return p.done();
  }

  function arquero(color) {
    const c = shades(color), p = new Pix(28, 36);
    shadow(p, 13, 33, 8);
    // carcaj a la espalda
    p.rect(6, 13, 3, 9, LEATHER[1]); p.rect(6, 13, 1, 9, LEATHER[0]);
    p.set(6, 11, '#f4f0e0'); p.set(7, 10, '#e05a3a'); p.set(8, 11, '#f4f0e0'); p.set(7, 12, WOOD[2]);
    legs(p, 10, 25, ['#6b7a3a', '#56632e', '#414b22']);
    body(p, 9, 16, 8, 10, c);
    p.rect(9, 22, 8, 1, LEATHER[2]);
    head(p, 13, 11);
    // capucha
    p.ellipse(12, 9, 4.6, 4, null, (u, v) => (v > 0.35 && u > -0.2 ? null : u < -0.2 ? c[2] : c[1]));
    p.set(15, 7, c[0]); p.set(14, 6, c[0]); p.rect(8, 11, 2, 5, c[2]);
    // arco: curva de madera y cuerda
    for (let y = 6; y <= 30; y++) {
      const t = (y - 18) / 12, x = Math.round(20 + 3.2 * (1 - t * t));
      p.set(x, y, Math.abs(t) > 0.85 ? WOOD[2] : WOOD[0]); p.set(x + 1, y, WOOD[2]);
    }
    p.line(20, 6, 20, 30, '#efe6cf');
    p.rect(17, 18, 3, 2, SKIN[0]); p.set(21, 18, SKIN[0]); p.set(22, 18, SKIN[1]); // manos
    p.line(15, 17, 26, 17, WOOD[1]); p.set(26, 17, STEEL[1]); p.set(27, 17, STEEL[2]); // flecha
    outline(p);
    return p.done();
  }

  function jinete(color) {
    const c = shades(color), p = new Pix(36, 36);
    const HORSE = ['#b27a45', '#8c5a30', '#64401f'], MANE = '#3a2414';
    shadow(p, 18, 33, 13);
    // patas
    [[9, HORSE[2]], [12, HORSE[1]], [22, HORSE[2]], [25, HORSE[1]]].forEach(([x, col]) => {
      p.rect(x, 24, 2, 7, col); p.rect(x, 30, 2, 1, '#2a1a10');
    });
    // cuerpo del caballo
    p.ellipse(17, 21, 11, 5, null, (u, v) => (v < -0.4 ? HORSE[0] : v > 0.5 ? HORSE[2] : HORSE[1]));
    // cuello y cabeza
    for (let k = 0; k < 8; k++) p.rect(24 + k * 0.6, 17 - k, 4, 3, k < 3 ? HORSE[1] : HORSE[0]);
    p.rect(28, 8, 6, 4, HORSE[0]); p.rect(32, 10, 3, 3, HORSE[1]); p.set(34, 12, '#2a1a10');
    p.set(30, 9, '#1a1010'); p.rect(28, 6, 2, 2, HORSE[1]);
    for (let k = 0; k < 7; k++) p.set(26 + k * 0.5, 15 - k, MANE), p.set(25 + k * 0.5, 15 - k, MANE);
    // cola
    p.line(6, 18, 4, 27, MANE); p.line(7, 19, 5, 27, MANE); p.line(5, 19, 3, 25, '#5a3a20');
    // manta de la silla con el color de la facción
    for (let y = 15; y <= 24; y++) for (let x = 12; x <= 21; x++) {
      if (y > 21 && (x === 12 || x === 21)) continue;
      p.set(x, y, y === 24 ? c[3] : x < 14 ? c[0] : x > 19 ? c[2] : c[1]);
    }
    p.rect(12, 21, 10, 1, '#e8c34a');
    // jinete
    p.rect(15, 18, 2, 5, LEATHER[1]);
    body(p, 13, 9, 7, 8, c);
    head(p, 17, 5);
    p.rect(13, 1, 8, 3, STEEL[1]); p.rect(14, 0, 6, 1, STEEL[0]); p.rect(13, 3, 9, 1, STEEL[2]); p.set(20, 2, STEEL[0]);
    p.rect(19, 12, 3, 2, SKIN[0]);
    // lanza con banderín
    p.line(11, 18, 33, 2, WOOD[1]);
    p.set(34, 1, STEEL[0]); p.set(33, 1, STEEL[1]); p.set(34, 2, STEEL[1]);
    p.rect(26, 6, 3, 2, c[1]); p.set(29, 6, c[1]); p.set(26, 8, c[2]);
    outline(p);
    return p.done();
  }

  const DRAW = { miliciano, arquero, jinete };
  function makeUnitCanvas(type, color) { return DRAW[type](color); }

  root.PEUnits = { makeUnitCanvas, TYPES: Object.keys(DRAW) };
})(this);
