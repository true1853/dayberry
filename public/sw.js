// sw.js — сервис-воркер Дайбери.
//
// Две задачи: не показывать браузерную «нет соединения» вместо приложения
// и принимать web-push. Кэшируем осознанно мало: разметку и данные отдаёт
// сервер (server actions), закэшированный ответ здесь врал бы про баланс,
// сделки и переписку. Поэтому в кэше только оболочка на случай офлайна.

const CACHE = 'dayberry-v1';
const OFFLINE_URL = '/offline.html';
const PRECACHE = [OFFLINE_URL, '/icon-192.png', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(PRECACHE);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Только переходы по страницам: сеть, а при её отсутствии — офлайн-заглушка.
// Всё остальное (в том числе POST server actions) отдаём браузеру как есть.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || request.mode !== 'navigate') return;
  event.respondWith((async () => {
    try {
      return await fetch(request);
    } catch (e) {
      const cache = await caches.open(CACHE);
      return (await cache.match(OFFLINE_URL)) || Response.error();
    }
  })());
});

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = {}; }
  const title = data.title || 'Дайбери';
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/badge-96.png',
    // одно уведомление на сущность: десять «вам написали» подряд — это спам
    tag: data.tag || 'dayberry',
    renotify: true,
    data: { url: data.url || '/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of all) {
      // приложение уже открыто — не плодим вкладки, а ведём нужный экран
      if ('focus' in client) {
        try { await client.navigate(target); } catch (e) { /* другой origin */ }
        return client.focus();
      }
    }
    return self.clients.openWindow(target);
  })());
});
