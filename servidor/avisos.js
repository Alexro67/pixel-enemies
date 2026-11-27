// Pixel Enemies - avisos de turno. Lo ejecuta GitHub cada pocos minutos (ver .github/workflows/avisos.yml).
//  1. Si a alguien se le ha acabado el tiempo de su turno, se lo pasa.
//  2. Si a alguien le toca y aún no se le ha avisado, le manda una notificación al móvil.
// Necesita el secreto FIREBASE_SA (la llave de la "cuenta de servicio" de Firebase, en formato JSON).
'use strict';
const crypto = require('crypto');
const webpush = require('web-push');
const M = require('../src/map.js');
const R = require('../src/rules.js');

const GAME_URL = process.env.GAME_URL || 'https://alexro67.github.io/pixel-enemies/';
const EMU = process.env.FIRESTORE_EMULATOR; // para probar: 'http://localhost:8080'
const SA = JSON.parse(process.env.FIREBASE_SA || '{}');
const PROJECT = SA.project_id || process.env.PROJECT_ID;
const DB = `projects/${PROJECT}/databases/(default)/documents`;
const BASE = `${EMU || 'https://firestore.googleapis.com'}/v1/${DB}`;
const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// --- Permiso para hablar con la base de datos (con la llave de la cuenta de servicio) ---
async function accessToken() {
  if (EMU) return 'owner';
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify({ iss: SA.client_email, scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const sig = b64url(crypto.createSign('RSA-SHA256').update(`${head}.${body}`).sign(SA.private_key));
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${head}.${body}.${sig}` });
  const j = await r.json();
  if (!j.access_token) throw new Error('No se pudo entrar en Firebase: ' + JSON.stringify(j));
  return j.access_token;
}
let TOKEN;
async function api(method, url, body) {
  const r = await fetch(url.startsWith('http') ? url : BASE + url, { method,
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 404) return null;
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(JSON.stringify(j.error || j)); e.code = j.error && j.error.status; throw e; }
  return j;
}
function enc(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  const f = {}; for (const [k, x] of Object.entries(v)) f[k] = enc(x);
  return { mapValue: { fields: f } };
}
const encFields = (o) => enc(o).mapValue.fields;
function dec(v) {
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('stringValue' in v) return v.stringValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(dec);
  if ('mapValue' in v) return decFields(v.mapValue.fields);
  return null;
}
function decFields(f) { const o = {}; for (const [k, v] of Object.entries(f || {})) o[k] = dec(v); return o; }
const decDoc = (d) => Object.assign(decFields(d.fields), { _time: d.updateTime });
const get = async (path) => { const d = await api('GET', '/' + path); return d && decDoc(d); };
const set = (path, data) => api('PATCH', '/' + path, { fields: encFields(data) });
const del = (path) => api('DELETE', '/' + path);
const upd = (path, data, time) => ({ update: { name: `${DB}/${path}`, fields: encFields(data) }, updateMask: { fieldPaths: Object.keys(data) },
  currentDocument: time ? { updateTime: time } : undefined });

// --- Llaves de los avisos (salen siempre iguales de la llave de Firebase, así no hace falta otro secreto) ---
function vapidKeys() {
  const seed = crypto.createHash('sha256').update((SA.private_key || PROJECT) + '|pixel-enemies-avisos').digest();
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.setPrivateKey(seed);
  return { publicKey: b64url(ecdh.getPublicKey()), privateKey: b64url(seed) };
}

// Pasa el turno de quien se ha quedado sin tiempo (lo mismo que haría cualquier jugador al abrir la partida).
async function timeout(doc, code) {
  const s = doc.settings, game = JSON.parse(doc.game);
  const map = M.generate({ seed: doc.seed, size: s.size, type: s.type, abundance: s.abundance, players: doc.seats.length });
  R.applyCleared(game, map);
  const player = game.turn;
  R.perform(game, map, { a: 'end' });
  const n = String(doc.n).padStart(6, '0');
  await api('POST', `${EMU || 'https://firestore.googleapis.com'}/v1/${DB}:commit`, { writes: [
    upd(`partidas/${code}`, { game: JSON.stringify(game), n: doc.n + 1, turnStart: Date.now(),
      turnUid: game.winner === null ? doc.seats[game.turn].uid : '', status: game.winner === null ? 'jugando' : 'fin' }, doc._time),
    { update: { name: `${DB}/partidas/${code}/turnos/${n}`, fields: encFields({ n: doc.n, player, start: doc.game,
      orders: JSON.stringify([{ a: 'end' }]), at: Date.now(), timeout: true }) }, currentDocument: { exists: false } },
  ] });
  console.log(`${code}: a ${doc.seats[player].name} se le acabó el tiempo; turno pasado.`);
}

async function main() {
  TOKEN = await accessToken();
  const keys = vapidKeys();
  webpush.setVapidDetails('https://github.com/Alexro67/pixel-enemies', keys.publicKey, keys.privateKey);
  const cfg = await get('config/avisos');
  if (!cfg || cfg.publicKey !== keys.publicKey) await set('config/avisos', { publicKey: keys.publicKey });

  const res = await api('POST', `${EMU || 'https://firestore.googleapis.com'}/v1/${DB}:runQuery`, { structuredQuery: {
    from: [{ collectionId: 'partidas' }], where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: enc('jugando') } } } });
  const games = (res || []).filter(x => x.document).map(x => decDoc(x.document));
  console.log(`${games.length} partidas en juego.`);
  for (let doc of games) {
    const code = doc.code;
    try {
      if (doc.settings.limit && Date.now() > doc.turnStart + doc.settings.limit * 3600000) {
        try { await timeout(doc, code); } catch (e) { console.log(`${code}: no se pudo pasar el turno (${e.message})`); }
        doc = await get(`partidas/${code}`);
        if (!doc || doc.status !== 'jugando') continue;
      }
      const done = await get(`avisados/${code}`);
      if (done && done.n === doc.n) continue; // ya avisado de este turno
      const uid = doc.turnUid, sub = uid && await get(`avisos/${uid}`);
      const who = doc.seats.find(x => x.uid === uid);
      if (sub && sub.sub) {
        const others = doc.seats.filter(x => x.uid !== uid).map(x => x.name).join(', ');
        try {
          await webpush.sendNotification(JSON.parse(sub.sub), JSON.stringify({ title: '¡Te toca en Pixel Enemies!',
            body: `Partida ${code} con ${others}. Es tu turno.`, url: `${GAME_URL}?partida=${code}`, tag: code }), { TTL: 86400 });
          console.log(`${code}: aviso mandado a ${who ? who.name : uid}.`);
        } catch (e) {
          console.log(`${code}: el aviso a ${who ? who.name : uid} falló (${e.statusCode}).`);
          if (e.statusCode === 404 || e.statusCode === 410) await del(`avisos/${uid}`); // ese móvil ya no quiere avisos
        }
      }
      await set(`avisados/${code}`, { n: doc.n });
    } catch (e) { console.log(`${code}: error ${e.message}`); }
  }
}
main().catch(e => { console.error(e); process.exit(1); });
