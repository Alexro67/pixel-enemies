const CACHE = 'pixel-enemies-v15';
const FILES = ['./', 'index.html', 'manifest.json', 'icons/icon-192.png', 'icons/icon-512.png',
  'lib/phaser.min.js', 'src/map.js', 'src/tiles.js', 'src/units.js', 'src/rules.js', 'src/game.js',
  'src/online-config.js', 'src/online.js'];
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))); });
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))));
// Primero intenta la red (para ver siempre lo último); sin conexión, usa lo guardado.
// Las peticiones al servidor de partidas no se guardan (tienen que ser siempre las de ahora).
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(
  fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true })));
});

// Avisos de turno (los manda GitHub): se enseñan como notificación del móvil.
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data.json(); } catch (err) { d = { title: 'Pixel Enemies', body: e.data ? e.data.text() : '¡Te toca!' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Pixel Enemies', {
    body: d.body || '¡Te toca!', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: d.tag || 'turno',
    renotify: true, data: { url: d.url || './' } }));
});
// Al tocar el aviso, se abre el juego en esa partida.
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data && e.notification.data.url || './';
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) if ('navigate' in c) return c.navigate(url).then(w => w && w.focus());
    return clients.openWindow(url);
  }));
});
