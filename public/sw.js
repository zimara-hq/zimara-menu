// ZIMARA Menu service worker: receives payload-less pager pushes and shows the alert.
const STATE = 'zm-state-v1';

async function readTokens() {
  const cache = await caches.open(STATE);
  const res = await cache.match('/__tickets');
  return res ? res.json() : [];
}

async function writeTokens(tokens) {
  const cache = await caches.open(STATE);
  await cache.put('/__tickets', new Response(JSON.stringify(tokens.slice(-5))));
}

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('message', (e) => {
  if (e.data?.type === 'track' && typeof e.data.token === 'string') {
    e.waitUntil(readTokens().then((t) => writeTokens([...t.filter((x) => x.token !== e.data.token), { token: e.data.token, lang: e.data.lang }])));
  }
});

self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      const tokens = await readTokens();
      let shown = false;
      for (const { token, lang } of tokens.reverse()) {
        try {
          const r = await fetch('/api/t/' + token, { cache: 'no-store' });
          if (!r.ok) continue;
          const t = await r.json();
          if (t.status !== 'ready') continue;
          const ar = lang !== 'en';
          await self.registration.showNotification(ar ? `طلبك رقم ${t.number} جاهز` : `Order ${t.number} is ready`, {
            body: ar ? `توجّه لنقطة الاستلام — ${t.org_ar}` : `Head to the pickup point — ${t.org_en}`,
            icon: '/brand/symbol.png',
            badge: '/brand/symbol.png',
            tag: 'zm-' + token,
            renotify: true,
            requireInteraction: true,
            vibrate: [300, 150, 300, 150, 600],
            data: { url: '/t/' + token },
          });
          shown = true;
          break;
        } catch {}
      }
      // Browsers require a visible notification for every push.
      if (!shown) await self.registration.showNotification('ZIMARA Menu', { body: 'طلبك جاهز · Your order is ready', icon: '/brand/symbol.png' });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const c of all) if (new URL(c.url).pathname === url) return c.focus();
      return self.clients.openWindow(url);
    })(),
  );
});
