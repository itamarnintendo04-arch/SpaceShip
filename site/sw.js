// SpaceShip website service worker: shows the notifications the site sends (Web Push)
// and opens the game when one is tapped.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (er) { d = { title: 'SpaceShip', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'SpaceShip', {
    body: d.body || '', icon: '/img/alerts-192.png', badge: '/img/alerts-192.png', tag: d.tag || undefined, renotify: !!d.tag,
    data: { url: d.url || '/open' }, vibrate: [80, 40, 80],
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/open';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) if (c.url.includes('/open') && 'focus' in c) { c.navigate(url); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
