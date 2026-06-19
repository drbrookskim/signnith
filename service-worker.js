const CACHE = 'signnith-v1';
const PRECACHE = [
  '/signnith/',
  '/signnith/index.html',
  '/signnith/favicon.ico',
  '/signnith/assets/icons/icon-192.png',
  '/signnith/assets/icons/icon-512.png',
  '/signnith/manifest.webmanifest',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // 외부 API(Yahoo Finance, Supabase 등)는 항상 네트워크 우선
  if (!e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
