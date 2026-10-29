// Keeps a copy of the app on the phone so it opens without a connection, using the last downloaded data.
// Network first: weekly data and code updates arrive whenever there's a connection; the saved copy is the fallback.
const CACHE = 'kmap-v10';
const SHELL = [
  './', 'index.html', 'app.js', 'price.js', 'i18n.js', 'style.css', 'manifest.webmanifest', 'icon.svg',
  'data/shops.json', 'data/holidays.json',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
];

self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).hostname.endsWith('tile.openstreetmap.org')) return; // map tiles aren't stored (OpenStreetMap's usage policy)
  e.respondWith(fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true })));
});
