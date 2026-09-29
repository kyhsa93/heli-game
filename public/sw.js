self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    req.mode === 'navigate'
      ? fetch(req.url, { cache: 'no-store', credentials: 'same-origin', redirect: 'follow' })
      : fetch(req, { cache: 'no-store' }),
  );
});
