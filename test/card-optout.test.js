import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const swSource = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const cardSource = readFileSync(new URL('../public/card.js', import.meta.url), 'utf8').replace(/^import .*;$/gm, '');

function fixture({ acknowledge = true } = {}) {
  let tokens = [{ token: 'other-card', kind: 'c', lang: 'en' }, { token: 'pager', kind: 't', lang: 'en' }, { token: 'opted-out', kind: 'c', lang: 'en' }];
  const handlers = {}, requests = [], notifications = [], announcements = [], timeouts = new Map();
  let timer = 0, unsubscribeCalls = 0;
  const cache = {
    match: async () => new Response(JSON.stringify(tokens)),
    put: async (_key, response) => { tokens = await response.json(); },
  };
  const workerContext = vm.createContext({
    Response, URL, Date, caches: { open: async () => cache },
    fetch: async url => {
      requests.push(url);
      if (url === '/api/t/pager') return Response.json({ status: 'ready', number: 42 });
      return Response.json({ org: { name_en: 'Cafe' }, messages: [{ id: 'offer', title_en: 'Offer', body_en: 'Come back', created_at: Date.now() }] });
    },
    self: {
      addEventListener: (name, callback) => { handlers[name] = callback; },
      registration: { showNotification: async (title, options) => notifications.push({ title, options }) },
    },
  });
  vm.runInContext(swSource, workerContext);
  const pending = [];
  const worker = { postMessage: (data, ports) => {
    if (!acknowledge) return;
    handlers.message({ data, ports, waitUntil: promise => pending.push(promise) });
  } };
  class Channel {
    constructor() {
      this.port1 = { close() {}, onmessage: null };
      this.port2 = { close() {}, postMessage: data => this.port1.onmessage?.({ data }) };
    }
  }
  const stop = { disabled: false, removed: false, addEventListener(_name, callback) { this.click = callback; }, remove() { this.removed = true; } };
  const revoke = {};
  const storage = new Map([['zm_card_push_opted-out', '1']]);
  const main = { querySelector: selector => selector === '#card-alerts-off' ? stop : selector === '#delete-card' ? revoke : null };
  const cardContext = vm.createContext({
    console, URL, Date, MessageChannel: Channel,
    location: { pathname: '/c/opted-out' },
    navigator: { serviceWorker: { getRegistration: async () => ({ active: worker, pushManager: { getSubscription: async () => ({ endpoint: 'https://push.example/shared', unsubscribe() { unsubscribeCalls++; } }) } }) } },
    Notification: { permission: 'granted' },
    document: { getElementById: () => main, visibilityState: 'hidden' },
    window: {}, localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    lang: 'en', makeT: () => key => key, setBrandColor() {}, topbar() {}, icon: () => '', esc: String, pick: () => 'Cafe', qrSvg: () => '',
    announce: (message, error) => announcements.push({ message, error }),
    api: async (url, options) => {
      if (options?.method === 'POST') { requests.push(url); return { ok: true }; }
      if (url.startsWith('/api/public/')) return { profile: {} };
      return { org: { slug: 'cafe' }, program: { stamps_required: 5 }, stamps: 0, code: '123', history: [], messages: [] };
    },
    applyTenantFont() {}, setInterval() {},
    setTimeout: callback => { const id = ++timer; timeouts.set(id, callback); return id; },
    clearTimeout: id => timeouts.delete(id),
  });
  vm.runInContext(cardSource, cardContext);
  return { stop, storage, announcements, requests, notifications, pending, timeouts, tokens: () => tokens, unsubscribeCalls: () => unsubscribeCalls,
    async ready() { await new Promise(resolve => setImmediate(resolve)); },
    async push() { let completion; handlers.push({ waitUntil: promise => { completion = promise; } }); await completion; },
  };
}

test('card opt-out removes service-worker tracking while preserving other cards and pager pushes', async () => {
  const f = fixture();
  await f.ready();
  await f.stop.click({ target: f.stop });
  await Promise.all(f.pending);
  assert.deepEqual(f.tokens().map(x => x.token), ['other-card', 'pager']);
  assert.equal(f.unsubscribeCalls(), 0, 'the shared browser subscription must stay active');
  assert.equal(f.storage.has('zm_card_push_opted-out'), false);
  assert.equal(f.stop.removed, true);
  assert.equal(f.announcements.at(-1).error, undefined);
  await f.push();
  assert.equal(f.requests.includes('/api/cards/opted-out'), false);
  assert.equal(f.notifications[0].options.data.url, '/t/pager');
  assert.equal(f.timeouts.size, 0);
});

test('a worker that does not acknowledge opt-out times out without claiming success', async () => {
  const f = fixture({ acknowledge: false });
  await f.ready();
  const click = f.stop.click({ target: f.stop });
  await f.ready();
  assert.equal(f.timeouts.size, 1, 'worker acknowledgement must have a bounded wait');
  for (const callback of f.timeouts.values()) callback();
  await click;
  assert.equal(f.stop.removed, false);
  assert.equal(f.stop.disabled, false);
  assert.equal(f.announcements.at(-1).error, true);
  assert.equal(f.storage.has('zm_card_push_opted-out'), true, 'keep the retry control available');
});
