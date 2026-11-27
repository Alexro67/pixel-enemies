// Pixel Enemies - reglas de tropas y combate (sin azar).
// No depende de Phaser: se puede probar con node. Todo lo que pasa en la partida
// está en "game", así más adelante se podrá guardar en el servidor tal cual.
(function (root) {
  'use strict';
  const M = root.PEMap || (typeof require !== 'undefined' ? require('./map.js') : null);

  // --- Habilidades -----------------------------------------------------------
  // Cada tropa tiene una "clase" (cómo aprovecha el terreno) y una lista de habilidades.
  // Varias tropas pueden compartir la misma clase o habilidad.
  const SKILLS = {
    distancia:   { label: 'A distancia', text: 'ataca desde lejos' },
    sinReplica:  { label: 'Sin contraataque', text: 'no devuelve los golpes' },
    pesada:      { label: 'Pesada', text: 'si se mueve, no puede atacar ese turno' },
    hostigador:  { label: 'Hostigador', text: 'puede moverse después de atacar' },
    explorador:  { label: 'Explorador', text: 've a 2 casillas' },
    civil:       { label: 'Civil', text: 'no ataca ni contraataca' },
    antiMontada: { label: 'Antijinetes', text: '+2 de defensa contra tropas montadas' },
    implacable:  { label: 'Implacable', text: 'si mata, puede volver a atacar' },
    sanador:     { label: 'Sanador', text: 'en vez de atacar, cura 3 de vida a tus tropas de al lado' },
  };
  // Visión: todas ven 1 casilla alrededor; 2 si son exploradoras o están en una montaña.
  // Defensa extra según el terreno, por clase de tropa. El río resta a todos.
  const CLASSES = {
    infanteria: { label: 'Infantería', terrain: { bosque: 1, montana: 2, rio: -1 } },
    tirador:    { label: 'Tirador', terrain: { bosque: 2, montana: 1, rio: -1 } },
    montada:    { label: 'Montada', terrain: { rio: -1 } }, // a caballo no se esconde en bosque ni montaña
    maquina:    { label: 'Máquina de guerra', terrain: { rio: -1 } }, // cañones y catapultas no se esconden
  };
  // Tecnologías que dan defensa en un terreno: { tecnologia: { clase|'todas': { terreno: +n } } }
  const TECH_TERRAIN = {
    lenadores: { infanteria: { bosque: 1 } },
    montaneros: { todas: { montana: 1 } },
  };

  // --- Tecnologías --------------------------------------------------------
  // 5 ramas. En cada rama hay que ir en orden, y desde el nivel 2 hace falta tener
  // una ciudad de ese nivel. "later": se puede investigar, pero lo que da llega más adelante.
  const BRANCHES = [
    { id: 'campo',  label: 'Campo' },
    { id: 'monte',  label: 'Monte' },
    { id: 'guerra', label: 'Guerra' },
    { id: 'mar',    label: 'Mar' },
    { id: 'saber',  label: 'Saber' },
  ];
  const TECHS = {
    caza:          { branch: 'campo',  level: 1, label: 'Caza y caminos', text: 'Puesto de caza, caminos y puentes' },
    molinos:       { branch: 'campo',  level: 2, label: 'Molinos',        text: '+1 comida en cada plantación de trigo' },
    gremios:       { branch: 'campo',  level: 3, label: 'Gremios',        text: 'Subir una ciudad de nivel pide 1 edificio menos' },
    lenadores:     { branch: 'monte',  level: 1, label: 'Leñadores',      text: 'Aserradero, y la infantería gana +1 de defensa en el bosque' },
    mineria:       { branch: 'monte',  level: 2, label: 'Minería',        text: 'Mina' },
    forja:         { branch: 'monte',  level: 3, label: 'Forja',          text: 'Espadachín y caballero' },
    montaneros:    { branch: 'monte',  level: 4, label: 'Montañeros',     text: 'Todas tus tropas ganan +1 de defensa en la montaña' },
    fortificacion: { branch: 'guerra', level: 1, label: 'Fortificación',  text: 'Fortificar ciudades y lancero' },
    polvora:       { branch: 'guerra', level: 2, label: 'Pólvora',        text: 'Cañón' },
    ingenieria:    { branch: 'guerra', level: 3, label: 'Ingeniería',     text: 'Catapulta' },
    pesca:         { branch: 'mar',    level: 1, label: 'Pesca',          text: 'Puerto pesquero (la barca llega más adelante)' },
    astilleros:    { branch: 'mar',    level: 2, label: 'Astilleros',     text: 'Carabela', later: true },
    rutas:         { branch: 'mar',    level: 3, label: 'Rutas marítimas', text: 'Rutas de comercio por mar', later: true },
    armada:        { branch: 'mar',    level: 4, label: 'Armada',         text: 'Galeón de guerra', later: true },
    escritura:     { branch: 'saber',  level: 1, label: 'Escritura',      text: 'Las tecnologías te cuestan 1 oro menos' },
    monasterios:   { branch: 'saber',  level: 2, label: 'Monasterios',    text: 'Monje: cura a las tropas de su lado' },
    mitos:         { branch: 'saber',  level: 3, label: 'Mitos',          text: 'Lamia', later: true },
    leyendas:      { branch: 'saber',  level: 4, label: 'Leyendas',       text: 'Gigante y dragón', later: true },
  };
  const TECH_COST = [0, 3, 5, 8, 12]; // por nivel de la tecnología

  // --- Tropas (cifras del documento de diseño) ----------------------------
  const UNITS = {
    colono:    { label: 'Colono',    hp: 5,  atk: 0, def: 1, move: 1, range: 1, cost: 4, cls: 'infanteria', skills: ['civil'] },
    miliciano: { label: 'Miliciano', hp: 10, atk: 2, def: 2, move: 1, range: 1, cost: 2, cls: 'infanteria', skills: [] },
    arquero:   { label: 'Arquero',   hp: 10, atk: 2, def: 1, move: 1, range: 2, cost: 3, cls: 'tirador', skills: ['distancia'] },
    jinete:    { label: 'Jinete',    hp: 10, atk: 2, def: 1, move: 2, range: 1, cost: 4, cls: 'montada', skills: ['hostigador', 'explorador'] },
    espadachin: { label: 'Espadachín', hp: 12, atk: 3, def: 3, move: 1, range: 1, cost: 5, cls: 'infanteria', skills: [], tech: 'forja' },
    lancero:   { label: 'Lancero',   hp: 10, atk: 2, def: 3, move: 1, range: 1, cost: 4, cls: 'infanteria', skills: ['antiMontada'], tech: 'fortificacion' },
    caballero: { label: 'Caballero', hp: 15, atk: 4, def: 2, move: 2, range: 1, cost: 8, cls: 'montada', skills: ['implacable'], tech: 'forja' },
    canon:     { label: 'Cañón',     hp: 10, atk: 3, def: 1, move: 1, range: 2, cost: 6, cls: 'maquina', skills: ['distancia', 'pesada'], tech: 'polvora' },
    catapulta: { label: 'Catapulta', hp: 8,  atk: 5, def: 0, move: 1, range: 3, cost: 8, cls: 'maquina', skills: ['distancia', 'pesada', 'sinReplica'], tech: 'ingenieria' },
    monje:     { label: 'Monje',     hp: 8,  atk: 0, def: 1, move: 1, range: 1, cost: 5, cls: 'infanteria', skills: ['sanador', 'civil'], tech: 'monasterios' },
  };
  const ARMIES = { real: ['miliciano'], prueba: ['miliciano', 'arquero', 'jinete'] };
  const has = (u, skill) => UNITS[u.type].skills.includes(skill);

  // --- Ciudades y economía (cifras de prueba, se ajustan aquí) ---------------
  const ECON = {
    startGold: 3, startFood: 3,      // lo que tienes al empezar
    perLevel: { oro: 1, comida: 1 }, // lo que da cada ciudad por cada nivel, cada turno
    maxLevel: 7,
    levelCost: (level) => 3 * level,    // oro para pasar del nivel "level" al siguiente
    levelNeeds: (level) => level,       // edificios que hacen falta en su territorio para subir
    expandCost: 8, expandLevel: 3,      // ampliar el territorio (un anillo más de casillas)
    fortCost: 5, fortDefense: 2,        // fortificación: defensa extra a la tropa que defiende la ciudad
    roadCost: 2,                        // camino en una casilla
    roadBonus: 1,                       // oro extra por cada ciudad unida a la capital (y lo mismo para la capital)
    unitsPerCity: (level) => level + 1, // tropas que puede mantener cada ciudad
    heal: 3, healInCity: 5, healCost: 1,
    monkHeal: 3,                        // vida que cura el monje a cada tropa de al lado
    techPerCity: 2, techPerCityLevel: 1, // precio extra de las tecnologías por cada ciudad que no es la capital (y por cada nivel suyo por encima del 1)
    cityVision: 2,
    ownGap: 3,   // distancia mínima entre dos ciudades tuyas (2 casillas libres en medio)
    enemyGap: 2, // distancia mínima a una ciudad enemiga (1 casilla libre), si la casilla es neutral
    foundOn: ['llanura', 'bosque'],
  };
  // Tropas que se pueden reclutar ahora (las demás llegarán con las tecnologías).
  const RECRUITABLE = Object.keys(UNITS); // las que tienen "tech" piden esa tecnología
  // Edificios: dónde se construyen, cuánto oro cuestan y qué producen.
  // Baratos y sencillos (granja, cantera), caros y potentes (caza, mina), y dos con algo especial.
  const BUILDINGS = {
    granja:     { label: 'Plantación de trigo', resource: 'trigo',   cost: 2, gives: { comida: 1 } },
    cantera:    { label: 'Cantera',             terrain: 'montana', noResource: true, cost: 2, gives: { oro: 1 } },
    caza:       { label: 'Puesto de caza',      resource: 'caza',    cost: 5, gives: { comida: 2 }, tech: 'caza' },
    mina:       { label: 'Mina',                resource: 'mineral', cost: 6, gives: { oro: 2 }, tech: 'mineria' },
    aserradero: { label: 'Aserradero',          resource: 'lena',    cost: 3, gives: { oro: 1 }, forestBonus: 1, tech: 'lenadores',
                  extra: '+1 más si en el territorio queda otro bosque sin edificio' },
    puerto:     { label: 'Puerto pesquero',     resource: 'pesca',   cost: 4, gives: { comida: 1, oro: 1 }, tech: 'pesca' },
  };
  const givesText = (g) => Object.entries(g).map(([k, v]) => `+${v} ${k}`).join(' y ');
  function buildingFor(t) {
    return Object.keys(BUILDINGS).find(k => {
      const b = BUILDINGS[k];
      return b.resource ? t.resource === b.resource : (t.terrain === b.terrain && (!b.noResource || !t.resource));
    }) || null;
  }

  // --- Terreno ----------------------------------------------------------
  // stop: al entrar se acaba el movimiento del turno. (La defensa depende de la clase de tropa.)
  const GROUND = {
    llanura: { walk: true, stop: false },
    bosque:  { walk: true, stop: true },
    montana: { walk: true, stop: true },
    rio:     { walk: true, stop: true },
    costa:   { walk: false },
    mar:     { walk: false },
  };

  // --- Partida ------------------------------------------------------------
  // opts: { map, players: [factionIndex...], close: true/false, army: 'real'|'prueba' }
  // Cada jugador empieza con su capital y su ejército encima o al lado.
  function newGame(opts) {
    const map = opts.map, players = opts.players || [0, 1], army = ARMIES[opts.army] || ARMIES.real;
    const anchors = opts.close ? closeAnchors(map, players.length) : map.starts.slice(0, players.length);
    // En el modo de prueba se empieza con mucho oro y comida, para probarlo todo rápido.
    const rich = army === ARMIES.prueba ? 30 : 0;
    const game = { players: players.map(f => ({ faction: f, alive: true, techs: [], gold: ECON.startGold + rich, food: ECON.startFood + rich, founded: 0 })),
      turn: 0, round: 1, units: [], cities: [], territory: {}, buildings: {}, roads: {}, nextId: 1, winner: null, events: [] };
    const taken = new Set();
    anchors.forEach((a, p) => {
      const city = addCity(game, map, p, a.col, a.row, true);
      const spots = [M.tileAt(map, a.col, a.row)].concat(landAround(map, a, army.length + 1, new Set([key(a.col, a.row)])));
      army.forEach((type, k) => {
        const s = spots.find(x => x && !taken.has(key(x.col, x.row)));
        if (!s) return;
        taken.add(key(s.col, s.row));
        const u = makeUnit(game, type, p, s.col, s.row);
        if (army === ARMIES.real) u.home = city.id; // las tropas de la prueba no ocupan sitio en la ciudad
        game.units.push(u);
      });
    });
    return game;
  }
  function makeUnit(game, type, owner, col, row) {
    return { id: game.nextId++, type, owner, col, row, hp: UNITS[type].hp, moved: false, acted: false, kills: 0, home: null };
  }
  const key = (c, r) => c + ',' + r;
  const ground = (t) => GROUND[t.terrain] || GROUND.mar;

  // Casillas de tierra libres alrededor de una casilla (primero las llanas).
  function landAround(map, a, n, taken) {
    const seen = new Set([key(a.col, a.row)]), out = [], queue = [M.tileAt(map, a.col, a.row)];
    for (let qi = 0; qi < queue.length && out.length < n; qi++) {
      const t = queue[qi];
      if (!t) continue;
      if (ground(t).walk && !taken.has(key(t.col, t.row))) out.push(t);
      const next = M.neighbors(t.col, t.row, map.cols, map.rows).map(([c, r]) => M.tileAt(map, c, r))
        .filter(x => x && !seen.has(key(x.col, x.row)) && ground(x).walk);
      next.sort((x, y) => (ground(x).stop ? 1 : 0) - (ground(y).stop ? 1 : 0));
      next.forEach(x => { seen.add(key(x.col, x.row)); queue.push(x); });
    }
    return out;
  }

  // Para probar combates rápido: dos puntos de tierra a 5-6 casillas, cerca del centro.
  function closeAnchors(map, n) {
    const land = map.tiles.filter(t => t.terrain === 'llanura' && landAround(map, t, 3, new Set()).length === 3);
    if (land.length < 2) return map.starts.slice(0, n);
    const R = map.radius;
    land.sort((a, b) => M.distance(a.col, a.row, R, R) - M.distance(b.col, b.row, R, R));
    for (const a of land.slice(0, 40)) {
      // la otra punta tiene que estar unida por tierra (que se pueda llegar andando)
      const dist = walkDistances(map, a);
      const b = land.find(t => { const d = dist.get(key(t.col, t.row)); return d >= 5 && d <= 7 && M.distance(a.col, a.row, t.col, t.row) >= 5; });
      if (b) return [a, b];
    }
    return map.starts.slice(0, n);
  }
  function walkDistances(map, a) {
    const dist = new Map([[key(a.col, a.row), 0]]), queue = [a];
    for (let qi = 0; qi < queue.length; qi++) {
      const t = queue[qi], d = dist.get(key(t.col, t.row));
      for (const [c, r] of M.neighbors(t.col, t.row, map.cols, map.rows)) {
        const x = M.tileAt(map, c, r);
        if (!x || !ground(x).walk || dist.has(key(c, r))) continue;
        dist.set(key(c, r), d + 1); queue.push(x);
      }
    }
    return dist;
  }

  function visionOf(map, u) {
    const t = M.tileAt(map, u.col, u.row);
    return has(u, 'explorador') || (t && t.terrain === 'montana') ? 2 : 1;
  }
  function unitAt(game, col, row) { return game.units.find(u => u.col === col && u.row === row) || null; }
  function enemyNear(game, owner, col, row) {
    return game.units.some(u => u.owner !== owner && M.distance(u.col, u.row, col, row) === 1);
  }

  // --- Ciudades --------------------------------------------------------------
  function cityAt(game, col, row) { return game.cities.find(c => c.col === col && c.row === row) || null; }
  function cityById(game, id) { return game.cities.find(c => c.id === id) || null; }
  function ownerOfTile(game, col, row) { // ciudad a la que pertenece la casilla, o null si es neutral
    const id = game.territory[key(col, row)];
    return id ? cityById(game, id) : null;
  }
  // Territorio: la casilla de la ciudad y las 6 de alrededor que aún no son de nadie.
  function addCity(game, map, owner, col, row, capital) {
    const p = game.players[owner];
    p.founded = (p.founded || 0) + 1;
    const city = { id: game.nextId++, owner, col, row, capital: !!capital, origin: owner, number: p.founded,
      level: 1, expanded: false, fort: false };
    game.cities.push(city);
    game.territory[key(col, row)] = city.id;
    for (const [c, r] of M.neighbors(col, row, map.cols, map.rows)) {
      if (!M.tileAt(map, c, r) || game.territory[key(c, r)]) continue;
      game.territory[key(c, r)] = city.id;
    }
    return city;
  }
  function cityTiles(game, map, city) {
    return map.tiles.filter(t => game.territory[key(t.col, t.row)] === city.id);
  }
  function cityBuildings(game, map, city) {
    return cityTiles(game, map, city).map(t => game.buildings[key(t.col, t.row)]).filter(Boolean);
  }
  function cityLevel(game, map, city) { return city.level || 1; }
  // Lo que da un edificio en su casilla (el aserradero da más si queda otro bosque libre en el territorio).
  function buildingGives(game, map, t) {
    const type = game.buildings[key(t.col, t.row)], b = BUILDINGS[type], out = Object.assign({}, b.gives);
    const owner = ownerOfTile(game, t.col, t.row);
    if (type === 'granja' && owner && hasTech(game, owner.owner, 'molinos')) out.comida = (out.comida || 0) + 1;
    if (b.forestBonus) {
      const city = ownerOfTile(game, t.col, t.row);
      const free = city && cityTiles(game, map, city).some(x => x.terrain === 'bosque' && x !== t && !game.buildings[key(x.col, x.row)] && !cityAt(game, x.col, x.row));
      if (free) out.oro = (out.oro || 0) + b.forestBonus;
    }
    return out;
  }
  function cityIncome(game, map, city) {
    const lvl = cityLevel(game, map, city), out = { oro: ECON.perLevel.oro * lvl, comida: ECON.perLevel.comida * lvl, camino: 0 };
    for (const t of cityTiles(game, map, city)) {
      if (!game.buildings[key(t.col, t.row)]) continue;
      const g = buildingGives(game, map, t);
      out.oro += g.oro || 0; out.comida += g.comida || 0;
    }
    // Caminos: cada ciudad unida a la capital da +1, y la capital +1 por cada una.
    const linked = connectedCities(game, map, city.owner);
    if (city.capital) out.camino = linked.length * ECON.roadBonus;
    else if (linked.includes(city)) out.camino = ECON.roadBonus;
    out.oro += out.camino;
    return out;
  }

  // --- Subir de nivel y mejoras de ciudad -----------------------------------
  function levelUpProblem(game, map, city) {
    const lvl = cityLevel(game, map, city);
    if (city.owner !== game.turn) return 'No es tu ciudad.';
    if (lvl >= ECON.maxLevel) return 'Ya está en el nivel máximo.';
    const need = levelNeedsFor(game, city), have = cityBuildings(game, map, city).length;
    if (have < need) return `Para subir al nivel ${lvl + 1} necesita ${need} edificio${need > 1 ? 's' : ''} en su territorio (tiene ${have}).`;
    if (game.players[game.turn].gold < ECON.levelCost(lvl)) return `Te falta oro para subir de nivel (cuesta ${ECON.levelCost(lvl)}).`;
    return null;
  }
  function levelNeedsFor(game, city) {
    return Math.max(0, ECON.levelNeeds(cityLevel(null, null, city)) - (hasTech(game, city.owner, 'gremios') ? 1 : 0));
  }
  function levelUp(game, map, city) {
    if (levelUpProblem(game, map, city)) return false;
    game.players[game.turn].gold -= ECON.levelCost(cityLevel(game, map, city));
    city.level = cityLevel(game, map, city) + 1;
    return true;
  }
  function expandProblem(game, map, city) {
    if (city.owner !== game.turn) return 'No es tu ciudad.';
    if (city.expanded) return 'Ya está ampliada.';
    if (cityLevel(game, map, city) < ECON.expandLevel) return `Para ampliar el territorio la ciudad tiene que ser nivel ${ECON.expandLevel}.`;
    if (!expandTiles(game, map, city).length) return 'No quedan casillas libres alrededor.';
    if (game.players[game.turn].gold < ECON.expandCost) return `Te falta oro para ampliar (cuesta ${ECON.expandCost}).`;
    return null;
  }
  function expandTiles(game, map, city) {
    return map.tiles.filter(t => M.distance(t.col, t.row, city.col, city.row) === 2 && !game.territory[key(t.col, t.row)]);
  }
  function expand(game, map, city) {
    if (expandProblem(game, map, city)) return 0;
    game.players[game.turn].gold -= ECON.expandCost;
    const tiles = expandTiles(game, map, city);
    tiles.forEach(t => { game.territory[key(t.col, t.row)] = city.id; });
    city.expanded = true;
    return tiles.length;
  }
  function fortProblem(game, map, city) {
    if (city.owner !== game.turn) return 'No es tu ciudad.';
    if (city.fort) return 'Ya está fortificada.';
    if (!hasTech(game, city.owner, 'fortificacion')) return 'Necesitas la tecnología Fortificación (rama Guerra).';
    if (game.players[game.turn].gold < ECON.fortCost) return `Te falta oro para fortificar (cuesta ${ECON.fortCost}).`;
    return null;
  }
  function fortify(game, map, city) {
    if (fortProblem(game, map, city)) return false;
    game.players[game.turn].gold -= ECON.fortCost;
    city.fort = true;
    return true;
  }

  // --- Caminos ----------------------------------------------------------------
  // Las ciudades cuentan como camino. Los caminos sirven a todos, también al enemigo.
  function hasRoad(game, col, row) { return !!game.roads[key(col, row)] || !!cityAt(game, col, row); }
  function roadProblem(game, map, t) {
    if (!t) return 'Aquí no.';
    if (t.terrain === 'mar' || t.terrain === 'costa') return 'No se puede hacer un camino en el mar.';
    if (hasRoad(game, t.col, t.row)) return 'Ya hay camino.';
    if (!hasTech(game, game.turn, 'caza')) return 'Necesitas la tecnología Caza y caminos (rama Campo).';
    const owner = ownerOfTile(game, t.col, t.row);
    if (owner && owner.owner !== game.turn) return 'Es territorio enemigo.';
    const u = unitAt(game, t.col, t.row);
    if (u && u.owner !== game.turn) return 'Hay una tropa enemiga encima.';
    if (!owner && !(u && u.owner === game.turn)) return 'Fuera de tu territorio necesitas una tropa tuya en la casilla.';
    if (game.players[game.turn].gold < ECON.roadCost) return `Te falta oro (un camino cuesta ${ECON.roadCost}).`;
    return null;
  }
  function canOfferRoad(game, map, t) { // si tiene sentido enseñar el botón
    if (!t || t.terrain === 'mar' || t.terrain === 'costa' || hasRoad(game, t.col, t.row)) return false;
    const owner = ownerOfTile(game, t.col, t.row), u = unitAt(game, t.col, t.row);
    return owner ? owner.owner === game.turn : !!(u && u.owner === game.turn);
  }
  function buildRoad(game, map, t) {
    if (roadProblem(game, map, t)) return false;
    game.players[game.turn].gold -= ECON.roadCost;
    game.roads[key(t.col, t.row)] = true;
    return true;
  }
  // Ciudades del jugador unidas a su capital por caminos (sin contar la capital).
  function connectedCities(game, map, owner) {
    const cap = game.cities.find(c => c.owner === owner && c.capital);
    if (!cap) return [];
    const seen = new Set([key(cap.col, cap.row)]), queue = [cap], out = [];
    for (let qi = 0; qi < queue.length; qi++) {
      const cur = queue[qi];
      for (const [c, r] of M.neighbors(cur.col, cur.row, map.cols, map.rows)) {
        const k = key(c, r);
        if (seen.has(k) || !hasRoad(game, c, r)) continue;
        seen.add(k);
        const city = cityAt(game, c, r);
        if (city && city.owner !== owner) continue; // una ciudad enemiga corta el camino
        if (city) out.push(city);
        queue.push({ col: c, row: r });
      }
    }
    return out;
  }
  function playerIncome(game, map, owner) {
    const out = { oro: 0, comida: 0 };
    game.cities.filter(c => c.owner === owner).forEach(c => { const i = cityIncome(game, map, c); out.oro += i.oro; out.comida += i.comida; });
    return out;
  }
  function cityUnits(game, city) { return game.units.filter(u => u.home === city.id); }
  function cityCapacity(game, map, city) { return ECON.unitsPerCity(cityLevel(game, map, city)); }

  // ¿Puede este colono fundar aquí? Devuelve null si sí, o el motivo si no.
  function foundProblem(game, map, u) {
    if (!u || u.type !== 'colono') return 'Solo un colono puede fundar ciudades.';
    if (u.owner !== game.turn) return 'No es tu turno.';
    if (u.acted) return 'Este colono acaba de salir; podrá fundar en tu próximo turno.';
    const t = M.tileAt(map, u.col, u.row);
    if (!ECON.foundOn.includes(t.terrain)) return 'Solo se puede fundar en llanura o bosque.';
    if (game.territory[key(t.col, t.row)]) return 'Esta casilla ya es territorio de una ciudad.';
    for (const c of game.cities) {
      const d = M.distance(c.col, c.row, t.col, t.row);
      if (c.owner === u.owner && d < ECON.ownGap) return 'Demasiado cerca de otra ciudad tuya: deja 2 casillas libres entre medias.';
      if (c.owner !== u.owner && d < ECON.enemyGap) return 'Demasiado cerca de una ciudad enemiga.';
    }
    return null;
  }
  function found(game, map, u) {
    if (foundProblem(game, map, u)) return null;
    game.units = game.units.filter(x => x !== u);
    // Si había un recurso debajo, desaparece al construir la ciudad (Alex, opción A).
    const t = M.tileAt(map, u.col, u.row);
    if (t.resource) { game.cleared = game.cleared || {}; game.cleared[key(t.col, t.row)] = true; t.resource = null; }
    return addCity(game, map, u.owner, u.col, u.row, false);
  }

  // ¿Qué se puede construir en esta casilla? { type, problem } o null si nada.
  function buildOption(game, map, t) {
    if (!t) return null;
    const city = ownerOfTile(game, t.col, t.row);
    const type = buildingFor(t);
    if (!type || !city || city.owner !== game.turn || game.buildings[key(t.col, t.row)] || cityAt(game, t.col, t.row)) return null;
    const b = BUILDINGS[type];
    let problem = null;
    const other = unitAt(game, t.col, t.row);
    if (b.tech && !hasTech(game, game.turn, b.tech)) problem = `Necesitas la tecnología ${TECHS[b.tech].label} (rama ${branchLabel(b.tech)}).`;
    else if (other && other.owner !== game.turn) problem = 'Hay una tropa enemiga encima.';
    else if (game.players[game.turn].gold < b.cost) problem = `Te falta oro (cuesta ${b.cost}).`;
    return { type, problem, city };
  }
  function build(game, map, t) {
    const opt = buildOption(game, map, t);
    if (!opt || opt.problem) return null;
    game.players[game.turn].gold -= BUILDINGS[opt.type].cost;
    game.buildings[key(t.col, t.row)] = opt.type;
    return opt.type;
  }

  // ¿Puede esta ciudad reclutar esta tropa? null si sí, o el motivo.
  function recruitProblem(game, map, city, type) {
    if (city.owner !== game.turn) return 'No es tu ciudad.';
    const need = UNITS[type].tech;
    if (need && !hasTech(game, city.owner, need)) return `Necesitas la tecnología ${TECHS[need].label}.`;
    if (unitAt(game, city.col, city.row)) return 'Hay una tropa en la ciudad: muévela primero.';
    if (cityUnits(game, city).length >= cityCapacity(game, map, city)) return `Esta ciudad ya tiene ${cityCapacity(game, map, city)} tropas (súbela de nivel para tener más).`;
    if (game.players[game.turn].food < UNITS[type].cost) return `Te falta comida (cuesta ${UNITS[type].cost}).`;
    return null;
  }
  function recruit(game, map, city, type) {
    if (recruitProblem(game, map, city, type)) return null;
    game.players[game.turn].food -= UNITS[type].cost;
    const u = makeUnit(game, type, city.owner, city.col, city.row);
    u.home = city.id; u.moved = true; u.acted = true; // la tropa nueva espera al turno siguiente
    game.units.push(u);
    return u;
  }

  // --- Curar ----------------------------------------------------------------
  function healProblem(game, map, u) {
    if (u.owner !== game.turn) return 'No es tu turno.';
    if (u.hp >= UNITS[u.type].hp) return 'Tiene toda la vida.';
    if (u.moved || u.acted) return 'Solo se cura si no se ha movido ni atacado este turno.';
    if (game.players[u.owner].food < ECON.healCost) return `Te falta comida (cuesta ${ECON.healCost}).`;
    return null;
  }
  function healAmount(game, u) {
    const c = cityAt(game, u.col, u.row);
    return Math.min(UNITS[u.type].hp - u.hp, c && c.owner === u.owner ? ECON.healInCity : ECON.heal);
  }
  function heal(game, map, u) {
    if (healProblem(game, map, u)) return 0;
    const n = healAmount(game, u);
    game.players[u.owner].food -= ECON.healCost;
    u.hp += n; u.moved = true; u.acted = true;
    return n;
  }

  // --- Movimiento ---------------------------------------------------------
  // Devuelve las casillas a las que puede ir la tropa, con el camino para llegar.
  // Reglas: llanura cuesta 1; bosque, montaña y río paran la tropa al entrar.
  // No se atraviesa a enemigos; a los compañeros sí, pero no se puede acabar encima.
  // Al llegar al lado de un enemigo, la tropa se para (no puede pasar de largo).
  function reachable(game, map, unit) {
    const out = new Map();
    if (unit.moved || (unit.acted && !has(unit, 'hostigador'))) return out;
    const start = { col: unit.col, row: unit.row, left: UNITS[unit.type].move, path: [] };
    const best = new Map([[key(unit.col, unit.row), start.left]]);
    const queue = [start];
    while (queue.length) {
      queue.sort((a, b) => b.left - a.left);
      const cur = queue.shift();
      if (cur.left <= 0) continue;
      for (const [c, r] of M.neighbors(cur.col, cur.row, map.cols, map.rows)) {
        const t = M.tileAt(map, c, r);
        if (!t || !ground(t).walk) continue;
        const other = unitAt(game, c, r);
        if (other && other.owner !== unit.owner) continue;
        // Por camino (de camino a camino) cuesta medio movimiento, y el camino no para la tropa.
        const road = hasRoad(game, c, r), onRoad = road && hasRoad(game, cur.col, cur.row);
        const stops = (ground(t).stop && !road) || enemyNear(game, unit.owner, c, r);
        const left = stops ? 0 : cur.left - (onRoad ? 0.5 : 1);
        const k = key(c, r);
        if (best.has(k) && best.get(k) >= left) continue;
        best.set(k, left);
        const path = cur.path.concat([{ col: c, row: r }]);
        if (!other) out.set(k, { col: c, row: r, path });
        queue.push({ col: c, row: r, left, path });
      }
    }
    return out;
  }

  // --- Combate -------------------------------------------------------------
  // Defensa extra de una tropa en una casilla: según su clase y las tecnologías de su jugador.
  function terrainDef(map, u, col, row, game) {
    const t = M.tileAt(map, col === undefined ? u.col : col, row === undefined ? u.row : row);
    if (!t) return 0;
    const cls = UNITS[u.type].cls;
    let bonus = CLASSES[cls].terrain[t.terrain] || 0;
    const techs = game && game.players[u.owner] ? game.players[u.owner].techs : [];
    for (const tech of techs) {
      const tt = TECH_TERRAIN[tech];
      if (tt) bonus += ((tt[cls] || {})[t.terrain] || 0) + ((tt.todas || {})[t.terrain] || 0);
    }
    return bonus;
  }
  function fortBonus(game, u) {
    const c = game && cityAt(game, u.col, u.row);
    return c && c.fort && c.owner === u.owner ? ECON.fortDefense : 0;
  }
  function defenseOf(map, u, game) { return Math.max(0, UNITS[u.type].def + terrainDef(map, u, undefined, undefined, game) + fortBonus(game, u)); }
  function weak(u) { return u.hp * 2 < UNITS[u.type].hp; } // menos de la mitad de vida
  // Daño = 3 x ataque - defensa (con el terreno). Herido: 1 menos. Siempre al menos 1.
  function damage(game, map, att, def, attHp) {
    const hp = attHp === undefined ? att.hp : attHp;
    const hurt = hp * 2 < UNITS[att.type].hp ? 1 : 0;
    const anti = has(def, 'antiMontada') && UNITS[att.type].cls === 'montada' ? 2 : 0;
    return Math.max(1, 3 * UNITS[att.type].atk - defenseOf(map, def, game) - anti - hurt);
  }
  function inRange(att, def) { return M.distance(att.col, att.row, def.col, def.row) <= UNITS[att.type].range; }

  function targets(game, unit) {
    if (has(unit, 'civil') || unit.acted || (unit.moved && has(unit, 'pesada'))) return [];
    return game.units.filter(u => u.owner !== unit.owner && inRange(unit, u));
  }
  // Lo que pasaría si "att" ataca a "def", sin cambiar nada.
  function preview(game, map, att, def) {
    const dealt = damage(game, map, att, def);
    const defLeft = def.hp - dealt;
    let back = 0;
    if (defLeft > 0 && inRange(def, att) && !has(def, 'sinReplica') && !has(def, 'civil')) back = damage(game, map, def, att, defLeft);
    return { dealt: Math.min(dealt, def.hp), back: Math.min(back, att.hp), kills: defLeft <= 0, dies: back >= att.hp };
  }

  // --- Acciones (cambian la partida) ---------------------------------------
  function move(game, map, unit, col, row) {
    const dest = reachable(game, map, unit).get(key(col, row));
    if (!dest || unit.owner !== game.turn) return null;
    unit.col = col; unit.row = row; unit.moved = true;
    return dest.path;
  }
  function attack(game, map, att, def) {
    if (att.owner !== game.turn || !targets(game, att).includes(def)) return null;
    const r = preview(game, map, att, def);
    def.hp -= r.dealt; att.hp -= r.back;
    att.acted = true;
    if (!has(att, 'hostigador')) att.moved = true;
    if (r.kills) att.kills++;
    // Implacable (caballero): si mata, puede atacar otra vez este turno (una vez).
    if (r.kills && !r.dies && has(att, 'implacable') && !att.again) { att.acted = false; att.again = true; }
    if (r.dies) def.kills++;
    game.units = game.units.filter(u => u.hp > 0);
    checkWinner(game);
    return r;
  }
  // Sigue vivo quien tenga al menos una ciudad. Al perder la última, sus tropas desaparecen.
  function checkWinner(game) {
    game.players.forEach((p, i) => {
      const was = p.alive;
      p.alive = game.cities.some(c => c.owner === i);
      if (was && !p.alive) {
        game.units = game.units.filter(u => u.owner !== i);
        game.events.push({ kind: 'eliminado', player: i });
      }
    });
    const alive = game.players.map((p, i) => (p.alive ? i : -1)).filter(i => i >= 0);
    if (alive.length === 1) game.winner = alive[0];
    else if (alive.length === 0) game.winner = -1;
  }
  // Al empezar tu turno: conquistas las ciudades enemigas donde sigue una tropa tuya, y cobras.
  function endTurn(game, map) {
    if (game.winner !== null) return;
    game.events = [];
    let next = game.turn;
    do {
      next = (next + 1) % game.players.length;
      if (next === 0) game.round++;
    } while (!game.players[next].alive && next !== game.turn);
    game.turn = next;
    game.units.forEach(u => { if (u.owner === next) { u.moved = false; u.acted = false; u.again = false; } });
    for (const c of game.cities) {
      const u = unitAt(game, c.col, c.row);
      if (!u || u.owner !== next || c.owner === next) continue;
      const from = c.owner;
      c.owner = next; c.capital = false;
      game.units.forEach(x => { if (x.home === c.id) x.home = null; }); // las tropas que salieron de allí ya no cuentan
      u.home = cityUnits(game, c).length < cityCapacity(game, map, c) ? c.id : u.home;
      game.events.push({ kind: 'conquista', city: c.id, from, to: next });
    }
    checkWinner(game);
    if (game.winner !== null || game.round === 1) return; // en la primera ronda nadie cobra (así es justo para todos)
    const inc = playerIncome(game, map, next), p = game.players[next];
    p.gold += inc.oro; p.food += inc.comida;
    game.events.push({ kind: 'cobro', oro: inc.oro, comida: inc.comida });
  }
  function canDoSomething(game, map, u) {
    return reachable(game, map, u).size > 0 || targets(game, u).length > 0 || !healProblem(game, map, u) || !blessProblem(game, map, u)
      || (u.type === 'colono' && !foundProblem(game, map, u));
  }

  // --- Monje: cura a las tropas de al lado ----------------------------------
  function blessTargets(game, u) {
    return game.units.filter(x => x.owner === u.owner && x !== u && x.hp < UNITS[x.type].hp && M.distance(x.col, x.row, u.col, u.row) === 1);
  }
  function blessProblem(game, map, u) {
    if (!u || !has(u, 'sanador')) return 'Solo los monjes curan así.';
    if (u.owner !== game.turn) return 'No es tu turno.';
    if (u.acted) return 'Ya ha actuado este turno.';
    if (!blessTargets(game, u).length) return 'No tiene al lado ninguna tropa tuya herida.';
    return null;
  }
  function bless(game, map, u) {
    if (blessProblem(game, map, u)) return null;
    const out = blessTargets(game, u).map(x => { const n = Math.min(ECON.monkHeal, UNITS[x.type].hp - x.hp); x.hp += n; return { id: x.id, n }; });
    u.acted = true;
    return out;
  }

  // --- Tecnologías ----------------------------------------------------------
  function hasTech(game, owner, id) { const p = game.players[owner]; return !!(p && p.techs && p.techs.includes(id)); }
  function branchLabel(id) { return BRANCHES.find(b => b.id === TECHS[id].branch).label; }
  function techsOfBranch(branch) { return Object.keys(TECHS).filter(k => TECHS[k].branch === branch).sort((a, b) => TECHS[a].level - TECHS[b].level); }
  // Precio: según el nivel, +2 por cada ciudad que no es la capital y +1 por cada nivel de esa ciudad por encima del 1.
  function techCost(game, owner, id) {
    let cost = TECH_COST[TECHS[id].level];
    for (const c of game.cities) {
      if (c.owner !== owner || c.capital) continue;
      cost += ECON.techPerCity + ECON.techPerCityLevel * (cityLevel(game, null, c) - 1);
    }
    if (hasTech(game, owner, 'escritura') && id !== 'escritura') cost -= 1;
    return Math.max(1, cost);
  }
  function techProblem(game, owner, id) {
    const t = TECHS[id];
    if (!t) return 'No existe.';
    if (hasTech(game, owner, id)) return 'Ya la tienes.';
    const prev = techsOfBranch(t.branch).find(k => TECHS[k].level === t.level - 1);
    if (prev && !hasTech(game, owner, prev)) return `Antes necesitas ${TECHS[prev].label}.`;
    if (t.level > 1 && !game.cities.some(c => c.owner === owner && cityLevel(game, null, c) >= t.level)) return `Necesitas una ciudad de nivel ${t.level}.`;
    if (owner !== game.turn) return 'No es tu turno.';
    if (game.players[owner].gold < techCost(game, owner, id)) return `Te falta oro (cuesta ${techCost(game, owner, id)}).`;
    return null;
  }
  function research(game, owner, id) {
    if (techProblem(game, owner, id)) return null;
    game.players[owner].gold -= techCost(game, owner, id);
    game.players[owner].techs.push(id);
    return id;
  }

  // --- Órdenes ------------------------------------------------------------
  // Cada cosa que hace un jugador se puede escribir como una orden pequeña, por ejemplo
  // { a: 'move', u: 7, col: 3, row: 5 }. Así, en las partidas online se guardan las órdenes
  // de cada turno y los demás las ven repetirse en su móvil (no hay azar: sale igual).
  function unitById(game, id) { return game.units.find(u => u.id === id) || null; }
  function perform(game, map, o) {
    const u = o.u !== undefined ? unitById(game, o.u) : null;
    const city = o.city !== undefined ? cityById(game, o.city) : null;
    const t = o.col !== undefined ? M.tileAt(map, o.col, o.row) : null;
    switch (o.a) {
      case 'move': return u && move(game, map, u, o.col, o.row);
      case 'attack': { const d = unitById(game, o.t); return u && d && attack(game, map, u, d); }
      case 'found': return u && found(game, map, u);
      case 'build': return t && build(game, map, t);
      case 'road': return t && buildRoad(game, map, t);
      case 'nivel': return city && levelUp(game, map, city);
      case 'ampliar': return city && expand(game, map, city);
      case 'fortificar': return city && fortify(game, map, city);
      case 'recruit': return city && recruit(game, map, city, o.type);
      case 'heal': return u && heal(game, map, u);
      case 'sanar': return u && bless(game, map, u);
      case 'tech': return research(game, game.turn, o.id);
      case 'end': endTurn(game, map); return true;
      default: return null;
    }
  }

  // Al cargar una partida guardada: quita del mapa los recursos que se perdieron al fundar ciudades.
  function applyCleared(game, map) {
    for (const k of Object.keys(game.cleared || {})) { const [c, r] = k.split(',').map(Number); const t = M.tileAt(map, c, r); if (t) t.resource = null; }
  }
  const api = { TECHS, BRANCHES, hasTech, techCost, techProblem, research, techsOfBranch, branchLabel,
    blessTargets, blessProblem, bless, levelNeedsFor, applyCleared, perform, unitById, UNITS, SKILLS, CLASSES, TECH_TERRAIN, ARMIES, GROUND, ECON, BUILDINGS, RECRUITABLE, has, visionOf, newGame, unitAt, reachable, targets, preview, move, attack,
    endTurn, defenseOf, terrainDef, weak, canDoSomething, key,
    cityAt, cityById, ownerOfTile, cityTiles, cityLevel, cityIncome, playerIncome, cityUnits, cityCapacity,
    foundProblem, found, buildOption, build, buildingFor, recruitProblem, recruit, healProblem, healAmount, heal,
    givesText, buildingGives, levelUpProblem, levelUp, expandProblem, expand, expandTiles, fortProblem, fortify, fortBonus,
    hasRoad, roadProblem, canOfferRoad, buildRoad, connectedCities };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PERules = api;
})(this);
