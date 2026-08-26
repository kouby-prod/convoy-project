// Web Push service worker. Kept as plain, dependency-free JS: it runs in the
// browser's SW context, outside the Next.js bundle, and only ever needs to
// react to two events — an incoming push, and a click on the notification it
// produced.

self.addEventListener('push', (event) => {
  let payload = { title: 'Kouby', body: '', link: '/' };
  if (event.data) {
    try {
      payload = { ...payload, ...event.data.json() };
    } catch {
      payload.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/images/logo.png',
      data: { link: payload.link || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = event.notification.data && event.notification.data.link;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === link && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(link || '/');
      return undefined;
    }),
  );
});
