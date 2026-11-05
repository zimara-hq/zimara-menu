// ZIMARA Menu: generic offline recovery and payload-less pager pushes.
const STATE = 'zm-state-v1'; // tracked tokens: { token, lang, kind: 't' pager | 'w' waitlist | 'c' loyalty card }

async function readTokens() {
  const cache = await caches.open(STATE);
  const res = await cache.match('/__tickets');
  return res ? res.json() : [];
}

async function writeTokens(tokens) {
  const cache = await caches.open(STATE);
  // Short-lived pager/waitlist tokens rotate; long-lived card tokens keep their own slots.
  const cards = tokens.filter((x) => x.kind === 'c').slice(-3), rest = tokens.filter((x) => x.kind !== 'c').slice(-5);
  await cache.put('/__tickets', new Response(JSON.stringify([...cards, ...rest])));
}

const OFFLINE_CACHE = 'zm-offline-v1';
// Only generic recovery assets. Never cache API responses, tenant pages or credentials.
const OFFLINE_ASSETS = ['/offline', '/offline.js'];
self.addEventListener('install', (event) => event.waitUntil((async () => {
  const cache = await caches.open(OFFLINE_CACHE);
  await cache.addAll(OFFLINE_ASSETS);
  await self.skipWaiting();
})()));
self.addEventListener('activate', (event) => event.waitUntil((async () => {
  for (const key of await caches.keys()) {
    if (key.startsWith('zm-offline-') && key !== OFFLINE_CACHE) await caches.delete(key);
  }
  await self.clients.claim();
})()));
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => {
      const cache = await caches.open(OFFLINE_CACHE);
      return await cache.match('/offline') || new Response('Connection unavailable. Reconnect and retry.', {
        status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }));
  } else if (OFFLINE_ASSETS.includes(url.pathname) && !url.search) {
    event.respondWith((async () => {
      const cache = await caches.open(OFFLINE_CACHE);
      return await cache.match(url.pathname) || fetch(request);
    })());
  }
});

self.addEventListener('message', (e) => {
  if (e.data?.type === 'track' && typeof e.data.token === 'string') {
    e.waitUntil((async () => {
      const tokens = await readTokens();
      await writeTokens([...tokens.filter((x) => x.token !== e.data.token), { token: e.data.token, lang: e.data.lang, kind: ['w', 'c'].includes(e.data.kind) ? e.data.kind : 't' }]);
      e.ports[0]?.postMessage({ type: 'tracked' });
    })());
  }
});

self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      const tokens = await readTokens();
      let shown = false;
      for (const { token, lang, kind } of tokens.reverse()) {
        try {
          const r = await fetch(({ w: '/api/w/', c: '/api/cards/' }[kind] || '/api/t/') + token, { cache: 'no-store' });
          if (!r.ok) continue;
          const t = await r.json();
          if (kind === 'c') {
            const m = t.messages?.[0];
            if (!m || Date.now() - m.created_at > 30 * 60_000) continue;
            const ar = lang !== 'en';
            await self.registration.showNotification(ar ? m.title_ar : m.title_en, {
              body: (ar ? m.body_ar : m.body_en) + ' — ' + (ar ? t.org.name_ar : t.org.name_en),
              icon: '/brand/symbol.png', badge: '/brand/symbol.png', tag: 'zm-c-' + m.id, data: { url: '/c/' + token },
            });
            shown = true;
            break;
          }
          if (kind === 'w') {
            if (t.status !== 'called') continue;
            const ar = lang !== 'en';
            await self.registration.showNotification(ar ? `جا دوركم! رقم ${t.number}` : `Your table is ready! #${t.number}`, {
              body: ar ? `تفضلوا للاستقبال — ${t.org_ar}` : `Please come to the host stand — ${t.org_en}`,
              icon: '/brand/symbol.png', badge: '/brand/symbol.png', tag: 'zm-w-' + token, renotify: true, requireInteraction: true,
              vibrate: [300, 150, 300, 150, 600], data: { url: '/w/' + token },
            });
            shown = true;
            break;
          }
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
      if (!shown) await self.registration.showNotification('ZIMARA Menu', { body: 'وصلك تنبيه · You have an update', icon: '/brand/symbol.png' });
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
