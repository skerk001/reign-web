// Service worker for caching REIGN NBA Analytics data files
const CACHE_NAME = 'reign-data-v2';
const DATA_FILES = [
  '/data/seasons_pioneer.json',
  '/data/seasons_legacy.json',
  '/data/seasons_classic.json',
  '/data/seasons_modern.json',
  '/data/player_index.json',
  '/data/awards.json',
  '/data/stretches_rs3.json',
  '/data/stretches_rs5.json',
  '/data/stretches_po3.json',
  '/data/stretches_po5.json',
  '/data/career_avg_rs.json',
  '/data/career_avg_po.json',
  '/data/career_clutch.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(DATA_FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Only cache data files
  if (url.pathname.startsWith('/data/') && url.pathname.endsWith('.json')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        // Return cached, but also update in background (stale-while-revalidate)
        const fetchPromise = fetch(event.request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => cached);

        return cached || fetchPromise;
      })
    );
  }
});
