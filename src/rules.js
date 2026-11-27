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
  };
  // Visión: todas ven 1 casilla alrededor; 2 si son exploradoras o están en una montaña.
  // Defensa extra según el terreno, por clase de tropa. El río resta a todos.
  const CLASSES = {
    infanteria: { label: 'Infantería', terrain: { bosque: 1, montana: 2, rio: -1 } },
    tirador:    { label: 'Tirador', terrain: { bosque: 2, montana: 1, rio: -1 } },
    montada:    { label: 'Montada', terrain: { rio: -1 } }, // a caballo no se esconde en bosque ni montaña
  };
  // Tecnologías que más adelante darán defensa en un terreno: { tecnologia: { clase|'todas': { terreno: +n } } }
  const TECH_TERRAIN = {};

  // --- Tropas (cifras del documento de diseño) ----------------------------
  const UNITS = {
    miliciano: { label: 'Miliciano', hp: 10, atk: 2, def: 2, move: 1, range: 1, cost: 2, cls: 'infanteria', skills: [] },
    arquero:   { label: 'Arquero',   hp: 10, atk: 2, def: 1, move: 1, range: 2, cost: 3, cls: 'tirador', skills: ['distancia'] },
    jinete:    { label: 'Jinete',    hp: 10, atk: 2, def: 1, move: 2, range: 1, cost: 4, cls: 'montada', skills: ['hostigador', 'explorador'] },
  };
  const ARMIES = { real: ['miliciano'], prueba: ['miliciano', 'arquero', 'jinete'] };
  const has = (u, skill) => UNITS[u.type].skills.includes(skill);

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
  function newGame(opts) {
    const map = opts.map, players = opts.players || [0, 1], army = ARMIES[opts.army] || ARMIES.real;
    const anchors = opts.close ? closeAnchors(map, players.length) : map.starts.slice(0, players.length);
    const game = { players: players.map(f => ({ faction: f, alive: true, techs: [] })), turn: 0, round: 1,
      units: [], nextId: 1, winner: null, log: [] };
    const taken = new Set();
    anchors.forEach((a, p) => {
      const spots = landAround(map, a, army.length, taken);
      army.forEach((type, k) => {
        const s = spots[k];
        if (!s) return;
        taken.add(key(s.col, s.row));
        game.units.push(makeUnit(game, type, p, s.col, s.row));
      });
    });
    return game;
  }
  function makeUnit(game, type, owner, col, row) {
    return { id: game.nextId++, type, owner, col, row, hp: UNITS[type].hp, moved: false, acted: false, kills: 0 };
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
        const stops = ground(t).stop || enemyNear(game, unit.owner, c, r);
        const left = stops ? 0 : cur.left - 1;
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
  function defenseOf(map, u, game) { return Math.max(0, UNITS[u.type].def + terrainDef(map, u, undefined, undefined, game)); }
  function weak(u) { return u.hp * 2 < UNITS[u.type].hp; } // menos de la mitad de vida
  // Daño = 3 x ataque - defensa (con el terreno). Herido: 1 menos. Siempre al menos 1.
  function damage(game, map, att, def, attHp) {
    const hp = attHp === undefined ? att.hp : attHp;
    const hurt = hp * 2 < UNITS[att.type].hp ? 1 : 0;
    return Math.max(1, 3 * UNITS[att.type].atk - defenseOf(map, def, game) - hurt);
  }
  function inRange(att, def) { return M.distance(att.col, att.row, def.col, def.row) <= UNITS[att.type].range; }

  function targets(game, unit) {
    if (unit.acted || (unit.moved && has(unit, 'pesada'))) return [];
    return game.units.filter(u => u.owner !== unit.owner && inRange(unit, u));
  }
  // Lo que pasaría si "att" ataca a "def", sin cambiar nada.
  function preview(game, map, att, def) {
    const dealt = damage(game, map, att, def);
    const defLeft = def.hp - dealt;
    let back = 0;
    if (defLeft > 0 && inRange(def, att) && !has(def, 'sinReplica')) back = damage(game, map, def, att, defLeft);
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
    if (r.dies) def.kills++;
    game.units = game.units.filter(u => u.hp > 0);
    checkWinner(game);
    return r;
  }
  function checkWinner(game) {
    game.players.forEach((p, i) => { p.alive = game.units.some(u => u.owner === i); });
    const alive = game.players.map((p, i) => (p.alive ? i : -1)).filter(i => i >= 0);
    if (alive.length === 1) game.winner = alive[0];
    else if (alive.length === 0) game.winner = -1;
  }
  function endTurn(game) {
    if (game.winner !== null) return;
    let next = game.turn;
    do {
      next = (next + 1) % game.players.length;
      if (next === 0) game.round++;
    } while (!game.players[next].alive && next !== game.turn);
    game.turn = next;
    game.units.forEach(u => { if (u.owner === next) { u.moved = false; u.acted = false; } });
  }
  function canDoSomething(game, map, u) {
    return reachable(game, map, u).size > 0 || targets(game, u).length > 0;
  }

  const api = { UNITS, SKILLS, CLASSES, TECH_TERRAIN, ARMIES, GROUND, has, visionOf, newGame, unitAt, reachable, targets, preview, move, attack,
    endTurn, defenseOf, terrainDef, weak, canDoSomething, key };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PERules = api;
})(this);
