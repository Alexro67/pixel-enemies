// Pixel Enemies - partidas online con amigos (cada uno juega su turno cuando puede).
// Usa Firebase (plan gratis) sin librerías: se habla con él directamente por internet.
//  - Cada móvil tiene un jugador anónimo (sin contraseña) y un apodo.
//  - Cada partida es un documento "partidas/CÓDIGO" con la partida entera.
//  - Cada turno jugado se guarda en "partidas/CÓDIGO/turnos/N" con sus órdenes,
//    así los demás lo ven repetirse en su móvil.
(function () {
  'use strict';
  const CFG = window.PE_FIREBASE || null;
  // Para probar en el ordenador con el "emulador" de Firebase: CFG.emulator = 'http://localhost'.
  const ID_URL = () => (CFG.emulator ? CFG.emulator + ':9099/' : 'https://') + 'identitytoolkit.googleapis.com/v1';
  const TOKEN_URL = () => (CFG.emulator ? CFG.emulator + ':9099/' : 'https://') + 'securetoken.googleapis.com/v1';
  const FS_URL = () => (CFG.emulator ? CFG.emulator + ':8080' : 'https://firestore.googleapis.com') + '/v1';
  const M = window.PEMap, R = window.PERules;
  const F = () => window.PEFactions, G = () => window.PEGame, UI = () => window.PEUI;
  const LIMITS = [[0, 'Sin límite'], [1, '1 hora'], [8, '8 horas'], [24, '24 horas'], [72, '3 días'], [168, '7 días']];
  const DEFAULT_LIMIT = 24;
  const POLL_MS = CFG && CFG.demo ? 4000 : 15000;
  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin O/0 ni I/1, que se confunden

  // --- Guardado en el móvil --------------------------------------------------
  const local = {
    get(k, d) { try { const v = localStorage.getItem('pe.net.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('pe.net.' + k, JSON.stringify(v)); } catch (e) { /* sin guardado */ } },
    del(k) { try { localStorage.removeItem('pe.net.' + k); } catch (e) { /* nada */ } },
  };

  // --- Jugador anónimo -------------------------------------------------------
  let auth = local.get('auth', null); // { uid, refresh, token, exp }
  async function token() {
    if (auth && auth.token && auth.exp > Date.now() + 60000) return auth.token;
    let r;
    if (auth && auth.refresh) {
      r = await fetch(`${TOKEN_URL()}/token?key=${CFG.apiKey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(auth.refresh) });
      if (r.ok) {
        const j = await r.json();
        auth = { uid: j.user_id, refresh: j.refresh_token, token: j.id_token, exp: Date.now() + j.expires_in * 1000 };
        local.set('auth', auth);
        return auth.token;
      }
    }
    r = await fetch(`${ID_URL()}/accounts:signUp?key=${CFG.apiKey}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }) });
    if (!r.ok) throw new Error('No se pudo entrar en el servidor.');
    const j = await r.json();
    auth = { uid: j.localId, refresh: j.refreshToken, token: j.idToken, exp: Date.now() + j.expiresIn * 1000 };
    local.set('auth', auth);
    return auth.token;
  }
  const myUid = () => auth && auth.uid;

  // --- Base de datos (Firestore por internet) ------------------------------
  const DB = () => `projects/${CFG.projectId}/databases/(default)/documents`;
  const URL_ = () => `${FS_URL()}/${DB()}`;
  function enc(v) {
    if (v === null || v === undefined) return { nullValue: null };
    if (typeof v === 'boolean') return { booleanValue: v };
    if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    if (typeof v === 'string') return { stringValue: v };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
    return { mapValue: { fields: encFields(v) } };
  }
  function encFields(o) { const f = {}; for (const [k, v] of Object.entries(o)) f[k] = enc(v); return f; }
  function dec(v) {
    if ('nullValue' in v) return null;
    if ('booleanValue' in v) return v.booleanValue;
    if ('integerValue' in v) return Number(v.integerValue);
    if ('doubleValue' in v) return v.doubleValue;
    if ('stringValue' in v) return v.stringValue;
    if ('timestampValue' in v) return Date.parse(v.timestampValue);
    if ('arrayValue' in v) return (v.arrayValue.values || []).map(dec);
    if ('mapValue' in v) return decFields(v.mapValue.fields || {});
    return null;
  }
  function decFields(f) { const o = {}; for (const [k, v] of Object.entries(f || {})) o[k] = dec(v); return o; }
  function decDoc(d) { const o = decFields(d.fields); o._time = d.updateTime; o._name = d.name; return o; }
  async function api(method, path, body) {
    const r = await fetch(path.startsWith('http') ? path : URL_() + path, {
      method, headers: { Authorization: 'Bearer ' + await token(), 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined });
    if (r.status === 404) return null;
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error((j.error && j.error.message) || 'Error del servidor'); e.status = r.status; e.code = j.error && j.error.status; throw e; }
    return j;
  }
  async function getGame(code) { const d = await api('GET', `/partidas/${code}`); return d && decDoc(d); }
  // Escribe varias cosas a la vez; si "time" no coincide (alguien la cambió antes), falla todo.
  function commit(writes) { return api('POST', `${URL_()}:commit`, { writes }); }
  const docName = (path) => `${DB()}/${path}`;
  function upd(path, data, time) {
    const w = { update: { name: docName(path), fields: encFields(data) }, updateMask: { fieldPaths: Object.keys(data) } };
    if (time) w.currentDocument = { updateTime: time };
    return w;
  }
  function create(path, data) { return { update: { name: docName(path), fields: encFields(data) }, currentDocument: { exists: false } }; }
  async function query(parent, collection, where, orderBy) {
    const q = { from: [{ collectionId: collection }], where: { fieldFilter: { field: { fieldPath: where[0] }, op: where[1], value: enc(where[2]) } } };
    if (orderBy) q.orderBy = [{ field: { fieldPath: orderBy }, direction: 'ASCENDING' }];
    const res = await api('POST', `${URL_()}${parent}:runQuery`, { structuredQuery: q });
    return (res || []).filter(x => x.document).map(x => decDoc(x.document));
  }
  const pad = (n) => String(n).padStart(6, '0');

  // --- Pantallas ------------------------------------------------------------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  let net = { code: null, doc: null, timer: null, busy: false };
  function panel(html) {
    const p = $('net');
    p.innerHTML = `<div id="net-box">${html}</div>`;
    p.hidden = false;
  }
  function hidePanel() { $('net').hidden = true; }
  function toast(text) {
    const t = $('net-toast');
    t.textContent = text; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 3500);
  }
  function fail(e) { console.error(e); toast(e.status === 403 ? 'El servidor no deja hacer eso.' : (e.message || 'Algo ha fallado. Prueba otra vez.')); }
  function stopPolling() { clearInterval(net.timer); net.timer = null; }
  const shareUrl = (code) => `${location.origin}${location.pathname}?partida=${code}`;
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const limitText = (h) => (LIMITS.find(l => l[0] === h) || [0, h + ' horas'])[1];
  function timeLeft(doc) {
    if (!doc.settings.limit) return '';
    const ms = doc.turnStart + doc.settings.limit * 3600000 - Date.now();
    if (ms <= 0) return 'se le ha acabado el tiempo';
    const h = Math.floor(ms / 3600000), m = Math.ceil((ms % 3600000) / 60000);
    return h >= 24 ? `le quedan ${Math.floor(h / 24)} d ${h % 24} h` : h ? `le quedan ${h} h ${m} min` : `le quedan ${m} min`;
  }

  // Pedir el apodo (la primera vez) y luego seguir.
  function withName(then) {
    const name = local.get('name', '');
    if (name) return then(name);
    panel(`<h2>Tu apodo</h2><p>Es el nombre que verán tus amigos. Se queda guardado en este móvil.</p>
      <input id="net-name" maxlength="12" autocomplete="off" placeholder="Apodo">
      <div class="row"><button id="net-back">Volver</button><button id="net-ok" class="main">Guardar</button></div>`);
    $('net-name').focus();
    $('net-back').onclick = closeToLocal;
    $('net-ok').onclick = () => {
      const v = $('net-name').value.trim().slice(0, 12);
      if (!v) { toast('Escribe un apodo.'); return; }
      local.set('name', v); then(v);
    };
  }

  // Lista de mis partidas.
  async function showList() {
    stopPolling(); net.code = null; net.doc = null;
    document.body.classList.remove('online-game');
    if (!CFG) {
      panel(`<h2>Jugar online</h2><p>Las partidas online aún no están listas: falta conectar el servidor.</p>
        <div class="row"><button id="net-back">Volver</button></div>`);
      $('net-back').onclick = closeToLocal; return;
    }
    withName(async (name) => {
      panel(`<h2>Partidas online</h2><p class="small">Juegas como <b>${esc(name)}</b> · <a href="#" id="net-rename">cambiar</a></p>
        <div class="row"><button id="net-create" class="main">Crear partida</button><button id="net-join">Unirme con código</button></div>
        <div id="net-list"><p class="small">Cargando tus partidas...</p></div>
        <div id="net-push"></div>
        <div class="row"><button id="net-back">Jugar en un solo móvil</button></div>`);
      $('net-rename').onclick = (e) => { e.preventDefault(); local.del('name'); showList(); };
      $('net-create').onclick = showCreate;
      $('net-join').onclick = showJoin;
      $('net-back').onclick = closeToLocal;
      pushButton();
      try {
        await token();
        const games = (await query('', 'partidas', ['uids', 'ARRAY_CONTAINS', myUid()]))
          .sort((a, b) => (b.turnStart || b.created) - (a.turnStart || a.created));
        const box = $('net-list');
        if (!box) return;
        if (!games.length) { box.innerHTML = '<p class="small">Aún no tienes partidas. Crea una o únete a la de un amigo.</p>'; return; }
        box.innerHTML = games.map(g => {
          const me = g.seats.findIndex(s => s.uid === myUid());
          let st;
          if (g.status === 'sala') st = `En la sala (${g.seats.length} jugadores)`;
          else if (g.status === 'fin') st = 'Terminada';
          else {
            const turn = JSON.parse(g.game).turn;
            st = turn === me ? '<b class="yours">¡Te toca!</b>' : `Turno de ${esc(g.seats[turn].name)}`;
          }
          const f = g.seats[me] ? g.seats[me].faction : 0;
          return `<button class="game" data-code="${g.code}"><span class="dot" style="background:${F().colors[f]}"></span>
            <span><b>${g.code}</b> · ${g.seats.map(s => esc(s.name)).join(', ')}<br><span class="small">${st}</span></span></button>`;
        }).join('');
        box.querySelectorAll('button.game').forEach(b => { b.onclick = () => openGame(b.dataset.code); });
      } catch (e) { const box = $('net-list'); if (box) box.innerHTML = `<p class="small">No se pudo cargar: ${esc(e.message)}</p>`; }
    });
  }
  function closeToLocal() {
    stopPolling(); hidePanel();
    net.code = null;
    document.body.classList.remove('online-game');
    try { history.replaceState(null, '', location.pathname); } catch (e) { /* nada */ }
    G().startLocal();
  }

  function showJoin(prefill) {
    panel(`<h2>Unirme a una partida</h2><p>Escribe el código que te ha pasado tu amigo.</p>
      <input id="net-code" maxlength="5" autocomplete="off" placeholder="KX7PD" value="${esc(typeof prefill === 'string' ? prefill : '')}">
      <div class="row"><button id="net-back">Volver</button><button id="net-ok" class="main">Unirme</button></div>`);
    $('net-code').focus();
    $('net-back').onclick = showList;
    $('net-ok').onclick = () => join($('net-code').value.trim().toUpperCase());
  }

  function showCreate() {
    const opt = (obj) => Object.entries(obj).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
    panel(`<h2>Crear partida</h2>
      <label>Tamaño del mapa<select id="net-size">${opt(M.SIZES)}</select></label>
      <label>Tipo de mapa<select id="net-type">${opt(M.MAP_TYPES)}</select></label>
      <label>Recursos<select id="net-ab">${opt(M.ABUNDANCE)}</select></label>
      <label>Tiempo para cada turno<select id="net-limit">${LIMITS.map(([h, t]) => `<option value="${h}"${h === DEFAULT_LIMIT ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
      <p class="small">Si a alguien se le acaba el tiempo, su turno se pasa solo.</p>
      <div class="row"><button id="net-back">Volver</button><button id="net-ok" class="main">Crear</button></div>`);
    $('net-size').value = 'mediano';
    $('net-back').onclick = showList;
    $('net-ok').onclick = async () => {
      if (net.busy) return; net.busy = true;
      try {
        await token();
        for (let tries = 0; tries < 5; tries++) {
          const code = Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
          const doc = { code, status: 'sala', host: myUid(), created: Date.now(), uids: [myUid()],
            seats: [{ uid: myUid(), name: local.get('name', '?'), faction: 0 }],
            settings: { size: $('net-size').value, type: $('net-type').value, abundance: $('net-ab').value, limit: Number($('net-limit').value), gen: M.GEN },
            seed: '', game: '', n: 0, turnStart: 0, turnUid: '' };
          try { await commit([create(`partidas/${code}`, doc)]); net.busy = false; return openGame(code); }
          catch (e) { if (e.code !== 'ALREADY_EXISTS') throw e; }
        }
      } catch (e) { fail(e); }
      net.busy = false;
    };
  }

  async function join(code) {
    if (!/^[A-Z0-9]{5}$/.test(code)) { toast('El código tiene 5 letras o números.'); return; }
    if (net.busy) return; net.busy = true;
    try {
      const doc = await getGame(code);
      if (!doc) { toast('No hay ninguna partida con ese código.'); net.busy = false; return; }
      if (!doc.uids.includes(myUid())) {
        if (doc.status !== 'sala') { toast('Esa partida ya ha empezado.'); net.busy = false; return; }
        if (doc.seats.length >= 6) { toast('Esa partida ya está llena (6 jugadores).'); net.busy = false; return; }
        const used = doc.seats.map(s => s.faction);
        const faction = [0, 1, 2, 3, 4, 5].find(f => !used.includes(f));
        await commit([upd(`partidas/${code}`, { uids: doc.uids.concat(myUid()),
          seats: doc.seats.concat({ uid: myUid(), name: local.get('name', '?'), faction }) }, doc._time)]);
      }
      net.busy = false;
      openGame(code);
    } catch (e) { net.busy = false; fail(e); }
  }

  // Abre una partida: la sala de espera, o el mapa.
  async function openGame(code) {
    stopPolling();
    net.code = code;
    try { history.replaceState(null, '', `?partida=${code}`); } catch (e) { /* nada */ }
    try {
      const doc = await getGame(code);
      if (!doc) { toast('Esa partida ya no existe.'); return showList(); }
      if (!doc.uids.includes(myUid())) {
        if (doc.status === 'sala') return withName(() => join(code));
        toast('No estás en esa partida.'); return showList();
      }
      net.doc = doc;
      if (doc.status === 'sala') { showRoom(doc); net.timer = setInterval(refreshRoom, 4000); return; }
      await showMap(doc, true);
      net.timer = setInterval(poll, POLL_MS);
    } catch (e) { fail(e); showList(); }
  }

  // --- Sala de espera --------------------------------------------------------
  // La sala se dibuja una vez; luego, cada pocos segundos, solo se actualiza la lista de jugadores.
  function showRoom(doc) {
    const s = doc.settings;
    panel(`<h2>Sala de espera</h2>
      <p>Código de la partida</p><div class="code">${doc.code}</div>
      <div class="row"><button id="net-invite" class="main">Invitar amigos</button></div>
      <p class="small">Mapa ${M.SIZES[s.size].label.toLowerCase()} · ${M.MAP_TYPES[s.type].label} · ${M.ABUNDANCE[s.abundance].label} · Turnos de ${limitText(s.limit)}</p>
      <ul class="seats" id="net-seats"></ul>
      <label>Tu facción<select id="net-faction"></select></label>
      <div id="net-finfo"></div>
      <p class="small" id="net-wait"></p>
      <div class="row"><button id="net-back">Mis partidas</button><button id="net-start" class="main" hidden>Empezar</button></div>`);
    $('net-invite').onclick = () => invite(doc.code);
    $('net-back').onclick = showList;
    $('net-faction').onchange = async (e) => {
      const f = Number(e.target.value);
      e.target.blur();
      try {
        const d = await getGame(doc.code);
        if (d.seats.some(x => x.faction === f && x.uid !== myUid())) { toast('Esa facción ya la ha cogido otro.'); return refreshRoom(true); }
        await commit([upd(`partidas/${doc.code}`, { seats: d.seats.map(x => (x.uid === myUid() ? Object.assign({}, x, { faction: f }) : x)) }, d._time)]);
      } catch (er) { fail(er); }
      refreshRoom(true);
    };
    $('net-start').onclick = () => startMatch(doc.code);
    updateRoom(doc);
  }
  function updateRoom(doc) {
    if (!$('net-seats')) return;
    const meIdx = doc.seats.findIndex(s => s.uid === myUid()), host = doc.host === myUid();
    const used = doc.seats.map(s => s.faction), mine = doc.seats[meIdx].faction;
    $('net-seats').innerHTML = doc.seats.map(s => `<li><span class="dot" style="background:${F().colors[s.faction]}"></span>
      <b>${esc(s.name)}</b> · ${F().names[s.faction]}${s.uid === doc.host ? ' (crea la partida)' : ''}</li>`).join('');
    const sel = $('net-faction');
    if ($('net-finfo') && $('net-finfo').dataset.f !== String(mine) && F().card) { $('net-finfo').innerHTML = F().card(mine); $('net-finfo').dataset.f = String(mine); }
    if (document.activeElement !== sel) {
      sel.innerHTML = F().names.map((n, f) => `<option value="${f}"${f === mine ? ' selected' : ''}${used.includes(f) && f !== mine ? ' disabled' : ''}>${n}</option>`).join('');
    }
    const hostName = (doc.seats.find(x => x.uid === doc.host) || { name: '?' }).name;
    $('net-wait').textContent = host
      ? (doc.seats.length < 2 ? 'Esperando a que se una alguien más (mínimo 2, máximo 6).' : `Sois ${doc.seats.length}. Cuando estéis todos, pulsa Empezar. El orden de los turnos se sortea.`)
      : `Sois ${doc.seats.length}. Esperando a que ${hostName} empiece la partida...`;
    $('net-start').hidden = !host;
    $('net-start').disabled = doc.seats.length < 2;
  }
  async function refreshRoom(force) {
    if (!net.code || net.busy) return;
    try {
      const doc = await getGame(net.code);
      if (!doc) return;
      const same = net.doc && doc._time === net.doc._time;
      net.doc = doc;
      if (doc.status !== 'sala') { stopPolling(); return openGame(doc.code); }
      if (!same || force) updateRoom(doc);
    } catch (e) { /* sin conexión: se vuelve a intentar */ }
  }
  function invite(code) {
    const text = `¡Únete a mi partida de Pixel Enemies! Código: ${code}`;
    if (navigator.share) navigator.share({ title: 'Pixel Enemies', text, url: shareUrl(code) }).catch(() => {});
    else window.open('https://wa.me/?text=' + encodeURIComponent(`${text}\n${shareUrl(code)}`), '_blank');
  }
  async function startMatch(code) {
    if (net.busy) return; net.busy = true;
    try {
      const doc = await getGame(code);
      if (doc.seats.length < 2) { toast('Hacen falta al menos 2 jugadores.'); net.busy = false; return; }
      const seats = doc.seats.slice();
      for (let i = seats.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [seats[i], seats[j]] = [seats[j], seats[i]]; }
      const s = doc.settings;
      const map = M.generate({ size: s.size, type: s.type, abundance: s.abundance, players: seats.length, gen: s.gen || 1 });
      const game = R.newGame({ map, players: seats.map(x => x.faction), army: CFG.demo ? 'prueba' : 'real', close: !!CFG.demo });
      await commit([upd(`partidas/${code}`, { status: 'jugando', seats, uids: seats.map(x => x.uid), seed: map.seed,
        game: JSON.stringify(game), n: 0, turnStart: Date.now(), turnUid: seats[0].uid }, doc._time)]);
      net.busy = false;
      stopPolling();
      openGame(code);
    } catch (e) { net.busy = false; fail(e); }
  }

  // --- La partida en el mapa ---------------------------------------------------
  // Enseña la partida. Si hay turnos de otros que no has visto, primero se repiten.
  async function showMap(doc, intro) {
    const me = doc.seats.findIndex(s => s.uid === myUid());
    const names = doc.seats.map(s => s.name), s = doc.settings;
    const base = { online: true, me, names, seed: doc.seed, size: s.size, type: s.type, abundance: s.abundance, gen: s.gen || 1, armies: 'real',
      players: doc.seats.map(x => x.faction) };
    hidePanel();
    document.body.classList.add('online-game');
    $('net-btn').textContent = 'Mis partidas';
    const seen = local.get('seen.' + doc.code, -1);
    let turns = [];
    if (seen < doc.n - 1) {
      try { turns = (await query(`/partidas/${doc.code}`, 'turnos', ['n', 'GREATER_THAN', seen], 'n')).filter(t => t.player !== me); }
      catch (e) { turns = []; }
    }
    const current = JSON.parse(doc.game);
    if (turns.length) {
      const first = JSON.parse(turns[0].start);
      G().startGame(Object.assign({}, base, { game: first }));
      const watch = await ask(intro ? 'Mientras no estabas' : 'Nuevo turno',
        `${turns.length === 1 ? `${names[turns[0].player]} ha jugado su turno.` : `Se han jugado ${turns.length} turnos.`} ¿Quieres verlo?`,
        'Ver la repetición', 'Saltar');
      if (watch) {
        $('net-skip').hidden = false;
        net.skipAll = false;
        let seen = 0;
        for (const t of turns) {
          if (net.skipAll) break;
          UI().say(`Repetición: turno de ${names[t.player]}${t.timeout ? ' (se le acabó el tiempo)' : ''}.`);
          seen += await G().replay(JSON.parse(t.start), JSON.parse(t.orders), 1);
        }
        $('net-skip').hidden = true;
        if (!seen && !net.skipAll) toast('No has visto nada: todo pasó en la niebla, lejos de tus tropas.');
      }
    }
    local.set('seen.' + doc.code, doc.n - 1);
    // Si es tu turno y lo dejaste a medias, se recuperan las órdenes que ya habías hecho.
    const draft = local.get('turn.' + doc.code, null);
    let orders = [];
    if (draft && draft.n === doc.n && current.turn === me) {
      const map = M.generate({ seed: doc.seed, size: s.size, type: s.type, abundance: s.abundance, players: doc.seats.length, gen: s.gen || 1 });
      R.applyCleared(current, map);
      for (const o of draft.orders) if (R.perform(current, map, o)) orders.push(o);
    }
    net.start = doc.game; // la partida al empezar el turno (para la repetición de los demás)
    G().startGame(Object.assign({}, base, { game: current, orders }));
    if (current.winner !== null) return;
    if (current.turn === me) {
      const news = (current.events || []).map(e => (e.kind === 'cobro' ? `Cobras ${e.oro} de oro y ${e.comida} de comida.` : '')).join(' ');
      if (!orders.length) { await ask('¡Te toca!', `Ronda ${current.round}. ${news}`, 'Empezar mi turno'); G().focusPlayer(); }
    } else {
      const left = timeLeft(doc);
      UI().say(`Le toca a ${names[current.turn]}${left ? ` (${left})` : ''}. Te avisaremos cuando sea tu turno.`);
    }
  }
  // Ventana con uno o dos botones; devuelve true si se pulsa el primero.
  function ask(title, text, yes, no) {
    return new Promise(res => UI().overlay(title, text, yes, '#2f7a3a', () => res(true), true, no ? { cancel: no, onCancel: () => res(false) } : {}));
  }

  // Cada orden de tu turno se apunta en el móvil, por si cierras el juego a medias.
  function onOrder(o) {
    if (!net.code || !net.doc) return;
    const st = window.PEState;
    if (o.a === 'end') return;
    local.set('turn.' + net.code, { n: net.doc.n, orders: st.orders });
  }

  // Al pasar turno: se manda la partida y las órdenes a los demás.
  async function endTurn() {
    const st = window.PEState, doc = net.doc, code = net.code;
    const game = st.game, n = doc.n;
    const next = game.winner === null ? doc.seats[game.turn].uid : '';
    UI().say('Enviando tu turno...');
    try {
      await commit([
        upd(`partidas/${code}`, { game: JSON.stringify(game), n: n + 1, turnStart: Date.now(), turnUid: next,
          status: game.winner === null ? 'jugando' : 'fin' }, doc._time),
        create(`partidas/${code}/turnos/${pad(n)}`, { n, player: st.me, start: net.start, orders: JSON.stringify(st.orders), at: Date.now() }),
      ]);
      local.del('turn.' + code);
      local.set('seen.' + code, n);
      net.doc = await getGame(code);
      net.start = net.doc.game;
      st.orders = [];
      if (game.winner !== null) { UI().showWinner(); return; }
      const who = doc.seats[game.turn];
      UI().overlay('Turno enviado', `Ahora le toca a ${who.name}. Le llegará un aviso si los tiene activados.`, 'Vale', '#2f7a3a', null, true,
        { cancel: 'Avisar por WhatsApp', onCancel: () => window.open('https://wa.me/?text=' + encodeURIComponent(`¡Te toca en Pixel Enemies! Partida ${code}\n${shareUrl(code)}`), '_blank') });
      UI().onTurn();
    } catch (e) {
      // Otro cambió la partida antes (por ejemplo, se te acabó el tiempo): se vuelve a cargar.
      if (e.code === 'FAILED_PRECONDITION' || e.code === 'ABORTED') {
        local.del('turn.' + code);
        await ask('Tu turno no se pudo enviar', 'La partida ha cambiado mientras jugabas (seguramente se te acabó el tiempo).', 'Vale');
        return openGame(code);
      }
      // Sin conexión: se deshace el "pasar turno" para volver a intentarlo.
      fail(e);
      UI().say('No se pudo enviar el turno. Comprueba la conexión y pulsa otra vez "Pasar turno".');
      reopenTurn();
    }
  }
  function reopenTurn() {
    const st = window.PEState, doc = net.doc, s = doc.settings;
    const orders = st.orders.filter(o => o.a !== 'end');
    const game = JSON.parse(net.start);
    const map = M.generate({ seed: doc.seed, size: s.size, type: s.type, abundance: s.abundance, players: doc.seats.length, gen: s.gen || 1 });
    R.applyCleared(game, map);
    orders.forEach(o => R.perform(game, map, o));
    G().startGame({ online: true, me: st.me, names: st.names, seed: doc.seed, size: s.size, type: s.type, abundance: s.abundance, gen: s.gen || 1,
      armies: 'real', players: doc.seats.map(x => x.faction), game, orders });
  }

  // Mientras esperas, se mira cada poco si ya han jugado (y si a alguien se le acabó el tiempo).
  async function poll() {
    if (!net.code || net.busy || G().replaying || G().busy) return;
    const st = window.PEState;
    if (st.me !== null && st.game && st.game.turn === st.me && st.game.winner === null) return; // estás jugando tú
    try {
      const doc = await getGame(net.code);
      if (!doc) return;
      const changed = doc.n !== net.doc.n || doc.status !== net.doc.status;
      net.doc = doc;
      if (!changed) return checkTimeout(doc);
      await showMap(doc, false);
    } catch (e) { /* sin conexión: se vuelve a intentar */ }
  }
  async function checkTimeout(doc) {
    if (!doc || doc.status !== 'jugando' || !doc.settings.limit) return;
    if (Date.now() < doc.turnStart + doc.settings.limit * 3600000) return;
    const s = doc.settings, game = JSON.parse(doc.game);
    if (game.turn === doc.seats.findIndex(x => x.uid === myUid())) return; // el que va tarde aún puede terminar si nadie lo pasa
    const map = M.generate({ seed: doc.seed, size: s.size, type: s.type, abundance: s.abundance, players: doc.seats.length, gen: s.gen || 1 });
    R.applyCleared(game, map);
    const player = game.turn;
    R.perform(game, map, { a: 'end' });
    try {
      await commit([
        upd(`partidas/${doc.code}`, { game: JSON.stringify(game), n: doc.n + 1, turnStart: Date.now(),
          turnUid: game.winner === null ? doc.seats[game.turn].uid : '', status: game.winner === null ? 'jugando' : 'fin' }, doc._time),
        create(`partidas/${doc.code}/turnos/${pad(doc.n)}`, { n: doc.n, player, start: doc.game, orders: JSON.stringify([{ a: 'end' }]), at: Date.now(), timeout: true }),
      ]);
    } catch (e) { /* otro lo ha hecho antes */ }
  }

  // --- Avisos en el móvil (notificaciones) -----------------------------------
  // Las manda GitHub cada pocos minutos. Aquí solo se pide permiso y se guarda la "dirección" del móvil.
  async function pushButton() {
    const box = $('net-push');
    if (!box) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      box.innerHTML = isIos && !standalone()
        ? '<p class="small">Para recibir avisos en iPhone: pulsa Compartir y luego "Añadir a pantalla de inicio", y abre el juego desde ese icono.</p>'
        : '<p class="small">Este navegador no puede recibir avisos. Usa el botón de WhatsApp al pasar turno.</p>';
      return;
    }
    const on = local.get('push', false) && Notification.permission === 'granted';
    box.innerHTML = on ? '<p class="small">Avisos activados en este móvil.</p>'
      : '<div class="row"><button id="net-push-on">Activar avisos de turno</button></div>';
    if (!on) $('net-push-on').onclick = enablePush;
  }
  async function enablePush() {
    try {
      const cfg = await api('GET', '/config/avisos');
      const key = cfg && decDoc(cfg).publicKey;
      if (!key) { toast('Los avisos aún no están listos en el servidor.'); return; }
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { toast('Sin permiso no se pueden mandar avisos.'); return; }
      const reg = await navigator.serviceWorker.ready;
      const raw = atob(key.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((key.length + 3) % 4));
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from(raw, c => c.charCodeAt(0)) });
      await commit([upd(`avisos/${myUid()}`, { sub: JSON.stringify(sub), name: local.get('name', '?'), at: Date.now() })]);
      local.set('push', true);
      toast('¡Avisos activados!');
      pushButton();
    } catch (e) { fail(e); }
  }

  // --- Arranque ------------------------------------------------------------
  // Si se abre con un enlace "?partida=CÓDIGO", va directo a esa partida.
  function boot() {
    const code = new URLSearchParams(location.search).get('partida');
    if (!code) return false;
    const c = code.toUpperCase();
    if (!CFG) { showList(); return true; }
    withName(() => openGame(c));
    return true;
  }
  function wire() {
    $('net-btn').onclick = () => { if (!G() || G().replaying) { if (G()) G().skip = true; return; } showList(); };
    $('net-skip').onclick = () => { net.skipAll = true; G().skip = true; };
  }
  window.addEventListener('load', wire);
  window.PEOnline = { boot, showList, onOrder, endTurn, _test: { enc, dec, encFields, decFields } };
})();
