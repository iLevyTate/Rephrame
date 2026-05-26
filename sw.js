// Reframe Service Worker — keep CACHE_NAME bumped on every release so old
// clients drop their caches and pick up the new index.html. The update
// banner in js/pwa.js relies on this bump to detect that a new SW exists.
const CACHE_NAME = 'reframe-v21';
// Fonts live in a separate cache so version bumps don't wipe them. Populated
// lazily on first successful fetch — we can't precache cross-origin Google
// Font responses reliably during install (opaque, CSS-driven woff2 URLs).
const FONT_CACHE = 'reframe-fonts-v1';

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './js/pwa.js',
  './icons/icon.svg',
  './icons/icon-192.svg',
  './icons/icon-512.svg',
  './icons/icon-maskable-512.svg',
  './icons/icon-small.svg',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(async c => {
      // Precache each asset individually so one missing file doesn't poison
      // the whole install. Failures are reported back to the page so the
      // user knows offline mode may be partial.
      const failed = [];
      await Promise.all(ASSETS.map(url =>
        fetch(url, { cache: 'reload' })
          .then(res => {
            if(!res || !res.ok) throw new Error('HTTP ' + (res && res.status));
            return c.put(url, res);
          })
          .catch(err => { failed.push({ url, err: String(err && err.message || err) }); })
      ));
      if(failed.length){
        console.warn('[sw] precache incomplete:', failed);
        try{
          const ch = new BroadcastChannel('reframe-sw-status');
          ch.postMessage({ type: 'precache-incomplete', failed, total: ASSETS.length });
          ch.close();
        }catch(_){}
      }
    })
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME && k !== FONT_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if(e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // Reframe is fully self-contained except for Google Fonts. Cache-first
  // against FONT_CACHE so the app renders identically offline once the
  // browser has loaded a font response at least once. Background refresh
  // keeps cached responses warm without blocking the render.
  if(url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')){
    e.respondWith(
      caches.open(FONT_CACHE).then(c =>
        c.match(e.request).then(cached => {
          const net = fetch(e.request).then(res => {
            // Google Font responses are CORS for stylesheets (basic) and
            // opaque for the woff2 files. Cache both — opaque responses
            // still render fine even though their bodies are unreadable.
            if(res && (res.status === 200 || res.type === 'opaque')){
              c.put(e.request, res.clone()).catch(() => {});
            }
            return res;
          }).catch(() => cached || new Response('', { status: 504 }));
          return cached || net;
        })
      )
    );
    return;
  }
  if(url.origin !== self.location.origin) return;

  // Navigation: network-first so users get fresh HTML when online; fall back
  // to cache if offline. Without this the app gets pinned to the install-time
  // version forever.
  const isNavigation = e.request.mode === 'navigate' || e.request.destination === 'document' ||
    url.pathname === '/' || url.pathname.endsWith('/index.html') || url.pathname.endsWith('index.html');
  if(isNavigation){
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if(res && res.status === 200 && res.type === 'basic'){
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(e.request, clone).catch(() => {}));
          }
          return res;
        })
        .catch(() => caches.match('./index.html').then(r => r || caches.match(e.request)))
    );
    return;
  }

  // Everything else: cache-first with background refresh.
  e.respondWith(
    caches.match(e.request).then(cached => {
      const net = fetch(e.request).then(res => {
        if(res && res.status === 200 && res.type === 'basic'){
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone).catch(() => {}));
        }
        return res;
      }).catch(() => cached || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } }));
      return cached || net;
    })
  );
});

self.addEventListener('message', e => {
  if(e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
