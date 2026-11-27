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

  // Colono: lleva un hatillo a la espalda y un bastón con el estandarte para fundar la ciudad.
  function colono(color) {
    const c = shades(color), p = new Pix(28, 36);
    shadow(p, 14, 33, 8);
    // hatillo grande a la espalda
    p.ellipse(8, 17, 4.5, 5.5, null, (u, v) => (u + v < -0.4 ? '#d8c08a' : u + v > 0.5 ? '#8f7444' : '#b89b62'));
    p.rect(6, 12, 5, 1, LEATHER[2]); p.set(8, 21, LEATHER[2]);
    // bastón con estandarte
    p.line(21, 3, 21, 32, WOOD[1]); p.line(22, 4, 22, 31, WOOD[2]);
    for (let y = 0; y < 6; y++) for (let x = 0; x < 5; x++) p.set(22 + x, 3 + y, y === 0 ? c[0] : y > 4 ? c[2] : c[1]);
    legs(p, 11, 25, ['#7a6a52', '#655640', '#4d412f']);
    body(p, 10, 16, 8, 10, ['#cdbb94', '#b3a07a', '#8a7858', '#6a5a40']);
    p.rect(10, 16, 8, 2, c[1]); // pañuelo con el color de la facción
    p.rect(10, 22, 8, 1, LEATHER[2]);
    p.rect(18, 18, 3, 3, SKIN[0]); p.set(20, 19, SKIN[1]);
    head(p, 14, 11);
    // sombrero de paja de ala ancha
    p.rect(9, 8, 11, 1, '#c59c48'); p.rect(11, 5, 7, 3, '#e2c070'); p.rect(11, 7, 7, 1, '#8a6a2c');
    outline(p);
    return p.done();
  }

  // Espadachín: casco de hierro, cota con el color de la facción, espada en alto y escudo de cometa.
  function espadachin(color) {
    const c = shades(color), p = new Pix(28, 36);
    shadow(p, 14, 33, 8);
    // espada levantada
    p.line(21, 3, 21, 19, STEEL[0]); p.line(22, 4, 22, 19, STEEL[2]);
    p.rect(19, 19, 5, 1, '#d8b04a'); p.rect(21, 20, 2, 2, LEATHER[1]);
    legs(p, 11, 25, STEEL);
    body(p, 10, 16, 8, 10, c);
    p.rect(10, 16, 8, 1, STEEL[1]); p.rect(10, 22, 8, 1, LEATHER[2]); p.set(14, 22, '#d8b04a');
    p.rect(11, 15, 6, 2, STEEL[1]);                                   // hombreras
    p.rect(18, 19, 3, 3, SKIN[0]);
    head(p, 14, 11);
    // yelmo con nasal
    p.rect(10, 5, 8, 4, STEEL[1]); p.rect(11, 4, 6, 1, STEEL[0]); p.rect(10, 5, 2, 4, STEEL[0]);
    p.rect(9, 9, 10, 1, STEEL[2]); p.rect(16, 9, 1, 3, STEEL[2]);
    // escudo de cometa
    for (let y = 0; y < 12; y++) {
      const half = Math.max(0, Math.round(4 - Math.max(0, y - 5) * 0.7));
      for (let x = -half; x <= half; x++) p.set(8 + x, 16 + y, Math.abs(x) === half ? STEEL[2] : x < 0 ? c[0] : c[1]);
    }
    p.line(8, 17, 8, 26, '#f4e9c9');
    outline(p);
    return p.done();
  }

  // Lancero: pica larga, gambesón acolchado y escudo grande.
  function lancero(color) {
    const c = shades(color), p = new Pix(28, 36);
    shadow(p, 14, 33, 8);
    p.line(23, 0, 23, 32, WOOD[1]); p.line(24, 1, 24, 31, WOOD[2]);       // pica más larga que la lanza
    p.rect(22, 0, 3, 1, STEEL[1]); p.set(23, 0, STEEL[0]);
    p.set(22, 1, STEEL[2]); p.set(24, 1, STEEL[2]); p.rect(21, 5, 5, 1, c[1]); // banderín
    legs(p, 11, 25, LEATHER);
    body(p, 10, 16, 8, 10, ['#e8dcbc', '#cfc19c', '#a89a76', '#857754']);
    for (let y = 17; y < 25; y += 2) p.rect(11, y, 6, 1, '#b3a47e');      // acolchado
    p.rect(11, 15, 6, 2, c[1]);
    p.rect(18, 18, 5, 3, SKIN[0]);
    head(p, 14, 11);
    p.ellipse(14, 7, 4.5, 2.6, null, (u, v) => (v > 0.4 ? null : u < -0.2 ? STEEL[0] : STEEL[1])); // capacete
    p.rect(9, 8, 11, 1, STEEL[2]);
    // escudo grande rectangular con banda
    p.rect(4, 15, 8, 12, c[1]); p.rect(4, 15, 2, 12, c[0]); p.rect(10, 15, 2, 12, c[2]);
    p.rect(4, 20, 8, 2, '#f4e9c9'); p.rect(4, 15, 8, 1, WOOD[2]); p.rect(4, 26, 8, 1, WOOD[2]);
    outline(p);
    return p.done();
  }

  // Caballero: caballo con gualdrapa, armadura completa y lanza de torneo.
  function caballero(color) {
    const c = shades(color), p = new Pix(36, 36);
    const HORSE = ['#e6e2da', '#bdb8ae', '#8c877e'], MANE = '#5a5650';
    shadow(p, 18, 33, 13);
    [[9, HORSE[2]], [12, HORSE[1]], [22, HORSE[2]], [25, HORSE[1]]].forEach(([x, col]) => {
      p.rect(x, 24, 2, 7, col); p.rect(x, 30, 2, 1, '#2a1a10');
    });
    p.ellipse(17, 21, 11, 5, null, (u, v) => (v < -0.4 ? HORSE[0] : v > 0.5 ? HORSE[2] : HORSE[1]));
    for (let k = 0; k < 8; k++) p.rect(24 + k * 0.6, 17 - k, 4, 3, k < 3 ? HORSE[1] : HORSE[0]);
    p.rect(28, 8, 6, 4, HORSE[0]); p.rect(32, 10, 3, 3, HORSE[1]); p.set(34, 12, '#2a1a10');
    p.rect(28, 8, 5, 2, STEEL[1]); p.set(30, 9, '#1a1010');             // testera
    for (let k = 0; k < 7; k++) p.set(26 + k * 0.5, 15 - k, MANE), p.set(25 + k * 0.5, 15 - k, MANE);
    p.line(6, 18, 4, 27, MANE); p.line(7, 19, 5, 27, MANE);
    // gualdrapa larga con el color de la facción
    for (let y = 16; y <= 27; y++) for (let x = 8; x <= 25; x++) {
      if (y > 24 && (x % 4 === 0)) continue;
      const inEll = ((x - 17) * (x - 17)) / 110 + ((y - 21) * (y - 21)) / 40 <= 1.2;
      if (inEll) p.set(x, y, y === 16 ? c[0] : (x + y) % 6 === 0 ? '#e8c34a' : x < 12 ? c[0] : x > 22 ? c[2] : c[1]);
    }
    // jinete con armadura
    p.rect(15, 17, 2, 5, STEEL[2]);
    body(p, 13, 9, 7, 8, STEEL);
    p.rect(14, 11, 5, 4, c[1]);                                         // sobreveste
    p.rect(13, 1, 8, 7, STEEL[1]); p.rect(13, 1, 2, 7, STEEL[0]); p.rect(19, 4, 2, 1, '#1a1010'); // yelmo cerrado
    p.rect(16, 0, 2, 1, c[1]); p.set(17, -1, c[0]);
    p.rect(19, 12, 3, 2, STEEL[1]);
    p.line(12, 15, 34, 9, WOOD[0]); p.line(12, 16, 34, 10, WOOD[2]); p.set(35, 9, STEEL[0]);
    outline(p);
    return p.done();
  }

  // Cañón: tubo de bronce sobre una cureña de madera con ruedas.
  function canon(color) {
    const c = shades(color), p = new Pix(36, 36);
    const BRONZE = ['#f0c66a', '#c9973a', '#8f6420'];
    shadow(p, 18, 33, 13);
    // cureña
    for (let k = 0; k < 16; k++) p.rect(8 + k, 22 - k * 0.25, 2, 4, k < 2 ? WOOD[2] : WOOD[1]);
    p.rect(8, 25, 16, 1, WOOD[2]);
    // tubo
    for (let k = 0; k < 20; k++) {
      const y = 18 - k * 0.35;
      p.rect(10 + k, y, 1, 5, BRONZE[1]); p.set(10 + k, y, BRONZE[0]); p.set(10 + k, y + 4, BRONZE[2]);
    }
    p.rect(29, 10, 3, 6, BRONZE[1]); p.rect(29, 10, 3, 1, BRONZE[0]); p.rect(31, 11, 1, 4, '#2a1a10'); // boca
    p.rect(14, 16, 2, 6, BRONZE[2]); p.rect(22, 13, 2, 6, BRONZE[2]);  // aros
    // rueda
    p.ellipse(16, 26, 5.5, 5.5, null, (u, v) => {
      const r2 = u * u + v * v;
      if (r2 > 0.7) return WOOD[2];
      if (r2 < 0.1) return STEEL[1];
      return Math.abs(u) < 0.15 || Math.abs(v) < 0.15 ? WOOD[1] : null;
    });
    // banderín de la facción en un palo detrás
    p.line(6, 8, 6, 26, WOOD[2]); p.rect(7, 8, 6, 4, c[1]); p.rect(7, 8, 6, 1, c[0]); p.rect(7, 11, 6, 1, c[2]);
    // balas
    p.ellipse(27, 29, 1.6, 1.6, null, () => STEEL[2]); p.ellipse(30, 29, 1.6, 1.6, null, () => STEEL[2]);
    outline(p);
    return p.done();
  }

  // Catapulta: armazón de madera con el brazo levantado y una piedra en la cuchara.
  function catapulta(color) {
    const c = shades(color), p = new Pix(36, 36);
    shadow(p, 18, 33, 14);
    p.rect(5, 24, 26, 3, WOOD[1]); p.rect(5, 24, 26, 1, WOOD[0]); p.rect(5, 26, 26, 1, WOOD[2]);  // base
    p.line(10, 24, 16, 13, WOOD[1]); p.line(11, 24, 17, 13, WOOD[2]);                             // soporte
    p.line(26, 24, 18, 13, WOOD[1]); p.line(25, 24, 17, 13, WOOD[2]);
    p.rect(15, 12, 5, 2, WOOD[2]);                                                               // eje
    p.line(17, 13, 6, 3, WOOD[0]); p.line(18, 13, 7, 3, WOOD[1]);                               // brazo
    p.rect(3, 0, 6, 3, WOOD[2]); p.ellipse(6, 0, 2.8, 2.3, null, (u, v) => (u + v < 0 ? '#bdb6a8' : '#8a8274')); // piedra
    p.rect(20, 16, 6, 6, c[1]); p.rect(20, 16, 6, 1, c[0]); p.rect(25, 16, 1, 6, c[2]);          // contrapeso con el color
    [[9, 27], [27, 27]].forEach(([x, y]) => p.ellipse(x, y, 4, 4, null, (u, v) => {
      const r2 = u * u + v * v;
      return r2 > 0.6 ? WOOD[2] : r2 < 0.12 ? STEEL[1] : WOOD[1];
    }));
    outline(p);
    return p.done();
  }

  // Monje: hábito con capucha, cordón, y un cayado con una lucecita de curación.
  function monje(color) {
    const c = shades(color), p = new Pix(28, 36);
    const HAB = ['#9a7a58', '#7a5c3e', '#5a422b', '#40301f'];
    shadow(p, 14, 33, 8);
    p.line(21, 4, 21, 32, WOOD[1]); p.line(22, 5, 22, 31, WOOD[2]);    // cayado
    p.ellipse(21, 3, 2.3, 2.3, null, (u, v) => (u + v < 0 ? '#fffbe0' : '#ffe58a'));
    p.set(18, 2, '#fff6b0'); p.set(24, 4, '#fff6b0'); p.set(20, 0, '#fff6b0');
    // hábito largo hasta los pies
    for (let j = 0; j < 17; j++) {
      const w = 8 + Math.floor(j / 4);
      for (let i = 0; i < w; i++) p.set(14 - Math.floor(w / 2) + i, 15 + j, i === 0 ? HAB[0] : i >= w - 2 ? HAB[2] : HAB[1]);
    }
    p.rect(9, 31, 3, 1, LEATHER[2]); p.rect(16, 31, 3, 1, LEATHER[2]);
    p.rect(10, 21, 9, 1, '#e8d8a8'); p.rect(12, 22, 1, 4, '#e8d8a8');   // cordón
    p.rect(13, 17, 3, 3, c[1]); p.set(14, 16, c[0]); p.set(14, 20, c[2]); // cruz/escapulario con el color
    p.rect(18, 18, 3, 3, SKIN[0]);
    head(p, 14, 11);
    // capucha bajada sobre la cabeza
    p.ellipse(13, 9, 4.8, 4.2, null, (u, v) => (v > 0.3 && u > -0.25 ? null : u < -0.2 ? HAB[2] : HAB[1]));
    p.rect(8, 11, 2, 5, HAB[2]);
    outline(p);
    return p.done();
  }

  // Mercader: con mula cargada de fardos, sombrero de ala y bolsa de monedas.
  function mercader(color) {
    const c = shades(color), p = new Pix(28, 36);
    shadow(p, 14, 33, 10);
    // fardo grande a la espalda, atado con cuerdas
    p.rect(3, 12, 8, 12, '#b8935a'); p.rect(3, 12, 8, 2, '#d8b87a'); p.rect(9, 12, 2, 12, '#8a6a3a');
    p.rect(3, 17, 8, 1, LEATHER[2]); p.rect(6, 12, 1, 12, LEATHER[2]);
    p.rect(4, 8, 6, 4, c[1]); p.rect(4, 8, 6, 1, c[0]); // tela del color de la facción
    legs(p, 11, 25, ['#6a5a7a', '#56486a', '#3e3450']);
    body(p, 10, 16, 8, 10, c);
    p.rect(10, 22, 8, 1, LEATHER[1]);
    // bolsa de monedas en la mano
    p.rect(18, 19, 3, 3, SKIN[0]);
    p.ellipse(21, 24, 2.6, 2.6, null, (u, v) => (u + v < -0.3 ? '#e8c060' : '#b08a30'));
    p.set(21, 21, LEATHER[2]); p.set(20, 24, '#fff2a8');
    head(p, 14, 11);
    // sombrero de fieltro con pluma
    p.rect(9, 8, 11, 1, '#3e2a1a'); p.rect(11, 5, 7, 3, '#5a3c24'); p.rect(11, 7, 7, 1, c[1]);
    p.line(16, 5, 19, 1, '#f4efe0');
    outline(p);
    return p.done();
  }

  // --- Barcos (miran a la derecha: la proa está a la derecha) ----------------
  const HULL = ['#b07a40', '#8a5a2b', '#5e3c1c', '#3e2812'];
  const SAIL = ['#fbf6e6', '#e6dcc0', '#c4b896'];
  // Casco: más ancho arriba, con la proa levantada a la derecha.
  function hull(p, x0, x1, top, deep, stripe) {
    for (let x = x0; x <= x1; x++) {
      const k = (x - x0) / (x1 - x0);
      const lift = k > 0.8 ? Math.round((k - 0.8) * 5 * 3) : k < 0.1 ? Math.round((0.1 - k) * 10 * 2) : 0;
      const bottom = top + deep - (k > 0.75 ? Math.round((k - 0.75) * 4 * (deep - 2)) : k < 0.12 ? Math.round((0.12 - k) * 8 * (deep - 3)) : 0);
      for (let y = top - lift; y <= bottom; y++) {
        const c = y === top - lift ? HULL[0] : y >= bottom - 1 ? HULL[3] : y > top + deep / 2 ? HULL[2] : HULL[1];
        p.set(x, y, c);
      }
      if (stripe) p.set(x, top + 2, stripe);
    }
  }
  function water(p, cx, y, rx) { // espuma alrededor del casco
    for (let x = -rx; x <= rx; x++) if ((x + 40) % 3 !== 0) p.set(cx + x, y, '#d8eef8', 200);
    for (let x = -rx + 3; x <= rx - 3; x += 2) p.set(cx + x, y + 1, '#9fd0ea', 160);
  }
  // Vela cuadrada hinchada, con el color de la facción en una franja.
  function squareSail(p, x, y, w, h, c, band) {
    for (let j = 0; j < h; j++) {
      const bulge = Math.round(Math.sin((j / (h - 1)) * Math.PI) * 2);
      for (let i = -bulge; i < w + bulge; i++) {
        const col = band && j >= Math.floor(h * 0.35) && j < Math.floor(h * 0.65) ? (i < 1 ? c[0] : i > w - 2 ? c[2] : c[1])
          : (i < 1 ? SAIL[0] : i > w - 2 ? SAIL[2] : SAIL[1]);
        p.set(x + i, y + j, col);
      }
    }
    p.rect(x - 1, y - 1, w + 2, 1, WOOD[2]); // verga
  }

  function barca(color) {
    const c = shades(color), p = new Pix(32, 32);
    // mástil y vela triangular del color de la facción
    p.line(15, 6, 15, 22, WOOD[2]);
    for (let j = 0; j < 13; j++) for (let i = 0; i <= Math.floor(j * 0.75); i++) p.set(16 + i, 8 + j, i === 0 ? c[0] : i >= Math.floor(j * 0.75) - 1 ? c[2] : c[1]);
    p.rect(14, 4, 3, 2, c[1]);
    // remero
    p.rect(8, 17, 4, 5, LEATHER[1]); p.ellipse(10, 15, 2.2, 2.2, null, (u) => (u < -0.3 ? SKIN[1] : SKIN[0]));
    p.line(6, 21, 2, 27, WOOD[1]);
    hull(p, 3, 28, 22, 5);
    water(p, 16, 28, 13);
    outline(p);
    return p.done();
  }

  function carabela(color) {
    const c = shades(color), p = new Pix(40, 40);
    p.line(14, 4, 14, 27, WOOD[2]); p.line(26, 7, 26, 27, WOOD[2]);        // dos mástiles
    squareSail(p, 9, 7, 9, 10, c, true);
    // vela latina (triangular) en el de popa... aquí a la derecha en proa
    for (let j = 0; j < 14; j++) for (let i = 0; i <= Math.floor(j * 0.6); i++) p.set(27 + i, 9 + j, i === 0 ? SAIL[0] : SAIL[1]);
    p.line(26, 8, 36, 22, WOOD[1]);
    p.rect(13, 1, 4, 3, c[1]); p.set(17, 2, c[2]);                           // banderín
    p.rect(3, 22, 6, 4, HULL[1]); p.rect(3, 22, 6, 1, HULL[0]);             // castillo de popa
    hull(p, 2, 37, 26, 7, c[1]);
    for (let x = 8; x < 32; x += 6) p.set(x, 30, '#2a1a10');                 // portillas
    water(p, 20, 35, 18);
    outline(p);
    return p.done();
  }

  function galeon(color) {
    const c = shades(color), p = new Pix(46, 44);
    p.line(12, 4, 12, 28, WOOD[2]); p.line(23, 1, 23, 28, WOOD[2]); p.line(34, 6, 34, 28, WOOD[2]); // tres mástiles
    squareSail(p, 8, 7, 9, 8, c, false); squareSail(p, 8, 17, 9, 7, c, true);
    squareSail(p, 18, 4, 11, 9, c, true); squareSail(p, 18, 15, 11, 8, c, false);
    squareSail(p, 30, 9, 8, 8, c, true);
    p.rect(22, 0, 5, 3, c[1]); p.rect(22, 0, 5, 1, c[0]);                     // bandera
    p.line(34, 7, 44, 24, WOOD[1]);                                          // bauprés
    p.rect(2, 22, 10, 6, HULL[1]); p.rect(2, 22, 10, 1, HULL[0]); p.rect(3, 24, 2, 2, '#f0d070'); p.rect(7, 24, 2, 2, '#f0d070'); // popa alta con ventanas
    hull(p, 2, 43, 28, 9, '#d8b04a');
    for (let x = 9; x < 38; x += 5) { p.rect(x, 32, 2, 2, '#1a1410'); p.set(x + 2, 32, STEEL[2]); } // cañones
    water(p, 23, 39, 21);
    outline(p);
    return p.done();
  }

  // --- Criaturas legendarias --------------------------------------------------
  // Lamia: mujer con cola de serpiente verde y azul, pelo largo y un pañuelo del color de la facción.
  function lamia(color) {
    const c = shades(color), p = new Pix(32, 36);
    const SCALE = ['#7fd6b4', '#3f9e8a', '#2a6e6a', '#1d4a52'], HAIR = ['#3a6a58', '#24463c'];
    shadow(p, 16, 33, 11);
    // cola enroscada en el suelo
    p.ellipse(15, 29, 11, 4, null, (u, v) => (v < -0.3 ? SCALE[0] : v > 0.4 ? SCALE[3] : SCALE[1]));
    p.ellipse(15, 29, 6, 2, null, (u, v) => SCALE[2]);
    for (let k = 0; k < 7; k++) p.set(6 + k * 3, 28 + (k % 2), SCALE[0]);   // escamas brillantes
    p.line(4, 28, 1, 24, SCALE[1]); p.line(3, 28, 0, 25, SCALE[2]); p.set(1, 23, SCALE[0]); // punta de la cola
    // tronco de serpiente que sube hasta la cintura
    for (let y = 20; y <= 27; y++) { p.rect(12, y, 7, 1, SCALE[1]); p.set(12, y, SCALE[0]); p.set(18, y, SCALE[2]); }
    for (let y = 21; y <= 27; y += 2) p.rect(14, y, 3, 1, '#c8e8a8');        // vientre claro
    // cuerpo (piel algo verdosa) con pañuelo del color de la facción
    body(p, 11, 13, 9, 8, [[214, 232, 196], [186, 214, 170], [150, 182, 140]]);
    p.rect(11, 17, 9, 3, c[1]); p.rect(11, 17, 9, 1, c[0]); p.rect(18, 17, 2, 3, c[2]);
    p.rect(19, 14, 4, 2, [186, 214, 170]); p.rect(22, 12, 2, 3, [186, 214, 170]); // brazo levantado (encantando)
    p.set(23, 10, '#d8f0ff'); p.set(24, 9, '#a8e0ff'); p.set(25, 11, '#d8f0ff'); p.set(22, 8, '#a8e0ff'); // chispas mágicas
    p.rect(13, 12, 5, 1, SKIN[1]);                                            // cuello
    head(p, 15, 9);
    p.set(16, 9, '#e0c030');                                                   // ojo de serpiente dorado
    // pelo largo cayendo por la espalda
    p.ellipse(14, 6, 4.5, 3, null, (u, v) => (u < 0 ? HAIR[1] : HAIR[0]));
    p.rect(10, 6, 3, 11, HAIR[1]); p.rect(11, 6, 2, 9, HAIR[0]);
    outline(p);
    return p.done();
  }

  // Gigante: enorme, piel grisácea, garrote de tronco y taparrabos del color de la facción.
  function gigante(color) {
    const c = shades(color), p = new Pix(40, 46);
    const ROCK = ['#c2b8a8', '#9a9082', '#73695e', '#524a42'];
    shadow(p, 20, 43, 14);
    // piernas como columnas
    p.rect(13, 31, 5, 10, ROCK[1]); p.rect(13, 31, 1, 10, ROCK[0]); p.rect(22, 31, 5, 10, ROCK[2]);
    p.rect(12, 40, 7, 2, ROCK[3]); p.rect(21, 40, 7, 2, ROCK[3]);
    // torso ancho
    p.ellipse(20, 22, 10, 10, null, (u, v) => (u < -0.45 ? ROCK[0] : u > 0.5 ? ROCK[2] : ROCK[1]));
    p.rect(15, 20, 4, 1, ROCK[2]); p.rect(21, 20, 4, 1, ROCK[2]);              // pecho
    // taparrabos y cinturón con el color de la facción
    p.rect(12, 29, 16, 4, c[1]); p.rect(12, 29, 16, 1, c[0]); p.rect(25, 29, 3, 4, c[2]);
    p.rect(17, 33, 6, 3, c[2]); p.rect(12, 28, 16, 1, LEATHER[2]); p.set(20, 28, '#d8b04a');
    // brazo izquierdo colgando
    p.rect(8, 16, 4, 12, ROCK[1]); p.rect(8, 16, 1, 12, ROCK[0]); p.rect(7, 27, 5, 3, ROCK[0]);
    // brazo derecho con el garrote al hombro
    p.rect(28, 15, 4, 7, ROCK[2]); p.rect(29, 10, 4, 6, ROCK[1]);
    p.line(26, 18, 37, 1, WOOD[1]); p.line(27, 18, 38, 2, WOOD[2]); p.line(25, 18, 36, 1, WOOD[0]);
    p.ellipse(36, 3, 3.5, 3.2, null, (u, v) => (u + v < 0 ? WOOD[0] : WOOD[2])); p.set(35, 4, '#4a3018');
    // cabeza pequeña con cejas gruesas y barba
    p.ellipse(20, 9, 5, 5.2, null, (u, v) => (u < -0.3 ? ROCK[0] : ROCK[1]));
    p.rect(17, 7, 7, 1, ROCK[3]); p.set(21, 8, '#1a1010'); p.set(23, 8, '#1a1010');
    p.rect(17, 12, 8, 3, '#6a5a48'); p.rect(18, 14, 6, 2, '#5a4a38');
    p.set(25, 9, ROCK[2]);                                                       // nariz
    outline(p);
    return p.done();
  }

  // Dragón: cuerpo rojo con vientre dorado, alas abiertas del color de la facción, echando humo.
  function dragon(color) {
    const c = shades(color), p = new Pix(48, 42);
    const RED = ['#f07a56', '#c8402a', '#8a2418', '#5a1410'], GOLD = ['#ffe08a', '#e0b048'];
    shadow(p, 22, 39, 13);
    // ala de atrás (más oscura)
    for (let k = 0; k < 14; k++) p.line(19, 16, 4 + k, 2 + Math.round(k * 0.9), k % 4 === 0 ? RED[3] : c[3]);
    // cola larga con punta
    for (let k = 0; k < 12; k++) p.rect(12 - k, 28 + Math.round(Math.sin(k / 3) * 2), 3, 3, k < 5 ? RED[1] : RED[2]);
    p.set(0, 27, RED[3]); p.set(1, 26, RED[2]); p.set(0, 30, RED[3]);
    // patas
    p.rect(15, 31, 4, 6, RED[2]); p.rect(25, 31, 4, 6, RED[2]); p.rect(14, 36, 6, 2, RED[3]); p.rect(24, 36, 6, 2, RED[3]);
    // cuerpo
    p.ellipse(22, 26, 10, 6.5, null, (u, v) => (v > 0.35 ? GOLD[1] : v < -0.4 ? RED[0] : RED[1]));
    for (let x = 16; x <= 28; x += 3) p.set(x, 30, GOLD[0]);
    // cuello y cabeza
    for (let k = 0; k < 8; k++) p.rect(29 + k * 0.8, 21 - k * 1.4, 4, 4, k < 4 ? RED[1] : RED[0]);
    p.rect(34, 7, 8, 5, RED[1]); p.rect(34, 7, 8, 1, RED[0]); p.rect(40, 9, 4, 3, RED[1]); p.rect(40, 11, 4, 1, RED[2]);
    p.set(37, 8, '#ffe14a'); p.set(38, 8, '#1a1010');                           // ojo
    p.line(34, 7, 31, 3, '#e8dcc0'); p.line(36, 7, 34, 2, '#e8dcc0');            // cuernos
    for (let k = 0; k < 5; k++) p.set(31 - k * 0.5, 14 + k * 2, RED[3]);           // cresta
    // llamita y humo en la boca
    p.set(45, 10, '#ffd040'); p.set(46, 11, '#ff8a20'); p.set(45, 12, '#ff5a10'); p.set(47, 10, '#ffe890');
    p.set(46, 7, '#b8b0a8', 200); p.set(47, 5, '#d8d0c8', 160);
    // ala de delante, abierta, con la membrana del color de la facción
    const wing = [[24, 18], [10, 4], [16, 1], [24, 0], [32, 4]];
    for (let k = 1; k < wing.length; k++) {
      const [x0, y0] = wing[0], [x1, y1] = wing[k], [x2, y2] = wing[Math.min(k + 1, wing.length - 1)];
      for (let a = 0; a <= 1; a += 0.04) for (let b = 0; b <= 1 - a; b += 0.04) {
        const x = x0 + (x1 - x0) * a + (x2 - x0) * b, y = y0 + (y1 - y0) * a + (y2 - y0) * b;
        p.set(x, y, k === 1 ? c[2] : k === 2 ? c[1] : c[0]);
      }
    }
    for (let k = 1; k < wing.length; k++) p.line(wing[0][0], wing[0][1], wing[k][0], wing[k][1], RED[2]); // huesos del ala
    outline(p);
    return p.done();
  }

  const DRAW = { colono, miliciano, arquero, jinete, espadachin, lancero, caballero, canon, catapulta, monje, mercader, barca, carabela, galeon, lamia, gigante, dragon };
  function makeUnitCanvas(type, color) { return DRAW[type](color); }

  root.PEUnits = { makeUnitCanvas, TYPES: Object.keys(DRAW) };
})(this);
