// KikaCentroid — service worker.
// Hand-rolled (no build pipeline) but follows the same strategies Workbox would.

// Bump CACHE_VERSION whenever any precached file changes — the new SW will
// install a fresh cache, the page will get an "update available" toast, and
// old caches are evicted on activate.
// Also bump the user-visible label in index.html (#app-version) to match.
const CACHE_VERSION = 'v1.46';
const PRECACHE = `kc-precache-${CACHE_VERSION}`;
const RUNTIME  = `kc-runtime-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  './',
  './index.html',
  './styles.css',
  './game.js',
  './offline.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon-180.png',
  './icons/favicon-32.png',
];

// ── Install: precache the app shell ──────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(PRECACHE);
    // Use Request with cache: 'reload' so the install bypasses HTTP cache
    // and we always pick up the latest shell.
    await cache.addAll(PRECACHE_URLS.map((u) => new Request(u, { cache: 'reload' })));
  })());
  // Don't call skipWaiting() here — wait for the page to ask for it.
});

// ── Activate: drop old caches + enable nav preload ───────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => k !== PRECACHE && k !== RUNTIME)
        .map((k) => caches.delete(k))
    );
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch (_) {}
    }
    await self.clients.claim();
  })());
});

// ── Message: page-controlled skipWaiting ─────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ── Fetch ────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Never cache anything but GET. POST/PUT/DELETE pass through untouched.
  if (req.method !== 'GET') return;

  // Don't intercept cross-origin requests; let the browser handle them.
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // HTML navigations → NetworkFirst (3s) → cache → offline.html
  if (req.mode === 'navigate') {
    event.respondWith(navigationHandler(event));
    return;
  }

  // Images → CacheFirst with runtime cache (icons + any future images)
  if (req.destination === 'image') {
    event.respondWith(cacheFirst(req, RUNTIME));
    return;
  }

  // Manifest → NetworkFirst so install metadata changes (name, theme_color,
  // icons) actually propagate to already-installed Android PWAs. iOS only
  // reads the manifest at install time, so its behavior is unaffected; this
  // matters for Android Chrome which periodically re-reads.
  if (req.destination === 'manifest') {
    event.respondWith(networkFirst(req, PRECACHE));
    return;
  }

  // CSS/JS from same origin → StaleWhileRevalidate from precache.
  if (
    req.destination === 'style' ||
    req.destination === 'script'
  ) {
    event.respondWith(staleWhileRevalidate(req, PRECACHE));
    return;
  }

  // Fallback: try cache, then network.
  event.respondWith(cacheFirst(req, RUNTIME));
});

// ── Strategies ───────────────────────────────────────────────────────────
async function navigationHandler(event) {
  const cache = await caches.open(PRECACHE);
  try {
    const preload = event.preloadResponse ? await event.preloadResponse : null;
    const network = preload || await timeout(fetch(event.request), 3000);
    if (network && network.ok && network.type === 'basic') {
      // Mirror successful navigations into the precache so subsequent offline
      // hits return the freshest shell we've actually seen. Store under the
      // actual request URL (e.g. `./?src=pwa` from start_url) AND under
      // `./index.html` so the offline-fallback chain below works regardless
      // of which URL the user navigated to.
      cache.put(event.request, network.clone()).catch(() => {});
      const indexHref = new URL('./index.html', self.location).href;
      if (event.request.url !== indexHref) {
        cache.put('./index.html', network.clone()).catch(() => {});
      }
      return network;
    }
    throw new Error('navigation network response not ok');
  } catch (_) {
    const cached = await cache.match(event.request)
                || await cache.match('./index.html')
                || await cache.match('./');
    if (cached) return cached;
    return cache.match('./offline.html');
  }
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res && res.ok && res.type === 'basic') {
      cache.put(req, res.clone()).catch(() => {});
    }
    return res;
  } catch (err) {
    const cached = await cache.match(req);
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res && res.ok && res.type === 'basic') {
      cache.put(req, res.clone()).catch(() => {});
    }
    return res;
  } catch (err) {
    // Image failures: return a transparent 1x1 PNG so the layout doesn't blow up.
    if (req.destination === 'image') return transparentPng();
    throw err;
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const network = fetch(req).then((res) => {
    if (res && res.ok && res.type === 'basic') {
      cache.put(req, res.clone()).catch(() => {});
    }
    return res;
  }).catch(() => null);
  return cached || (await network) || (await cache.match(req));
}

function timeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); }
    );
  });
}

function transparentPng() {
  // 1x1 transparent PNG, base64-decoded once.
  const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Response(bytes, { headers: { 'Content-Type': 'image/png' } });
}
