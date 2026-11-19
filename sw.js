// Same-origin only: the PeerJS signaling broker (0.peerjs.com) and WebRTC are never cached.
// Network-first so updates at the same URL show up immediately; cache is the offline fallback.
const V = 'fishtank-v11';
const ASSETS = ['./', './index.html', './app.js?v=11', './can.html', './can.js?v=11', './lib/peerjs.min.js?v=11', './lib/qrcode.js?v=11', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req).then(res => { const copy = res.clone(); caches.open(V).then(c => c.put(req, copy)); return res; })
      .catch(() => caches.match(req).then(r => r || caches.match(req, { ignoreSearch: true })).then(r => r || caches.match('./')))
  );
});
