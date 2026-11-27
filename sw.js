const CACHE = 'pixel-enemies-v2';
const FILES = ['./', 'index.html', 'manifest.json', 'icons/icon-192.png', 'icons/icon-512.png',
  'lib/phaser.min.js', 'src/map.js', 'src/tiles.js', 'src/game.js'];
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))); });
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))));
// Primero intenta la red (para ver siempre lo último); sin conexión, usa lo guardado.
self.addEventListener('fetch', e => e.respondWith(
  fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }))));
