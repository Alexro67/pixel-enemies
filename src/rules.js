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
    hostigador:  { label: 'Hostigador', text: 'después de atacar puede moverse otra vez, aunque ya se hubiera movido antes' },
    explorador:  { label: 'Explorador', text: 've a 2 casillas' },
    civil:       { label: 'Civil', text: 'no ataca ni contraataca' },
    antiMontada: { label: 'Antijinetes', text: '+2 de defensa contra tropas montadas' },
    implacable:  { label: 'Implacable', text: 'si mata, puede volver a atacar' },
    sanador:     { label: 'Sanador', text: 'en vez de atacar, cura 3 de vida a tus tropas de al lado' },
    comerciante: { label: 'Comerciante', text: 'en otra ciudad unida por camino a la suya, abre una ruta de comercio' },
    barco:       { label: 'Barco', text: 'navega por el agua y no conquista ciudades' },
    transporte:  { label: 'Transporte', text: 'lleva tropas: llévalas a su casilla para subirlas' },
    legendaria:  { label: 'Legendaria', text: 'sale del Santuario de las leyendas y solo puedes tener una de cada' },
    anfibia:     { label: 'Anfibia', text: 'anda por tierra, río y costa, pero no por el mar abierto, y el agua no la para' },
    encanta:     { label: 'Encanta', text: 'la tropa a la que ataca no puede moverse en su siguiente turno' },
    derriba:     { label: 'Derriba murallas', text: 'hace el triple de daño a murallas y torres' },
    vuela:       { label: 'Vuela', text: 'pasa por encima de agua, bosques, montañas y murallas sin pararse, y puede quedarse sobre el agua' },
    fuego:       { label: 'Escupe fuego', text: 'también quema a la mitad a los enemigos de las 2 casillas que tocan a la vez al dragón y al objetivo' },
  };
  // Visión: todas ven 1 casilla alrededor; 2 si son exploradoras o están en una montaña.
  // Defensa extra según el terreno, por clase de tropa. El río resta a todos.
  const CLASSES = {
    infanteria: { label: 'Infantería', terrain: { bosque: 1, montana: 2, rio: -1 } },
    tirador:    { label: 'Tirador', terrain: { bosque: 2, montana: 1, rio: -1 } },
    montada:    { label: 'Montada', terrain: { rio: -1 } }, // a caballo no se esconde en bosque ni montaña
    maquina:    { label: 'Máquina de guerra', terrain: { rio: -1 } }, // cañones y catapultas no se esconden
    naval:      { label: 'Naval', terrain: {} },                          // los barcos no se esconden en ningún sitio
    coloso:     { label: 'Coloso', terrain: { rio: -1 } },                // el gigante es tan grande que no se esconde
    volador:    { label: 'Volador', terrain: {} },                        // el dragón va por el aire: ni se esconde ni le afecta el río
  };
  // Tecnologías que dan defensa en un terreno: { tecnologia: { clase|'todas': { terreno: +n } } }
  const TECH_TERRAIN = {
    lenadores: { infanteria: { bosque: 1 } },
    montaneros: { todas: { montana: 1 } },
  };

  // --- Tecnologías --------------------------------------------------------
  // Ramas. Dentro de cada rama hay que ir en orden (de izquierda a derecha), y una
  // tecnología de nivel N (2 o más) pide tener una ciudad de nivel N.
  // "after": tecnologías de OTRAS ramas que hacen falta antes (porque lo que da las necesita).
  // El texto explica lo que no son tropas ni edificios; esos se explican solos (techDetails).
  const BRANCHES = [
    { id: 'campo',    label: 'Campo' },
    { id: 'comercio', label: 'Comercio' },
    { id: 'monte',    label: 'Monte' },
    { id: 'armas',    label: 'Armas' },
    { id: 'caballos', label: 'Caballos' },
    { id: 'guerra',   label: 'Defensa' },
    { id: 'mar',      label: 'Mar' },
    { id: 'saber',    label: 'Saber' },
  ];
  const TECHS = {
    caza:          { branch: 'campo',  level: 1, label: 'Caza y caminos',
                     text: 'Caminos y puentes: 2 oro cada casilla, en tu territorio o en terreno neutral que veas. Ir de camino a camino gasta medio movimiento y el bosque, la montaña o el río no paran a la tropa. Cada ciudad unida por camino a tu capital da +1 oro, y la capital +1 por cada una. Ampliar territorio: 8 oro, la ciudad gana el anillo de casillas libres que la rodea' },
    molinos:       { branch: 'campo',  level: 2, label: 'Molinos',        text: 'Puedes hacer varios molinos en la misma ciudad. Cada plantación cuenta para todos los molinos que tenga al lado' },
    gremios:       { branch: 'campo',  level: 3, label: 'Gremios',        text: 'Para subir una ciudad de nivel hace falta 1 edificio menos en su territorio' },
    comercio:      { branch: 'comercio', level: 3, label: 'Comercio', after: ['caza'],
                     text: 'En el mercado puedes cambiar 2 comida por 1 oro o 2 oro por 1 comida, 3 veces por turno. El mercader abre una ruta de comercio al llegar a otra ciudad (tuya o de otro) unida por camino a la suya: cada turno, 1 oro para cada ciudad, o 2 si están a más de 4 casillas. Una tropa o muralla de un tercero en el camino la corta. Pide antes Caza y caminos porque las rutas van por camino' },
    rutas:         { branch: 'comercio', level: 4, label: 'Rutas marítimas', after: ['pesca'],
                     text: 'Una ruta de comercio vale también por agua: si las dos ciudades tienen muelle o puerto unidos por agua, no hace falta camino. Lleva al mercader en barco hasta la otra ciudad. Pide antes Pesca porque hacen falta muelles y barcos' },
    lenadores:     { branch: 'monte',  level: 1, label: 'Leñadores',      text: 'Tu infantería gana +1 de defensa en el bosque' },
    mineria:       { branch: 'monte',  level: 2, label: 'Minería',        text: '' },
    tala:          { branch: 'monte',  level: 3, label: 'Tala',
                     text: 'Talar un bosque de tu territorio: 2 oro. Se convierte en llanura para siempre (se pierden los animales o la leña que hubiera) y ahí puedes poner un molino, un mercado, un taller, un templo o el Santuario. No se puede talar con un edificio encima ni con un enemigo' },
    montaneros:    { branch: 'monte',  level: 4, label: 'Montañeros',     text: 'Todas tus tropas ganan +1 de defensa en la montaña' },
    arqueria:      { branch: 'armas',  level: 1, label: 'Arquería',       text: '' },
    forja:         { branch: 'armas',  level: 2, label: 'Forja',          text: 'Con el taller, los demás edificios de esa ciudad cuestan 1 oro menos' },
    polvora:       { branch: 'armas',  level: 3, label: 'Pólvora',        text: 'El cañón solo se recluta en ciudades con taller (por eso Forja va antes)' },
    ingenieria:    { branch: 'armas',  level: 4, label: 'Ingeniería',     text: 'La catapulta solo se recluta en ciudades con taller' },
    equitacion:    { branch: 'caballos', level: 1, label: 'Equitación',   text: '' },
    caballeria:    { branch: 'caballos', level: 2, label: 'Caballería',   text: '' },
    fortificacion: { branch: 'guerra', level: 1, label: 'Fortificación',  text: 'Fortificar una ciudad: 5 oro, la tropa que la defiende gana +2 de defensa (no se suma al terreno ni a la muralla: cuenta la mayor)' },
    murallas:      { branch: 'guerra', level: 2, label: 'Murallas',
                     text: 'Muralla: 4 oro por casilla, 30 de vida; el enemigo no puede pasar y tu tropa encima gana +2 de defensa. Torre de vigía: 7 oro, 20 de vida, ve a 3 casillas, una por cada ciudad que tengas. Las dos se hacen en tu territorio o en terreno neutral que veas (no en el agua) y se reparan por 2 oro' },
    pesca:         { branch: 'mar',    level: 1, label: 'Pesca',          text: 'Los barcos salen del muelle o del puerto de la ciudad que los recluta' },
    astilleros:    { branch: 'mar',    level: 2, label: 'Astilleros',     text: 'La carabela sale de un muelle o puerto de costa (no de río)' },
    armada:        { branch: 'mar',    level: 4, label: 'Armada',         text: '' },
    escritura:     { branch: 'saber',  level: 1, label: 'Escritura',      text: 'Todas las demás tecnologías te cuestan 1 oro menos' },
    monasterios:   { branch: 'saber',  level: 2, label: 'Monasterios',    text: 'Tus tropas heridas que estén en el territorio de una ciudad con templo se curan 2 de vida solas al empezar tu turno. El monje solo se recluta en ciudades con templo' },
    mitos:         { branch: 'saber',  level: 3, label: 'Mitos',          text: 'Las criaturas legendarias solo se reclutan en el Santuario, y solo puedes tener una de cada a la vez' },
    leyendas:      { branch: 'saber',  level: 4, label: 'Leyendas',       text: 'Se reclutan en el Santuario de las leyendas (por eso Mitos va antes)' },
  };
  const TECH_COST = [0, 3, 5, 8, 12]; // por nivel de la tecnología

  // --- Tropas (cifras del documento de diseño) ----------------------------
  const UNITS = {
    colono:    { label: 'Colono',    hp: 5,  atk: 0, def: 1, move: 1, range: 1, cost: 6, cls: 'infanteria', skills: ['civil'] },
    miliciano: { label: 'Miliciano', hp: 10, atk: 2, def: 2, move: 1, range: 1, cost: 3, cls: 'infanteria', skills: [] },
    arquero:   { label: 'Arquero',   hp: 10, atk: 2, def: 1, move: 1, range: 2, cost: 5, cls: 'tirador', skills: ['distancia'], tech: 'arqueria' },
    jinete:    { label: 'Jinete',    hp: 10, atk: 2, def: 1, move: 2, range: 1, cost: 6, cls: 'montada', skills: ['hostigador', 'explorador'], tech: 'equitacion' },
    espadachin: { label: 'Espadachín', hp: 12, atk: 3, def: 3, move: 1, range: 1, cost: 8, cls: 'infanteria', skills: [], tech: 'forja' },
    lancero:   { label: 'Lancero',   hp: 10, atk: 2, def: 3, move: 1, range: 1, cost: 6, cls: 'infanteria', skills: ['antiMontada'], tech: 'fortificacion' },
    caballero: { label: 'Caballero', hp: 15, atk: 4, def: 2, move: 2, range: 1, cost: 12, cls: 'montada', skills: ['implacable'], tech: 'caballeria' },
    canon:     { label: 'Cañón',     hp: 10, atk: 3, def: 1, move: 1, range: 2, cost: 9, cls: 'maquina', skills: ['distancia', 'pesada'], tech: 'polvora', needs: 'taller' },
    catapulta: { label: 'Catapulta', hp: 8,  atk: 5, def: 0, move: 1, range: 3, cost: 12, cls: 'maquina', skills: ['distancia', 'pesada', 'sinReplica'], tech: 'ingenieria', needs: 'taller' },
    monje:     { label: 'Monje',     hp: 8,  atk: 0, def: 1, move: 1, range: 1, cost: 8, cls: 'infanteria', skills: ['sanador', 'civil'], tech: 'monasterios', needs: 'templo' },
    mercader:  { label: 'Mercader',  hp: 5,  atk: 0, def: 1, move: 1, range: 1, cost: 5, cls: 'infanteria', skills: ['comerciante', 'civil'], tech: 'comercio', needs: 'mercado' },
    // Barcos: salen del muelle (o puerto) de la ciudad. "sea" = por dónde navegan; "carry" = tropas que llevan.
    barca:     { label: 'Barca',     hp: 8,  atk: 1, def: 1, move: 3, range: 1, cost: 5,  cls: 'naval', skills: ['barco', 'transporte'], tech: 'pesca', sea: ['rio', 'costa'], carry: 2 },
    carabela:  { label: 'Carabela',  hp: 10, atk: 2, def: 2, move: 4, range: 1, cost: 9,  cls: 'naval', skills: ['barco', 'transporte', 'explorador'], tech: 'astilleros', sea: ['costa', 'mar'], carry: 2 },
    galeon:    { label: 'Galeón de guerra', hp: 20, atk: 4, def: 3, move: 2, range: 2, cost: 18, cls: 'naval', skills: ['barco', 'distancia'], tech: 'armada', sea: ['costa', 'mar'], carry: 0 },
    // Criaturas legendarias: salen del Santuario de las leyendas y solo puede haber una de cada por jugador.
    lamia:     { label: 'Lamia',     hp: 12, atk: 3, def: 2, move: 2, range: 1, cost: 18, cls: 'infanteria', skills: ['legendaria', 'anfibia', 'encanta'], tech: 'mitos', needs: 'santuario' },
    gigante:   { label: 'Gigante',   hp: 30, atk: 4, def: 3, move: 1, range: 1, cost: 22, cls: 'coloso', skills: ['legendaria', 'derriba', 'explorador'], tech: 'leyendas', needs: 'santuario' },
    dragon:    { label: 'Dragón',    hp: 20, atk: 5, def: 2, move: 3, range: 1, cost: 30, cls: 'volador', skills: ['legendaria', 'vuela', 'fuego'], tech: 'leyendas', needs: 'santuario' },
  };
  // Tropas propias de cada facción: solo las recluta esa facción (y solo en las partidas nuevas, con facciones).
  // Salen al final de la partida: cada una pide la última tecnología de una rama (Alex).
  Object.assign(UNITS, {
    arcabucero:    { label: 'Arcabucero', hp: 10, atk: 3, def: 2, move: 1, range: 2, cost: 7, cls: 'tirador', skills: ['distancia', 'baluarte'], tech: 'ingenieria', faction: 0 },
    contrabandista: { label: 'Contrabandista', hp: 8, atk: 2, def: 1, move: 2, range: 1, cost: 6, cls: 'infanteria', skills: ['vado', 'roba'], tech: 'rutas', faction: 1 },
    galeote:       { label: 'Galeote', hp: 16, atk: 3, def: 3, move: 3, range: 1, cost: 10, cls: 'naval', skills: ['barco', 'transporte'], tech: 'armada', sea: ['costa', 'mar'], carry: 1, faction: 2 },
    cazador:       { label: 'Cazador de dragones', hp: 10, atk: 2, def: 1, move: 1, range: 2, cost: 6, cls: 'tirador', skills: ['distancia', 'matadragones'], tech: 'leyendas', faction: 3 },
    guardian:      { label: 'Guardián de las cuevas', hp: 14, atk: 2, def: 4, move: 1, range: 1, cost: 7, cls: 'infanteria', skills: ['cuevas'], tech: 'montaneros', faction: 4 },
    aizkolari:     { label: 'Aizkolari', hp: 12, atk: 5, def: 1, move: 1, range: 1, cost: 8, cls: 'infanteria', skills: [], tech: 'gremios', faction: 5 },
  });
  Object.assign(SKILLS, {
    baluarte:     { label: 'Baluarte', text: '+2 de defensa dentro de una ciudad tuya o sobre tu muralla (se suma a lo demás)' },
    vado:         { label: 'Vadea ríos', text: 'el río no le para' },
    roba:         { label: 'Roba oro', text: 'cuando ataca, le quita 2 de oro al dueño de la tropa atacada' },
    matadragones: { label: 'Matadragones', text: 'hace el doble de daño a las criaturas legendarias' },
    cuevas:       { label: 'Cuevas', text: 'si está en una montaña de tu territorio, puede saltar a otra montaña libre de tu territorio' },
  });

  // --- Facciones -----------------------------------------------------------
  // Cada una tiene una ventaja pequeña (algo 1 más barato) y una tropa propia. El sitio de salida no depende de la facción.
  // Las ventajas solo valen en partidas nuevas (game.factions = true); las de antes siguen igual.
  const FACTIONS = [
    { name: 'Hondarribia', color: '#d23b3b', emblem: 'castillo', unit: 'arcabucero', perk: 'Murallas y torres le cuestan 1 oro menos' },
    { name: 'Irun', color: '#e8c021', emblem: 'puente', unit: 'contrabandista', perk: 'Los caminos y puentes le cuestan 1 oro en vez de 2' },
    { name: 'Donosti', color: '#3b6fd2', emblem: 'concha', unit: 'galeote', perk: 'Sus barcos le cuestan 1 comida menos' },
    { name: 'Lekumberri', color: '#3fa34d', emblem: 'pino', unit: 'cazador', perk: 'El puesto de caza le cuesta 1 oro menos' },
    { name: 'Alli', color: '#8e4bc4', emblem: 'cueva', unit: 'guardian', perk: 'Fortificar una ciudad le cuesta 3 oro en vez de 5' },
    { name: 'Leitza', color: '#ee8a2a', emblem: 'hacha', unit: 'aizkolari', perk: 'El aserradero le cuesta 1 oro menos' },
  ];
  const PERK = { muros: 0, caminos: 1, barcos: 2, caza: 3, fuerte: 4, aserradero: 5 };
  const PERK_NUMBERS = { discount: 1, fortDiscount: 2, bulwark: 2 };
  // ¿Tiene este jugador la ventaja de su facción? (solo en partidas con facciones)
  function perk(game, owner, id) {
    const p = game && game.factions && game.players[owner];
    return !!p && p.faction === PERK[id];
  }
  // Precios con la ventaja de la facción (Irun caminos, Alli fortificar, Hondarribia murallas y torres).
  function roadCost(game, owner) { return ECON.roadCost - (perk(game, owner, 'caminos') ? PERK_NUMBERS.discount : 0); }
  function fortCost(game, owner) { return ECON.fortCost - (perk(game, owner, 'fuerte') ? PERK_NUMBERS.fortDiscount : 0); }
  function structCost(game, owner, kind) { return STRUCTS[kind].cost() - (perk(game, owner, 'muros') ? PERK_NUMBERS.discount : 0); }
  function factionUnit(game, owner, type) { // null si la puede reclutar, o el motivo
    const f = UNITS[type].faction;
    if (f === undefined) return null;
    if (!game.factions) return 'Las tropas propias de cada facción solo salen en partidas nuevas.';
    return game.players[owner].faction === f ? null : `Solo la recluta ${FACTIONS[f].name}.`;
  }

  const ARMIES = { real: ['colono', 'miliciano'], prueba: ['miliciano', 'arquero', 'jinete'] };
  const has = (u, skill) => UNITS[u.type].skills.includes(skill);
  const isShip = (u) => !!UNITS[u.type].sea;
  // Por dónde puede andar una tropa de tierra: el dragón por todas partes; la lamia también por río y costa.
  function walks(u, t) {
    if (!t) return false;
    if (UNITS[u.type].skills.includes('vuela')) return true;
    if (UNITS[u.type].skills.includes('anfibia') && (t.terrain === 'costa' || t.terrain === 'rio')) return true;
    return ground(t).walk;
  }
  // ¿Se para al entrar en esta casilla? (bosque, montaña y río paran; al dragón no; a la lamia, el agua no)
  // El contrabandista vadea los ríos.
  function stopsAt(u, t, game) {
    if (UNITS[u.type].skills.includes('vuela')) return false;
    if (UNITS[u.type].skills.includes('anfibia') && (t.terrain === 'costa' || t.terrain === 'rio')) return false;
    if (UNITS[u.type].skills.includes('vado') && t.terrain === 'rio') return false;
    return !!ground(t).stop;
  }
  const sails = (u, t) => !!t && UNITS[u.type].sea.includes(t.terrain);

  // --- Ciudades y economía (cifras de prueba, se ajustan aquí) ---------------
  const ECON = {
    startGold: 3, startFood: 3,      // lo que tienes al empezar
    perLevel: { oro: 1, comida: 1 }, // lo que da cada ciudad por cada nivel, cada turno
    maxLevel: 7,
    levelCost: (level) => 3 * level,    // oro para pasar del nivel "level" al siguiente
    levelFood: (level) => 2 * level,    // y comida (solo en partidas nuevas: Alex, para que la comida no se acumule)
    levelNeeds: (level) => level,       // edificios que hacen falta en su territorio para subir
    expandCost: 8, expandTech: 'caza',  // ampliar el territorio (un anillo más de casillas): pide esa tecnología
    settlerStep: 3,                     // el colono cuesta 3 más por cada ciudad tuya aparte de la capital y por cada colono tuyo
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
    trades: 3,                          // cambios por turno en cada mercado (2 de una cosa por 1 de la otra)
    templeHeal: 2,                      // vida que recuperan solas tus tropas en el territorio de un templo
    routeGold: 1, routeFarGold: 2, routeFar: 4, // oro por ruta para cada ciudad (2 si están a más de 4 casillas)
    wallCost: 4, towerCost: 7, demolishCost: 1, fellCost: 2, wallHp: 30, towerHp: 20, repairCost: 2,
    wallDefense: 2,                     // defensa extra a tu tropa que está sobre tu muralla
    towerVision: 3,
  };
  // Murallas y torres: se construyen en tu territorio o en terreno neutral (como los caminos).
  const STRUCTS = {
    muralla: { label: 'Muralla', cost: () => ECON.wallCost, hp: () => ECON.wallHp },
    torre:   { label: 'Torre', cost: () => ECON.towerCost, hp: () => ECON.towerHp },
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
    puerto:     { label: 'Puerto pesquero',     resource: 'pesca',   cost: 4, gives: { comida: 1, oro: 1 }, tech: 'pesca', dock: true,
                  extra: 'también sirve de muelle para sacar barcos' },
    muelle:     { label: 'Muelle', terrains: ['costa', 'rio'], noResource: true, cost: 3, gives: {}, tech: 'pesca', dock: true,
                  extra: 'de aquí salen los barcos de la ciudad' },
    // Edificios grandes: en una llanura vacía, uno de cada por ciudad. El mercado pide 2 edificios al lado; taller y templo, 1 (Alex).
    mercado:    { label: 'Mercado', big: true, cost: 8, gives: {}, tech: 'comercio', near: null, per: 'oro',
                  extra: '+1 oro por cada edificio de al lado. Cambia comida por oro y recluta mercaderes' },
    taller:     { label: 'Taller',  big: true, nearNeeded: 1, cost: 8, gives: {}, tech: 'forja', near: ['mina', 'cantera', 'aserradero'], per: 'oro',
                  extra: '+1 oro por cada mina, cantera o aserradero de al lado. Cañones y catapultas, y edificios 1 oro más baratos en esta ciudad' },
    templo:     { label: 'Templo',  big: true, nearNeeded: 1, cost: 6, gives: {}, tech: 'monasterios', near: ['granja', 'caza', 'puerto'], per: 'comida',
                  extra: '+1 comida por cada plantación, puesto de caza o puerto de al lado. Tus tropas en su territorio se curan 2 solas y recluta monjes' },
    molino:     { label: 'Molino', big: true, many: true, cost: 4, gives: {}, tech: 'molinos', near: ['granja'], nearNeeded: 1, per: 'comida',
                  extra: '+1 comida por cada plantación de trigo de al lado' },
    santuario:  { label: 'Santuario de las leyendas', big: true, cost: 15, gives: {}, tech: 'mitos', nearNeeded: 0, minLevel: 4,
                  extra: 'aquí se reclutan la lamia, el gigante y el dragón' },
  };
  const BIG = Object.keys(BUILDINGS).filter(k => BUILDINGS[k].big);
  const givesText = (g) => Object.entries(g).map(([k, v]) => `+${v} ${k}`).join(' y ');
  function buildingFor(t) {
    return Object.keys(BUILDINGS).find(k => {
      const b = BUILDINGS[k];
      if (b.big) return false;
      if (b.terrains) return b.terrains.includes(t.terrain) && !t.resource;
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
    const close = opts.close && players.length === 2; // con más de 2, cada uno en su sitio
    const anchors = close ? closeAnchors(map, players.length) : map.starts.slice(0, players.length);
    // En el modo de prueba se empieza con mucho oro y comida, para probarlo todo rápido.
    const rich = army === ARMIES.prueba ? 30 : 0;
    const game = { players: players.map(f => ({ faction: f, alive: true, techs: [], gold: ECON.startGold + rich, food: ECON.startFood + rich, founded: 0 })),
      turn: 0, round: 1, units: [], cities: [], territory: {}, buildings: {}, roads: {}, nextId: 1, winner: null, events: [], factions: true };
    ensure(game);
    const taken = new Set();
    anchors.forEach((a, p) => {
      const city = addCity(game, map, p, a.col, a.row, true);
      const spots = [M.tileAt(map, a.col, a.row)].concat(landAround(map, a, army.length + 1, new Set([key(a.col, a.row)])));
      army.forEach((type, k) => {
        const s = spots.find(x => x && !taken.has(key(x.col, x.row)));
        if (!s) return;
        taken.add(key(s.col, s.row));
        const u = makeUnit(game, type, p, s.col, s.row);
        if (army === ARMIES.real && type !== 'colono') u.home = city.id; // las de la prueba y el colono del principio no ocupan sitio
        game.units.push(u);
      });
    });
    return game;
  }
  // Partidas guardadas antes de las murallas, torres y rutas: se les añade lo que falta.
  function ensure(game) {
    if (!game) return game;
    game.walls = game.walls || {};      // casilla -> { owner, hp }
    game.towers = game.towers || {};    // casilla -> { owner, hp }
    game.routes = game.routes || [];    // [{ a: ciudad, b: ciudad }]
    game.explored = game.explored || {}; // jugador -> casillas ya vistas alguna vez ('1' = vista)
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
  // Las tropas que van en un barco (u.aboard) no ocupan la casilla: la ocupa el barco.
  function unitAt(game, col, row) { return game.units.find(u => u.col === col && u.row === row && !u.aboard) || null; }
  function enemyNear(game, owner, col, row) {
    return game.units.some(u => u.owner !== owner && !u.aboard && M.distance(u.col, u.row, col, row) === 1);
  }
  function passengers(game, ship) { return game.units.filter(u => u.aboard === ship.id); }
  function shipRoom(game, ship) { return (UNITS[ship.type].carry || 0) - passengers(game, ship).length; }
  function shipOf(game, u) { return u.aboard ? game.units.find(x => x.id === u.aboard) || null : null; }

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
    if (b.big) { if (b.per) out[b.per] = owner ? bigNeighbors(game, map, t, owner.owner, b.near) : 0; return out; }
    if (b.forestBonus) {
      const city = ownerOfTile(game, t.col, t.row);
      const free = city && cityTiles(game, map, city).some(x => x.terrain === 'bosque' && x !== t && !game.buildings[key(x.col, x.row)] && !cityAt(game, x.col, x.row));
      if (free) out.oro = (out.oro || 0) + b.forestBonus;
    }
    return out;
  }
  // Edificios de un jugador en las casillas de al lado (kinds = qué tipos cuentan; null = todos).
  function bigNeighbors(game, map, t, owner, kinds) {
    let n = 0;
    for (const [c, r] of M.neighbors(t.col, t.row, map.cols, map.rows)) {
      const b = game.buildings[key(c, r)], o = ownerOfTile(game, c, r);
      if (b && o && o.owner === owner && (!kinds || kinds.includes(b))) n++;
    }
    return n;
  }
  function cityHas(game, map, city, type) { return cityBuildings(game, map, city).includes(type); }
  // Precio de un edificio en una ciudad (el taller los abarata 1 oro, menos a sí mismo).
  function buildCost(game, map, city, type) {
    let base = BUILDINGS[type].cost;
    if (city && ((type === 'aserradero' && perk(game, city.owner, 'aserradero')) || (type === 'caza' && perk(game, city.owner, 'caza')))) base = Math.max(1, base - PERK_NUMBERS.discount); // Leitza, Lekumberri
    return city && type !== 'taller' && cityHas(game, map, city, 'taller') ? Math.max(1, base - 1) : base;
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
    out.ruta = 0;
    for (const rt of game.routes || []) {
      if (rt.a !== city.id && rt.b !== city.id) continue;
      const g = routeGold(game, map, rt);
      out.ruta += g;
    }
    out.oro += out.ruta;
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
    if (game.players[game.turn].food < levelFood(game, lvl)) return `Te falta comida para subir de nivel (cuesta ${levelFood(game, lvl)}).`;
    return null;
  }
  function levelFood(game, level) { return game.factions ? ECON.levelFood(level) : 0; }
  function levelNeedsFor(game, city) {
    return Math.max(0, ECON.levelNeeds(cityLevel(null, null, city)) - (hasTech(game, city.owner, 'gremios') ? 1 : 0));
  }
  function levelUp(game, map, city) {
    if (levelUpProblem(game, map, city)) return false;
    game.players[game.turn].gold -= ECON.levelCost(cityLevel(game, map, city));
    game.players[game.turn].food -= levelFood(game, cityLevel(game, map, city));
    city.level = cityLevel(game, map, city) + 1;
    return true;
  }
  function expandProblem(game, map, city) {
    if (city.owner !== game.turn) return 'No es tu ciudad.';
    if (city.expanded) return 'Ya está ampliada.';
    if (!hasTech(game, city.owner, ECON.expandTech)) return `Necesitas la tecnología ${TECHS[ECON.expandTech].label} (rama ${branchLabel(ECON.expandTech)}).`;
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
    if (!hasTech(game, city.owner, 'fortificacion')) return 'Necesitas la tecnología Fortificación (rama Defensa).';
    if (game.players[game.turn].gold < fortCost(game, city.owner)) return `Te falta oro para fortificar (cuesta ${fortCost(game, city.owner)}).`;
    return null;
  }
  function fortify(game, map, city) {
    if (fortProblem(game, map, city)) return false;
    game.players[game.turn].gold -= fortCost(game, city.owner);
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
    const st = structAt(game, t.col, t.row);
    if (st && st.kind === 'torre') return 'Hay una torre.';
    if (st && st.owner !== game.turn) return 'Hay una muralla de otro jugador.';
    if (!owner && !visibleTo(game, map, game.turn).has(key(t.col, t.row))) return 'Tienes que ver esa casilla (con una tropa, ciudad o torre tuya cerca).';
    if (game.players[game.turn].gold < roadCost(game, game.turn)) return `Te falta oro (un camino cuesta ${roadCost(game, game.turn)}).`;
    return null;
  }
  function canOfferRoad(game, map, t) { // si tiene sentido enseñar el botón
    const st = t && structAt(game, t.col, t.row);
    if (!t || t.terrain === 'mar' || t.terrain === 'costa' || hasRoad(game, t.col, t.row) || (st && (st.kind === 'torre' || st.owner !== game.turn))) return false;
    const owner = ownerOfTile(game, t.col, t.row);
    return owner ? owner.owner === game.turn : visibleTo(game, map, game.turn).has(key(t.col, t.row));
  }
  function buildRoad(game, map, t) {
    if (roadProblem(game, map, t)) return false;
    game.players[game.turn].gold -= roadCost(game, game.turn);
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
        const w = game.walls && game.walls[k];
        if (w && w.owner !== owner) continue; // una muralla de otro corta el camino
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
    if (u.aboard) return 'Primero tiene que bajar del barco a tierra.';
    if (u.acted) return 'Este colono acaba de salir; podrá fundar en tu próximo turno.';
    const t = M.tileAt(map, u.col, u.row);
    if (!ECON.foundOn.includes(t.terrain)) return 'Solo se puede fundar en llanura o bosque.';
    if (game.territory[key(t.col, t.row)]) return 'Esta casilla ya es territorio de una ciudad.';
    if (structAt(game, t.col, t.row)) return 'Aquí hay una muralla o una torre.';
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
    if (!type || !city || city.owner !== game.turn || game.buildings[key(t.col, t.row)] || cityAt(game, t.col, t.row) || structAt(game, t.col, t.row)) return null;
    const b = BUILDINGS[type], cost = buildCost(game, map, city, type);
    let problem = null;
    const other = unitAt(game, t.col, t.row);
    if (b.tech && !hasTech(game, game.turn, b.tech)) problem = `Necesitas la tecnología ${TECHS[b.tech].label} (rama ${branchLabel(b.tech)}).`;
    else if (other && other.owner !== game.turn) problem = 'Hay una tropa enemiga encima.';
    else if (game.players[game.turn].gold < cost) problem = `Te falta oro (cuesta ${cost}).`;
    return { type, problem, city, cost };
  }
  // Edificios grandes que se podrían hacer en esta casilla (llanura vacía de tu territorio).
  function bigOptions(game, map, t) {
    if (!t || t.terrain !== 'llanura' || t.resource) return [];
    const city = ownerOfTile(game, t.col, t.row);
    if (!city || city.owner !== game.turn || game.buildings[key(t.col, t.row)] || cityAt(game, t.col, t.row) || structAt(game, t.col, t.row)) return [];
    const other = unitAt(game, t.col, t.row);
    return BIG.map(type => {
      const b = BUILDINGS[type], cost = buildCost(game, map, city, type), near = bigNeighbors(game, map, t, game.turn, b.near);
      let problem = null;
      if (b.tech && !hasTech(game, game.turn, b.tech)) problem = `Necesitas la tecnología ${TECHS[b.tech].label} (rama ${branchLabel(b.tech)}).`;
      else if (!b.many && cityHas(game, map, city, type)) problem = `Esta ciudad ya tiene ${b.label.toLowerCase()}.`;
      else if (b.minLevel && cityLevel(game, map, city) < b.minLevel) problem = `Solo en ciudades de nivel ${b.minLevel} o más (esta es de nivel ${cityLevel(game, map, city)}).`;
      else if (near < (b.nearNeeded === undefined ? 2 : b.nearNeeded)) problem = `Necesita al lado al menos ${b.nearNeeded === undefined ? 2 : b.nearNeeded} edificio${b.nearNeeded === 1 ? '' : 's'}${b.near ? ' de estos: ' + b.near.map(k => BUILDINGS[k].label.toLowerCase()).join(', ') : ''} (tiene ${near}).`;
      else if (other && other.owner !== game.turn) problem = 'Hay una tropa enemiga encima.';
      else if (game.players[game.turn].gold < cost) problem = `Te falta oro (cuesta ${cost}).`;
      return { type, problem, city, cost, near };
    });
  }
  function build(game, map, t, type) {
    const opt = type && BUILDINGS[type] && BUILDINGS[type].big ? bigOptions(game, map, t).find(x => x.type === type) : buildOption(game, map, t);
    if (!opt || opt.problem || (type && opt.type !== type)) return null;
    game.players[game.turn].gold -= opt.cost;
    game.buildings[key(t.col, t.row)] = opt.type;
    return opt.type;
  }

  // --- Murallas y torres -------------------------------------------------------
  // Se construyen en tu territorio o en terreno neutral que veas. El enemigo no puede pasar
  // por ellas; tus tropas sí (y sobre tu muralla defienden mejor). Cualquier tropa enemiga
  // puede golpearlas cuando no hay nadie encima; al llegar a 0 de vida, desaparecen.
  function structAt(game, col, row) {
    const k = key(col, row);
    if (game.walls && game.walls[k]) return Object.assign({ kind: 'muralla', key: k, col, row, max: ECON.wallHp }, game.walls[k]);
    if (game.towers && game.towers[k]) return Object.assign({ kind: 'torre', key: k, col, row, max: ECON.towerHp }, game.towers[k]);
    return null;
  }
  function structStore(game, kind) { return kind === 'muralla' ? game.walls : game.towers; }
  function structProblem(game, map, t, kind) {
    if (!t || !STRUCTS[kind]) return 'Aquí no.';
    if (!ground(t).walk || t.terrain === 'rio') return 'Solo en tierra (no en el agua ni en el río).';
    if (cityAt(game, t.col, t.row)) return 'Aquí está la ciudad.';
    if (structAt(game, t.col, t.row)) return 'Ya hay una muralla o una torre.';
    if (game.buildings[key(t.col, t.row)]) return 'Hay un edificio.';
    if (kind === 'torre' && game.roads[key(t.col, t.row)]) return 'Hay un camino.';
    if (!hasTech(game, game.turn, 'murallas')) return 'Necesitas la tecnología Murallas (rama Defensa).';
    const owner = ownerOfTile(game, t.col, t.row);
    if (owner && owner.owner !== game.turn) return 'Es territorio enemigo.';
    const u = unitAt(game, t.col, t.row);
    if (u && u.owner !== game.turn) return 'Hay una tropa enemiga encima.';
    if (!owner && !visibleTo(game, map, game.turn).has(key(t.col, t.row))) return 'Tienes que ver esa casilla (con una tropa, ciudad o torre tuya cerca).';
    if (kind === 'torre') {
      const mine = Object.values(game.towers).filter(x => x.owner === game.turn).length;
      const cities = game.cities.filter(c => c.owner === game.turn).length;
      if (mine >= cities) return `Puedes tener una torre por cada ciudad (tienes ${mine}).`;
    }
    const cost = structCost(game, game.turn, kind);
    if (game.players[game.turn].gold < cost) return `Te falta oro (cuesta ${cost}).`;
    return null;
  }
  function canOfferStruct(game, map, t) {
    if (!t || !ground(t).walk || t.terrain === 'rio' || cityAt(game, t.col, t.row) || structAt(game, t.col, t.row)
      || game.buildings[key(t.col, t.row)]) return false;
    const owner = ownerOfTile(game, t.col, t.row);
    return owner ? owner.owner === game.turn : visibleTo(game, map, game.turn).has(key(t.col, t.row));
  }
  function buildStruct(game, map, t, kind) {
    if (structProblem(game, map, t, kind)) return null;
    game.players[game.turn].gold -= structCost(game, game.turn, kind);
    structStore(game, kind)[key(t.col, t.row)] = { owner: game.turn, hp: STRUCTS[kind].hp() };
    return kind;
  }
  function repairProblem(game, map, t) {
    const s = t && structAt(game, t.col, t.row);
    if (!s) return 'No hay nada que reparar.';
    if (s.owner !== game.turn) return 'No es tuya.';
    if (s.hp >= s.max) return 'Está entera.';
    if (game.players[game.turn].gold < ECON.repairCost) return `Te falta oro (cuesta ${ECON.repairCost}).`;
    return null;
  }
  function repair(game, map, t) {
    if (repairProblem(game, map, t)) return false;
    game.players[game.turn].gold -= ECON.repairCost;
    const s = structAt(game, t.col, t.row);
    structStore(game, s.kind)[s.key].hp = s.max;
    return true;
  }
  // Murallas y torres enemigas (sin nadie encima) a las que esta tropa puede golpear.
  function structTargets(game, unit) {
    if (has(unit, 'civil') || unit.acted || unit.aboard || unit.landed || (unit.moved && has(unit, 'pesada'))) return [];
    const out = [];
    for (const store of [game.walls || {}, game.towers || {}]) for (const k of Object.keys(store)) {
      if (store[k].owner === unit.owner) continue;
      const [c, r] = k.split(',').map(Number);
      if (M.distance(unit.col, unit.row, c, r) > UNITS[unit.type].range || unitAt(game, c, r)) continue;
      out.push(structAt(game, c, r));
    }
    return out;
  }
  // Daño a una muralla o torre: 3 por cada punto de ataque (las máquinas de guerra, el doble). Herido: 1 menos.
  function structDamage(unit) {
    const base = 3 * UNITS[unit.type].atk * (has(unit, 'derriba') ? 3 : UNITS[unit.type].cls === 'maquina' ? 2 : 1);
    return Math.max(1, base - (weak(unit) ? 1 : 0));
  }
  function hitStruct(game, map, unit, col, row) {
    if (unit.owner !== game.turn) return null;
    const s = structTargets(game, unit).find(x => x.col === col && x.row === row);
    if (!s) return null;
    const dealt = Math.min(s.hp, structDamage(unit)), store = structStore(game, s.kind);
    store[s.key].hp -= dealt;
    const destroyed = store[s.key].hp <= 0;
    if (destroyed) delete store[s.key];
    unit.acted = true;
    escapeAfterHit(unit);
    return { kind: s.kind, dealt, destroyed, owner: s.owner };
  }
  function wallBonus(game, u) {
    const w = game && game.walls && game.walls[key(u.col, u.row)];
    return w && w.owner === u.owner ? ECON.wallDefense : 0;
  }

  // --- Derribar lo tuyo y despedir tropas ----------------------------------------
  // what: 'edificio' (en tu territorio), 'muralla' o 'torre' (tuyas), 'camino' (en tu territorio). Cuesta oro.
  function demolishOptions(game, map, t) {
    if (!t) return [];
    const k = key(t.col, t.row), owner = ownerOfTile(game, t.col, t.row), mine = owner && owner.owner === game.turn, out = [];
    if (game.buildings[k] && mine) out.push({ what: 'edificio', label: BUILDINGS[game.buildings[k]].label });
    const st = structAt(game, t.col, t.row);
    if (st && st.owner === game.turn) out.push({ what: st.kind, label: STRUCTS[st.kind].label });
    if (game.roads[k] && mine) out.push({ what: 'camino', label: t.terrain === 'rio' ? 'Puente' : 'Camino' });
    return out;
  }
  function demolishProblem(game, map, t, what) {
    if (!demolishOptions(game, map, t).some(x => x.what === what)) return 'No hay nada tuyo que derribar.';
    const u = unitAt(game, t.col, t.row);
    if (u && u.owner !== game.turn) return 'Hay una tropa enemiga encima.';
    if (game.players[game.turn].gold < ECON.demolishCost) return `Te falta oro (cuesta ${ECON.demolishCost}).`;
    return null;
  }
  function demolish(game, map, t, what) {
    if (demolishProblem(game, map, t, what)) return null;
    const k = key(t.col, t.row);
    game.players[game.turn].gold -= ECON.demolishCost;
    if (what === 'edificio') delete game.buildings[k];
    else if (what === 'muralla') delete game.walls[k];
    else if (what === 'torre') delete game.towers[k];
    else if (what === 'camino') delete game.roads[k];
    return what;
  }
  function dismiss(game, map, u) {
    if (!u || u.owner !== game.turn) return null;
    if (isShip(u) && passengers(game, u).length) return null; // primero hay que bajar a los de a bordo
    game.units = game.units.filter(x => x !== u);
    return true;
  }

  // --- Lo que ve cada jugador (tropas, ciudades y torres) ------------------------
  function visibleTo(game, map, owner) {
    const out = new Set();
    const add = (col, row, d) => {
      for (const t of map.tiles) if (Math.abs(t.row - row) <= d && M.distance(t.col, t.row, col, row) <= d) out.add(key(t.col, t.row));
    };
    for (const u of game.units) if (u.owner === owner) add(u.col, u.row, visionOf(map, u));
    for (const c of game.cities) if (c.owner === owner) add(c.col, c.row, ECON.cityVision);
    for (const k of Object.keys(game.towers || {})) {
      if (game.towers[k].owner !== owner) continue;
      const [c, r] = k.split(',').map(Number); add(c, r, ECON.towerVision);
    }
    return out;
  }
  // Las casillas vistas alguna vez se quedan descubiertas (se ve el terreno, no lo que hay encima).
  function markExplored(game, map, owner, seen) {
    ensure(game);
    const old = game.explored[owner] || '';
    let s = old.length === map.tiles.length ? old.split('') : new Array(map.tiles.length).fill('0');
    let changed = old.length !== map.tiles.length;
    map.tiles.forEach((t, i) => { if (s[i] !== '1' && seen.has(key(t.col, t.row))) { s[i] = '1'; changed = true; } });
    if (changed) game.explored[owner] = s.join('');
  }
  function isExplored(game, owner, i) { const s = game.explored && game.explored[owner]; return !!(s && s[i] === '1'); }

  // --- Mercado: cambiar comida por oro (o al revés) ---------------------------------
  function tradeProblem(game, map, city, to) {
    if (city.owner !== game.turn) return 'No es tu ciudad.';
    if (!cityHas(game, map, city, 'mercado')) return 'Hace falta un mercado.';
    if ((city.trades || 0) >= ECON.trades) return `Ya has cambiado ${ECON.trades} veces este turno aquí.`;
    const p = game.players[game.turn];
    if (to === 'oro' && p.food < 2) return 'Te falta comida (2).';
    if (to === 'comida' && p.gold < 2) return 'Te falta oro (2).';
    if (to !== 'oro' && to !== 'comida') return 'No.';
    return null;
  }
  function trade(game, map, city, to) {
    if (tradeProblem(game, map, city, to)) return false;
    const p = game.players[game.turn];
    if (to === 'oro') { p.food -= 2; p.gold += 1; } else { p.gold -= 2; p.food += 1; }
    city.trades = (city.trades || 0) + 1;
    return true;
  }

  // --- Rutas de comercio ------------------------------------------------------------
  // Un mercader llega a otra ciudad (tuya o de otro) unida por camino a la suya y abre la ruta.
  // Cada ruta da oro a las dos ciudades cada turno; una tropa de un tercero sobre el camino la corta.
  function roadPath(game, map, a, b, allowed) {
    const start = key(a.col, a.row), goal = key(b.col, b.row);
    const prev = new Map([[start, null]]), queue = [{ col: a.col, row: a.row }];
    for (let qi = 0; qi < queue.length; qi++) {
      const cur = queue[qi], ck = key(cur.col, cur.row);
      if (ck === goal) {
        const path = [];
        for (let k = goal; k; k = prev.get(k)) { const [c, r] = k.split(',').map(Number); path.unshift({ col: c, row: r }); }
        return path;
      }
      for (const [c, r] of M.neighbors(cur.col, cur.row, map.cols, map.rows)) {
        const k = key(c, r);
        if (prev.has(k) || !hasRoad(game, c, r)) continue;
        const city = cityAt(game, c, r), u = unitAt(game, c, r);
        if (city && !allowed.includes(city.owner)) continue; // una ciudad de otro corta el camino
        if (u && !allowed.includes(u.owner)) continue;       // y una tropa de otro, también
        const w = game.walls && game.walls[k];
        if (w && !allowed.includes(w.owner)) continue;       // y una muralla de otro
        prev.set(k, ck); queue.push({ col: c, row: r });
      }
    }
    return null;
  }
  function routeCities(game, rt) { return [cityById(game, rt.a), cityById(game, rt.b)]; }
  function routePath(game, map, rt) {
    const [a, b] = routeCities(game, rt);
    if (!a || !b) return null;
    return roadPath(game, map, a, b, [a.owner, b.owner]) || (rt.sea ? seaPath(game, map, a, b, [a.owner, b.owner]) : null);
  }
  // Rutas marítimas: de un muelle o puerto de una ciudad a uno de la otra, por agua (costa, mar o río).
  // Un barco de un tercero en medio la corta.
  function seaPath(game, map, a, b, allowed) {
    const goals = new Set(cityDocks(game, map, b).map(t => key(t.col, t.row)));
    const starts = cityDocks(game, map, a);
    if (!goals.size || !starts.length) return null;
    const prev = new Map(), queue = [];
    starts.forEach(t => { prev.set(key(t.col, t.row), null); queue.push(t); });
    const isWater = (t) => t && (t.terrain === 'costa' || t.terrain === 'mar' || t.terrain === 'rio');
    for (let qi = 0; qi < queue.length; qi++) {
      const cur = queue[qi], ck = key(cur.col, cur.row);
      if (goals.has(ck)) {
        const path = [];
        for (let k = ck; k; k = prev.get(k)) { const [c, r] = k.split(',').map(Number); path.unshift({ col: c, row: r }); }
        return path;
      }
      for (const [c, r] of M.neighbors(cur.col, cur.row, map.cols, map.rows)) {
        const k = key(c, r), t = M.tileAt(map, c, r);
        if (prev.has(k) || !isWater(t)) continue;
        const u = unitAt(game, c, r);
        if (u && !allowed.includes(u.owner)) continue;
        prev.set(k, ck); queue.push(t);
      }
    }
    return null;
  }
  function routeGold(game, map, rt) {
    const [a, b] = routeCities(game, rt);
    if (!a || !b || !routePath(game, map, rt)) return 0;
    return M.distance(a.col, a.row, b.col, b.row) > ECON.routeFar ? ECON.routeFarGold : ECON.routeGold;
  }
  function routeProblem(game, map, u) {
    if (!u || !has(u, 'comerciante')) return 'Solo un mercader abre rutas.';
    if (u.owner !== game.turn) return 'No es tu turno.';
    if (u.acted) return 'Este mercader acaba de salir; podrá abrir la ruta en tu próximo turno.';
    const city = cityAt(game, u.col, u.row);
    if (!city) return 'Llévalo a otra ciudad (tuya o de otro jugador) unida por camino a la suya.';
    const from = cityById(game, u.from);
    if (!from || from.owner !== u.owner) return 'Su ciudad de origen ya no es tuya.';
    if (from === city) return 'Esta es su ciudad de origen: llévalo a otra.';
    if ((game.routes || []).some(rt => (rt.a === from.id && rt.b === city.id) || (rt.a === city.id && rt.b === from.id))) return 'Estas dos ciudades ya tienen una ruta.';
    if (!roadPath(game, map, from, city, [from.owner, city.owner])) {
      const sea = hasTech(game, u.owner, 'rutas');
      if (!sea) return 'Hace falta un camino que una esta ciudad con la suya (o, con Rutas marítimas, muelles unidos por agua).';
      if (!seaPath(game, map, from, city, [from.owner, city.owner])) return 'Hace falta un camino que una esta ciudad con la suya, o un muelle o puerto en cada una unidos por agua.';
    }
    return null;
  }
  function openRoute(game, map, u) {
    if (routeProblem(game, map, u)) return null;
    const city = cityAt(game, u.col, u.row), rt = { a: u.from, b: city.id };
    const from = cityById(game, u.from);
    if (!roadPath(game, map, from, city, [from.owner, city.owner])) rt.sea = true; // ruta por mar
    game.routes.push(rt);
    game.units = game.units.filter(x => x !== u);
    return rt;
  }

  // Precio de una tropa en comida. El colono se encarece con cada ciudad (aparte de la capital) y cada colono que ya tienes.
  function unitCost(game, owner, type) {
    let cost = UNITS[type].cost;
    if (type === 'colono') {
      const more = game.cities.filter(c => c.owner === owner && !c.capital).length + game.units.filter(u => u.owner === owner && u.type === 'colono').length;
      cost += ECON.settlerStep * more;
    }
    if (UNITS[type].sea && perk(game, owner, 'barcos')) cost = Math.max(1, cost - PERK_NUMBERS.discount); // Donosti
    return cost;
  }
  // ¿Puede esta ciudad reclutar esta tropa? null si sí, o el motivo.
  function recruitProblem(game, map, city, type) {
    if (city.owner !== game.turn) return 'No es tu ciudad.';
    const own = factionUnit(game, city.owner, type);
    if (own) return own;
    const need = UNITS[type].tech;
    if (need && !hasTech(game, city.owner, need)) return `Necesitas la tecnología ${TECHS[need].label}.`;
    const place = UNITS[type].needs;
    if (place && !cityHas(game, map, city, place)) return place === 'santuario' ? 'Solo se recluta en ciudades con Santuario de las leyendas.' : `Solo se recluta en ciudades con ${BUILDINGS[place].label.toLowerCase()}.`;
    if (UNITS[type].skills.includes('legendaria') && game.units.some(u => u.owner === city.owner && u.type === type))
      return `Ya tienes ${type === 'gigante' ? 'un gigante' : type === 'dragon' ? 'un dragón' : 'una lamia'}: solo puede haber una de cada criatura legendaria.`;
    if (UNITS[type].sea) {
      const docks = cityDocks(game, map, city, type);
      if (!docks.length) return UNITS[type].sea.includes('rio') ? 'Hace falta un muelle o un puerto en la costa o el río de esta ciudad.'
        : 'Hace falta un muelle o un puerto en la costa de esta ciudad (en el río no cabe).';
      if (!docks.some(t => !unitAt(game, t.col, t.row))) return 'El muelle está ocupado: mueve antes el barco que hay en él.';
    } else if (unitAt(game, city.col, city.row)) return 'Hay una tropa en la ciudad: muévela primero.';
    if (cityUnits(game, city).length >= cityCapacity(game, map, city)) return `Esta ciudad ya tiene ${cityCapacity(game, map, city)} tropas (súbela de nivel para tener más).`;
    const cost = unitCost(game, city.owner, type);
    if (game.players[game.turn].food < cost) return `Te falta comida (cuesta ${cost}).`;
    return null;
  }
  function recruit(game, map, city, type) {
    if (recruitProblem(game, map, city, type)) return null;
    game.players[game.turn].food -= unitCost(game, city.owner, type);
    const at = UNITS[type].sea ? cityDocks(game, map, city, type).find(t => !unitAt(game, t.col, t.row)) : city;
    const u = makeUnit(game, type, city.owner, at.col, at.row);
    u.home = city.id; u.moved = true; u.acted = true; // la tropa nueva espera al turno siguiente
    if (has(u, 'comerciante')) u.from = city.id;
    game.units.push(u);
    return u;
  }

  // Muelles y puertos de la ciudad donde puede salir este barco (en el río solo caben las barcas).
  function cityDocks(game, map, city, type) {
    return cityTiles(game, map, city).filter(t => {
      const b = game.buildings[key(t.col, t.row)];
      return b && BUILDINGS[b].dock && (!type || UNITS[type].sea.includes(t.terrain));
    });
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
    if (unit.moved || unit.charmed || (unit.acted && !has(unit, 'hostigador'))) return out;
    if (isShip(unit)) return shipReach(game, map, unit);
    // En un barco: solo puede bajar a una casilla de tierra de al lado.
    if (unit.aboard) {
      for (const [c, r] of M.neighbors(unit.col, unit.row, map.cols, map.rows)) {
        const t = M.tileAt(map, c, r);
        if (!t || !ground(t).walk || unitAt(game, c, r)) continue;
        const st = structAt(game, c, r);
        if (st && st.owner !== unit.owner) continue;
        out.set(key(c, r), { col: c, row: r, path: [{ col: c, row: r }], land: true });
      }
      return out;
    }
    const start = { col: unit.col, row: unit.row, left: UNITS[unit.type].move, path: [] };
    const best = new Map([[key(unit.col, unit.row), start.left]]);
    const queue = [start];
    while (queue.length) {
      queue.sort((a, b) => b.left - a.left);
      const cur = queue.shift();
      if (cur.left <= 0) continue;
      for (const [c, r] of M.neighbors(cur.col, cur.row, map.cols, map.rows)) {
        const t = M.tileAt(map, c, r);
        const other = t && unitAt(game, c, r);
        // Un barco tuyo con sitio: la tropa se sube (y ahí acaba su movimiento). Las legendarias no suben.
        if (other && other.owner === unit.owner && isShip(other) && shipRoom(game, other) > 0 && !has(unit, 'legendaria')) {
          const k = key(c, r);
          if (!out.has(k)) out.set(k, { col: c, row: r, path: cur.path.concat([{ col: c, row: r }]), embark: other.id });
          if (!walks(unit, t)) continue;
        }
        if (!walks(unit, t)) continue;
        if (other && other.owner !== unit.owner) continue;
        const st = structAt(game, c, r), fly = has(unit, 'vuela');
        if (st && st.owner !== unit.owner && !fly) continue; // por las murallas y torres del enemigo no se pasa (el dragón vuela por encima)
        // Por camino (de camino a camino) cuesta medio movimiento, y el camino no para la tropa.
        const road = hasRoad(game, c, r), onRoad = road && hasRoad(game, cur.col, cur.row);
        const stops = (stopsAt(unit, t, game) && !road) || enemyNear(game, unit.owner, c, r);
        const left = stops ? 0 : cur.left - (onRoad ? 0.5 : 1);
        const k = key(c, r);
        if (best.has(k) && best.get(k) >= left) continue;
        best.set(k, left);
        const path = cur.path.concat([{ col: c, row: r }]);
        if (!other && !(st && st.owner !== unit.owner)) out.set(k, { col: c, row: r, path });
        queue.push({ col: c, row: r, left, path });
      }
    }
    // Guardián de las cuevas: desde una montaña de tu territorio salta a cualquier otra montaña libre de tu territorio.
    if (has(unit, 'cuevas') && !unit.acted && mountainOfOwner(game, map, unit.col, unit.row, unit.owner)) {
      for (const t of map.tiles) {
        const k = key(t.col, t.row);
        if (out.has(k) || (t.col === unit.col && t.row === unit.row) || !mountainOfOwner(game, map, t.col, t.row, unit.owner)) continue;
        if (unitAt(game, t.col, t.row) || structAt(game, t.col, t.row)) continue;
        out.set(k, { col: t.col, row: t.row, path: [{ col: t.col, row: t.row }], cave: true });
      }
    }
    return out;
  }
  function mountainOfOwner(game, map, col, row, owner) {
    const t = M.tileAt(map, col, row), city = t && t.terrain === 'montana' && ownerOfTile(game, col, row);
    return !!city && city.owner === owner;
  }

  // Barcos: van por su tipo de agua, el terreno no los para; junto a un enemigo se paran.
  function shipReach(game, map, unit) {
    const out = new Map(), best = new Map([[key(unit.col, unit.row), UNITS[unit.type].move]]);
    const queue = [{ col: unit.col, row: unit.row, left: UNITS[unit.type].move, path: [] }];
    while (queue.length) {
      queue.sort((a, b) => b.left - a.left);
      const cur = queue.shift();
      if (cur.left <= 0) continue;
      for (const [c, r] of M.neighbors(cur.col, cur.row, map.cols, map.rows)) {
        const t = M.tileAt(map, c, r);
        if (!sails(unit, t)) continue;
        const other = unitAt(game, c, r);
        if (other && other.owner !== unit.owner) continue;
        const left = enemyNear(game, unit.owner, c, r) ? 0 : cur.left - 1, k = key(c, r);
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
  // Las ventajas de defensa no se suman: cuenta solo la mayor (terreno, fortificación o muralla).
  // Lo que resta (el río) sí se aplica siempre.
  function defenseBonus(map, u, game) {
    const parts = [
      { why: 'terreno', n: terrainDef(map, u, undefined, undefined, game) },
      { why: 'fortificación', n: fortBonus(game, u) },
      { why: 'muralla', n: wallBonus(game, u) },
    ];
    const best = parts.reduce((a, b) => (b.n > a.n ? b : a), { why: null, n: 0 });
    const minus = parts.filter(x => x.n < 0).reduce((a, x) => a + x.n, 0);
    // Baluarte (arcabucero): dentro de una ciudad tuya o sobre tu muralla, +2 que sí se suma.
    const c = game && cityAt(game, u.col, u.row);
    const bulwark = has(u, 'baluarte') && ((c && c.owner === u.owner) || wallBonus(game, u)) ? PERK_NUMBERS.bulwark : 0;
    return { n: best.n + minus + bulwark, why: best.why, best: best.n, minus, bulwark };
  }
  function defenseOf(map, u, game) { return Math.max(0, UNITS[u.type].def + defenseBonus(map, u, game).n); }
  function weak(u) { return u.hp * 2 < UNITS[u.type].hp; } // menos de la mitad de vida
  // Daño = 3 x ataque - defensa (con el terreno). Herido: 1 menos. Siempre al menos 1.
  function damage(game, map, att, def, attHp) {
    const hp = attHp === undefined ? att.hp : attHp;
    const hurt = hp * 2 < UNITS[att.type].hp ? 1 : 0;
    const anti = has(def, 'antiMontada') && UNITS[att.type].cls === 'montada' ? 2 : 0;
    const n = Math.max(1, 3 * UNITS[att.type].atk - defenseOf(map, def, game) - anti - hurt);
    return has(att, 'matadragones') && has(def, 'legendaria') ? 2 * n : n; // el cazador de dragones, doble a las legendarias
  }
  function inRange(att, def) { return M.distance(att.col, att.row, def.col, def.row) <= UNITS[att.type].range; }

  function targets(game, unit) {
    if (has(unit, 'civil') || unit.acted || unit.aboard || unit.landed || (unit.moved && has(unit, 'pesada'))) return [];
    return game.units.filter(u => u.owner !== unit.owner && !u.aboard && inRange(unit, u));
  }
  // Lo que pasaría si "att" ataca a "def", sin cambiar nada.
  function preview(game, map, att, def) {
    const dealt = damage(game, map, att, def);
    const defLeft = def.hp - dealt;
    let back = 0;
    if (defLeft > 0 && inRange(def, att) && !has(def, 'sinReplica') && !has(def, 'civil')) back = damage(game, map, def, att, defLeft);
    return { dealt: Math.min(dealt, def.hp), back: Math.min(back, att.hp), kills: defLeft <= 0, dies: back >= att.hp,
      burns: fireTargets(game, att, def).map(x => ({ id: x.id, dealt: Math.min(x.hp, fireDamage(game, map, att, x)) })),
      charms: has(att, 'encanta') && defLeft > 0,
      steals: has(att, 'roba') && game.players[def.owner] ? Math.max(0, Math.min(2, game.players[def.owner].gold)) : 0 };
  }
  // Fuego del dragón: los enemigos de las casillas que tocan a la vez al dragón y al objetivo.
  function fireTargets(game, att, def) {
    if (!has(att, 'fuego')) return [];
    return game.units.filter(u => u.owner !== att.owner && u !== def && !u.aboard
      && M.distance(u.col, u.row, att.col, att.row) === 1 && M.distance(u.col, u.row, def.col, def.row) === 1);
  }
  function fireDamage(game, map, att, u) { return Math.max(1, Math.floor(damage(game, map, att, u) / 2)); }

  // --- Acciones (cambian la partida) ---------------------------------------
  function move(game, map, unit, col, row) {
    const dest = reachable(game, map, unit).get(key(col, row));
    if (!dest || unit.owner !== game.turn) return null;
    unit.col = col; unit.row = row; unit.moved = true;
    if (dest.embark) unit.aboard = dest.embark;                // se sube al barco
    else if (unit.aboard) { delete unit.aboard; unit.landed = true; } // baja a tierra: este turno ya no ataca
    if (isShip(unit)) passengers(game, unit).forEach(p => { p.col = col; p.row = row; }); // los de a bordo van con él
    return dest.path;
  }
  // Hostigador (jinete): después de atacar puede moverse otra vez, aunque ya se hubiera movido (una vez por turno).
  function escapeAfterHit(u) {
    if (!has(u, 'hostigador')) u.moved = true;
    else if (u.moved && !u.escaped) { u.moved = false; u.escaped = true; }
  }
  function attack(game, map, att, def) {
    if (att.owner !== game.turn || !targets(game, att).includes(def)) return null;
    const r = preview(game, map, att, def);
    def.hp -= r.dealt; att.hp -= r.back;
    // El fuego quema a los de al lado (no devuelven el golpe). La lamia encanta al que sobrevive.
    r.burned = 0;
    for (const b of r.burns) { const x = unitById(game, b.id); x.hp -= b.dealt; if (x.hp <= 0) { r.burned++; att.kills++; } }
    if (r.charms) def.charmed = true;
    // Contrabandista: le roba oro al dueño de la tropa atacada.
    if (has(att, 'roba')) {
      const victim = game.players[def.owner], mine = game.players[att.owner];
      r.stole = Math.max(0, Math.min(2, victim.gold));
      victim.gold -= r.stole; mine.gold += r.stole;
    }
    att.acted = true;
    escapeAfterHit(att);
    if (r.kills) att.kills++;
    // Implacable (caballero): si mata, puede atacar otra vez este turno (una vez).
    if (r.kills && !r.dies && has(att, 'implacable') && !att.again) { att.acted = false; att.again = true; }
    if (r.dies) def.kills++;
    game.units = game.units.filter(u => u.hp > 0);
    // Si se hunde un barco, se hunden también las tropas que llevaba.
    const ids = new Set(game.units.map(u => u.id)), before = game.units.length;
    game.units = game.units.filter(u => !u.aboard || ids.has(u.aboard));
    r.drowned = before - game.units.length;
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
    game.units.forEach(u => { if (u.owner === game.turn) u.charmed = false; }); // el encantamiento dura un turno suyo
    let next = game.turn;
    do {
      next = (next + 1) % game.players.length;
      if (next === 0) game.round++;
    } while (!game.players[next].alive && next !== game.turn);
    game.turn = next;
    game.units.forEach(u => { if (u.owner === next) { u.moved = false; u.acted = false; u.again = false; u.landed = false; u.escaped = false; } });
    game.cities.forEach(c => { if (c.owner === next) c.trades = 0; });
    for (const c of game.cities) {
      const u = unitAt(game, c.col, c.row);
      if (!u || u.owner !== next || c.owner === next) continue;
      const from = c.owner;
      c.owner = next; c.capital = false;
      game.units.forEach(x => { if (x.home === c.id) x.home = null; }); // las tropas que salieron de allí ya no cuentan
      u.home = cityUnits(game, c).length < cityCapacity(game, map, c) ? c.id : u.home;
      game.events.push({ kind: 'conquista', city: c.id, from, to: next });
      game.routes = game.routes.filter(rt => rt.a !== c.id && rt.b !== c.id); // sus rutas de comercio se pierden
    }
    // Templo: tus tropas heridas en su territorio se curan un poco solas.
    let healed = 0;
    for (const c of game.cities) {
      if (c.owner !== next || !cityHas(game, map, c, 'templo')) continue;
      for (const u of game.units) {
        if (u.owner !== next || game.territory[key(u.col, u.row)] !== c.id || u.hp >= UNITS[u.type].hp) continue;
        u.hp = Math.min(UNITS[u.type].hp, u.hp + ECON.templeHeal); healed++;
      }
    }
    if (healed) game.events.push({ kind: 'templo', n: healed });
    checkWinner(game);
    if (game.winner !== null || game.round === 1) return; // en la primera ronda nadie cobra (así es justo para todos)
    const inc = playerIncome(game, map, next), p = game.players[next];
    p.gold += inc.oro; p.food += inc.comida;
    game.events.push({ kind: 'cobro', oro: inc.oro, comida: inc.comida });
  }
  function canDoSomething(game, map, u) {
    return reachable(game, map, u).size > 0 || targets(game, u).length > 0 || structTargets(game, u).length > 0 || !healProblem(game, map, u) || !blessProblem(game, map, u)
      || (has(u, 'comerciante') && !routeProblem(game, map, u))
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
    const list = techsOfBranch(t.branch), prev = list[list.indexOf(id) - 1];
    if (prev && !hasTech(game, owner, prev)) return `Antes necesitas ${TECHS[prev].label}.`;
    for (const k of t.after || []) if (!hasTech(game, owner, k)) return `Antes necesitas ${TECHS[k].label} (rama ${branchLabel(k)}).`;
    if (t.level > 1 && !game.cities.some(c => c.owner === owner && cityLevel(game, null, c) >= t.level)) return `Necesitas una ciudad de nivel ${t.level}.`;
    if (owner !== game.turn) return 'No es tu turno.';
    if (game.players[owner].gold < techCost(game, owner, id)) return `Te falta oro (cuesta ${techCost(game, owner, id)}).`;
    return null;
  }
  // Explicación completa de una tecnología: lo que pide, las tropas y edificios que da (con sus cifras) y lo demás.
  // faction: si se da, solo salen las tropas propias de esa facción (las de otras no).
  function techDetails(id, faction) {
    const t = TECHS[id], out = { needs: [], units: [], buildings: [], text: t.text };
    const list = techsOfBranch(t.branch), prev = list[list.indexOf(id) - 1];
    if (prev) out.needs.push(`${TECHS[prev].label} (la anterior de la rama)`);
    for (const k of t.after || []) out.needs.push(`${TECHS[k].label} (rama ${branchLabel(k)})`);
    if (t.level > 1) out.needs.push(`una ciudad de nivel ${t.level}`);
    for (const k of Object.keys(UNITS)) {
      const u = UNITS[k];
      if (u.tech !== id) continue;
      if (u.faction !== undefined && faction !== undefined && u.faction !== faction) continue;
      let d = `${u.label}${u.faction !== undefined ? ` (solo ${FACTIONS[u.faction].name})` : ''}: ${u.cost} comida · vida ${u.hp} · ataque ${u.atk} · defensa ${u.def} · mueve ${u.move}` + (u.range > 1 ? ` · alcance ${u.range}` : '');
      if (u.carry) d += ` · lleva ${u.carry} tropas`;
      if (u.sea) d += ` · navega por ${u.sea.map(x => (M.TERRAIN[x] || { label: x }).label.toLowerCase()).join(' y ')}`;
      if (u.needs) d += ` · se recluta en ciudades con ${BUILDINGS[u.needs].label.toLowerCase()}`;
      const sk = u.skills.filter(x => !['barco'].includes(x)).map(x => `${SKILLS[x].label.toLowerCase()} (${SKILLS[x].text})`);
      if (sk.length) d += ` · ${sk.join(', ')}`;
      out.units.push(d);
    }
    for (const k of Object.keys(BUILDINGS)) {
      const b = BUILDINGS[k];
      if (b.tech !== id) continue;
      let where = b.big ? `en una llanura vacía de tu territorio${b.many ? '' : ', uno por ciudad'}` : b.resource ? `donde haya ${(M.RESOURCE[b.resource] || { label: b.resource }).label.toLowerCase()}` : b.terrains ? 'en cualquier casilla de costa o río de tu territorio' : '';
      if (b.big) {
        const n = b.nearNeeded === undefined ? 2 : b.nearNeeded;
        if (n) where += `, con al menos ${n} edificio${n > 1 ? 's' : ''} al lado` + (b.near ? ` (${b.near.map(x => BUILDINGS[x].label.toLowerCase()).join(', ')})` : '');
        if (b.minLevel) where += `, en ciudades de nivel ${b.minLevel} o más`;
      }
      const gives = Object.keys(b.gives).length ? givesText(b.gives) + ' por turno' : '';
      out.buildings.push(`${b.label}: ${b.cost} oro · ${where}` + (gives ? ` · ${gives}` : '') + (b.extra ? ` · ${b.extra}` : ''));
    }
    return out;
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
    ensure(game);
    const u = o.u !== undefined ? unitById(game, o.u) : null;
    const city = o.city !== undefined ? cityById(game, o.city) : null;
    const t = o.col !== undefined ? M.tileAt(map, o.col, o.row) : null;
    switch (o.a) {
      case 'move': return u && move(game, map, u, o.col, o.row);
      case 'attack': { const d = unitById(game, o.t); return u && d && attack(game, map, u, d); }
      case 'found': return u && found(game, map, u);
      case 'build': return t && build(game, map, t, o.type);
      case 'muro': return t && buildStruct(game, map, t, 'muralla');
      case 'torre': return t && buildStruct(game, map, t, 'torre');
      case 'reparar': return t && repair(game, map, t);
      case 'golpe': return u && hitStruct(game, map, u, o.col, o.row);
      case 'cambiar': return city && trade(game, map, city, o.to);
      case 'ruta': return u && openRoute(game, map, u);
      case 'derribar': return t && demolish(game, map, t, o.what);
      case 'despedir': return u && dismiss(game, map, u);
      case 'road': return t && buildRoad(game, map, t);
      case 'talar': return t && fell(game, map, t);
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

  // Al cargar una partida guardada: quita del mapa los recursos que se perdieron al fundar ciudades
  // y convierte en llanura los bosques talados.
  function applyCleared(game, map) {
    ensure(game);
    for (const k of Object.keys(game.cleared || {})) { const [c, r] = k.split(',').map(Number); const t = M.tileAt(map, c, r); if (t) t.resource = null; }
    for (const k of Object.keys(game.felled || {})) { const [c, r] = k.split(',').map(Number); const t = M.tileAt(map, c, r); if (t) cutDown(t); }
  }
  function cutDown(t) { if (t.terrain === 'bosque') { t.terrain = 'llanura'; t.resource = null; t.wasForest = true; } }

  // --- Tala: un bosque de tu territorio se convierte en llanura ---------------------
  function canOfferFell(game, map, t) {
    const owner = t && ownerOfTile(game, t.col, t.row);
    const forest = t && (t.terrain === 'bosque' || (t.wasForest && !(game.felled || {})[key(t.col, t.row)])); // (en una repetición el mapa ya está talado)
    return !!forest && !!owner && owner.owner === game.turn && !cityAt(game, t.col, t.row);
  }
  function fellProblem(game, map, t) {
    if (!canOfferFell(game, map, t)) return 'Solo se talan bosques de tu territorio.';
    if (!hasTech(game, game.turn, 'tala')) return 'Necesitas la tecnología Tala (rama Monte).';
    if (game.buildings[key(t.col, t.row)]) return 'Hay un edificio: derríbalo antes.';
    const u = unitAt(game, t.col, t.row);
    if (u && u.owner !== game.turn) return 'Hay una tropa enemiga encima.';
    if (game.players[game.turn].gold < ECON.fellCost) return `Te falta oro (talar cuesta ${ECON.fellCost}).`;
    return null;
  }
  function fell(game, map, t) {
    if (fellProblem(game, map, t)) return null;
    game.players[game.turn].gold -= ECON.fellCost;
    game.felled = game.felled || {};
    game.felled[key(t.col, t.row)] = true;
    cutDown(t);
    return true;
  }
  const api = { levelFood, canOfferFell, fellProblem, fell, roadCost, fortCost, structCost, FACTIONS, PERK_NUMBERS, perk, factionUnit, techDetails, TECHS, BRANCHES, hasTech, techCost, techProblem, research, techsOfBranch, branchLabel,
    blessTargets, blessProblem, bless, levelNeedsFor, applyCleared, perform, unitById, UNITS, SKILLS, CLASSES, TECH_TERRAIN, ARMIES, GROUND, ECON, BUILDINGS, RECRUITABLE, has, visionOf, newGame, unitAt, reachable, targets, preview, move, attack,
    endTurn, defenseOf, terrainDef, weak, canDoSomething, key,
    cityAt, cityById, ownerOfTile, cityTiles, cityLevel, cityIncome, playerIncome, cityUnits, cityCapacity,
    foundProblem, found, buildOption, build, buildingFor, recruitProblem, recruit, healProblem, healAmount, heal,
    givesText, buildingGives, levelUpProblem, levelUp, expandProblem, expand, expandTiles, fortProblem, fortify, fortBonus,
    hasRoad, roadProblem, canOfferRoad, buildRoad, connectedCities,
    ensure, BIG, STRUCTS, bigOptions, bigNeighbors, cityHas, buildCost, structAt, structProblem, canOfferStruct, buildStruct,
    repairProblem, repair, structTargets, structDamage, hitStruct, wallBonus, visibleTo, markExplored, isExplored,
    defenseBonus, demolishOptions, demolishProblem, demolish, dismiss,
    tradeProblem, trade, routePath, routeGold, routeProblem, openRoute, routeCities,
    unitCost, isShip, sails, walks, fireTargets, passengers, shipRoom, shipOf, cityDocks, seaPath };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PERules = api;
})(this);
