/* TS Instalment — service worker
   Caches the app shell so the app can open offline / install as a PWA,
   but always prefers the LIVE network version when online so updates
   show up within seconds instead of waiting for a second app open.
   Firebase & CDN calls always go straight to the network (live data). */

/* Bump this version string every time you re-upload index.html —
   it forces old caches to be wiped on activate. */
const CACHE_NAME = 'ts-instalment-v3';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      )
    ).then(() => self.clients.claim())
  );
});

/* Lets the page force this worker to activate immediately after
   a new version is downloaded, instead of waiting for all tabs to close. */
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle GET requests for our own origin (app shell).
  // Everything else (Firebase, Google Fonts, CDN scripts, WhatsApp links) passes straight to the network.
  if (req.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  // NETWORK-FIRST for page navigations / the app shell HTML — always try to
  // get the live, latest file first so updates appear right away. Only fall
  // back to the cache if the network request fails (offline).
  const isAppShell = req.mode === 'navigate' || url.pathname.endsWith('/index.html') || url.pathname === '/' ;

  if (isAppShell) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // CACHE-FIRST (with background refresh) for the rest of the app shell
  // (icons, manifest) — these rarely change, so instant load is preferred.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
