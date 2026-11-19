// Same-origin only: the ntfy.sh relay (HTTPS POST + WebSocket/SSE) is cross-origin and is never intercepted or cached.
// Network-first so updates at the same URL show up immediately; cache is the offline fallback.
const V = 'fishtank-v14';
const ASSETS = ['./', './index.html', './app.js?v=14', './can.html', './can.js?v=14', './lib/relay.js?v=14', './lib/qrcode.js?v=14', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, u = new URL(req.url);
  if (req.method !== 'GET' || u.origin !== location.origin || u.hostname === 'ntfy.sh') return;   // relay traffic: straight to the network
  e.respondWith(
    fetch(req).then(res => { const copy = res.clone(); caches.open(V).then(c => c.put(req, copy)); return res; })
      .catch(() => caches.match(req).then(r => r || caches.match(req, { ignoreSearch: true })).then(r => r || caches.match('./')))
  );
});
