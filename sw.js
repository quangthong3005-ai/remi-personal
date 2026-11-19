/* Service worker của Remi: mở app khi mất mạng và nhận thông báo đẩy từ máy chủ. */
'use strict';
const CACHE = 'remi-personal-v7';
const SHELL = ['/', '/css/app.css', '/js/api.js', '/js/qty.js', '/js/local-parse.js', '/js/cal-utils.js', '/js/cal-ui.js', '/js/personal.js', '/js/stats.js', '/js/kitchen.js', '/js/kitchen-ui.js', '/data/dishes.json', '/js/app.js', '/manifest.webmanifest', '/icons/icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Có mạng thì lấy bản mới nhất (và lưu lại), mất mạng thì dùng bản đã lưu. API không bao giờ qua cache.
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== self.location.origin || u.pathname.startsWith('/api/')) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        if (r.ok) {
          const copy = r.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return r;
      })
      .catch(() => caches.match(e.request).then((m) => m || caches.match('/')))
  );
});

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { title: 'Remi', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
      // App đang mở và nhìn thấy: để app tự hiện thông báo trong màn hình, tránh báo hai lần.
      if (cs.some((c) => c.visibilityState === 'visible')) {
        cs.forEach((c) => c.postMessage({ type: 'push', title: d.title, body: d.body }));
        return undefined;
      }
      return self.registration.showNotification(d.title || 'Remi', {
        body: d.body || '',
        icon: '/icons/icon-192.png',
        tag: d.tag,
        data: { url: d.url || '/' },
      });
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
      const c = cs[0];
      return c ? c.focus() : self.clients.openWindow(url);
    })
  );
});
