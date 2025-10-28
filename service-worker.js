const CACHE_NAME = 'linksaver-chat-v2';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './icons/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => k !== CACHE_NAME ? caches.delete(k) : null)))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle GET requests
  if (req.method !== 'GET') return;

  // Navigation requests: network-first with offline fallback
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const controller = new AbortController();
          const id = setTimeout(() => controller.abort(), 4000);
          const fresh = await fetch('./index.html', { signal: controller.signal });
          clearTimeout(id);
          const copy = fresh.clone();
          const cache = await caches.open(CACHE_NAME);
          cache.put('./index.html', copy);
          return fresh;
        } catch (err) {
          const cached = await caches.match('./index.html');
          if (cached) return cached;
          // As a last resort, try the request cache
          const fallback = await caches.match(req);
          return fallback || Response.error();
        }
      })()
    );
    return;
  }

  // Same-origin assets: stale-while-revalidate
  if (url.origin === location.origin) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(req);
        const networkPromise = fetch(req).then((res) => {
          cache.put(req, res.clone());
          return res;
        }).catch(() => undefined);
        return cached || networkPromise || caches.match('./index.html');
      })()
    );
    return;
  }

  // Cross-origin (like jsonlink): network only
});
