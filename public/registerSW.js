// Retire legacy service worker (migration from the old PWA).
// Served at the URLs the old prototype used to register, so any stale
// service worker is replaced by this no-op which clears old caches and
// unregisters itself.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.registration.unregister();
    } catch (err) {
      console.warn('[sw-retire]', err);
    }
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clients) {
      try { client.navigate(client.url); } catch {}
    }
  })());
});
