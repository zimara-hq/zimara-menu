import { test } from 'node:test';
import assert from 'node:assert/strict';
import { client, makeEnv, setupOrg } from './helpers.js';
import { scheduled, REALERT_EVERY_MS } from '../src/app.js';

const VAPID = {
  // Throwaway test keypair (not used anywhere real).
  VAPID_SUBJECT: 'mailto:test@zimara.test',
};

async function withVapid() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  const pub = Buffer.from(raw).toString('base64url');
  return { ...VAPID, VAPID_PUBLIC_KEY: pub, VAPID_PRIVATE_KEY: jwk.d, publicKey: kp.publicKey };
}

test('full journey: create, link, subscribe, ready, seen, collect, rate', async () => {
  const keys = await withVapid();
  const pushes = [];
  const env = makeEnv(keys);
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (u, init) => {
    pushes.push({ u, init });
    return new Response(null, { status: 201 });
  };
  try {
    const { cashier } = await setupOrg(env);
    const created = await cashier.post('/api/branch/tickets', { number: '27' });
    assert.equal(created.status, 201);
    const token = created.json.token;

    const guest = client(env, '2.2.2.2');
    const view = await guest.get('/api/t/' + token);
    assert.equal(view.json.status, 'preparing');
    assert.equal(view.json.number, '27');
    assert.ok(view.json.linked_at);
    assert.equal(view.json.id, undefined, 'internal id is not exposed');

    const bad = await guest.post(`/api/t/${token}/subscribe`, { endpoint: 'https://evil.example/hook' });
    assert.equal(bad.status, 400, 'push endpoint must be a real push service');
    const sub = await guest.post(`/api/t/${token}/subscribe`, { endpoint: 'https://fcm.googleapis.com/fcm/send/abc' });
    assert.equal(sub.status, 200);

    const list = await cashier.get('/api/branch/tickets');
    const t = list.json.tickets[0];
    const ready = await cashier.post(`/api/branch/tickets/${t.id}/ready`, { version: t.version });
    assert.equal(ready.status, 200);
    assert.deepEqual(ready.json.push, { sent: 1, failed: 0, subscriptions: 1 });
    assert.equal(pushes.length, 1);
    const auth = pushes[0].init.headers.Authorization;
    assert.match(auth, /^vapid t=.+\..+\..+, k=/);

    // VAPID signature verifies with the public key.
    const jwt = auth.slice(8, auth.indexOf(','));
    const [h, p, s] = jwt.split('.');
    const okSig = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      keys.publicKey,
      Buffer.from(s, 'base64url'),
      new TextEncoder().encode(`${h}.${p}`),
    );
    assert.ok(okSig);
    assert.equal(JSON.parse(Buffer.from(p, 'base64url')).aud, 'https://fcm.googleapis.com');

    const seen = await guest.post(`/api/t/${token}/seen`, {});
    assert.equal(seen.json.status, 'ready', 'seeing the alert is not collecting');
    assert.ok(seen.json.seen_at);
    assert.equal(seen.json.google_review_url, null);

    const cur = (await cashier.get('/api/branch/tickets')).json.tickets[0];
    const col = await cashier.post(`/api/branch/tickets/${t.id}/collect`, { version: cur.version });
    assert.equal(col.json.ticket.status, 'collected');

    const after = await guest.get('/api/t/' + token);
    assert.equal(after.json.google_review_url, 'https://g.page/r/test/review');
    const rate = await guest.post(`/api/t/${token}/rate`, { rating: 5, comment: 'ممتاز' });
    assert.equal(rate.json.rating, 5);
    assert.equal((await guest.post(`/api/t/${token}/rate`, { rating: 1 })).status, 409, 'rating once');
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('two cashiers cannot double-issue an open number or apply stale actions', async () => {
  const env = makeEnv();
  const { cashier } = await setupOrg(env);
  const second = client(env);
  await second.login('hail@cafe.test', 'branch-pass-123');
  assert.equal((await cashier.post('/api/branch/tickets', { number: '5' })).status, 201);
  const dup = await second.post('/api/branch/tickets', { number: '5' });
  assert.equal(dup.status, 409);
  assert.equal(dup.json.error, 'number_in_use');

  const t = (await cashier.get('/api/branch/tickets')).json.tickets[0];
  const a = await cashier.post(`/api/branch/tickets/${t.id}/ready`, { version: t.version });
  const b = await second.post(`/api/branch/tickets/${t.id}/cancel`, { version: t.version });
  assert.equal(a.status, 200);
  assert.equal(b.status, 409);
  assert.equal(b.json.ticket.status, 'ready', 'stale response carries current state');

  // After collection the same number can be reused.
  const cur = (await cashier.get('/api/branch/tickets')).json.tickets[0];
  await cashier.post(`/api/branch/tickets/${t.id}/collect`, { version: cur.version });
  assert.equal((await second.post('/api/branch/tickets', { number: '5' })).status, 201);
});

test('auto numbers increment per branch', async () => {
  const env = makeEnv();
  const { cashier } = await setupOrg(env);
  const n1 = await cashier.post('/api/branch/tickets', {});
  const n2 = await cashier.post('/api/branch/tickets', {});
  assert.equal(n1.json.number, '1');
  assert.equal(n2.json.number, '2');
});

test('cron repeats unseen alerts every 2 minutes up to 3 times, stops once seen', async () => {
  const keys = await withVapid();
  const env = makeEnv(keys);
  const { cashier } = await setupOrg(env);
  const created = await cashier.post('/api/branch/tickets', { number: '9' });
  const guest = client(env, '3.3.3.3');
  await guest.post(`/api/t/${created.json.token}/subscribe`, { endpoint: 'https://web.push.apple.com/abc' });
  const sent = [];
  const fake = async (u) => (sent.push(u), new Response(null, { status: 201 }));
  const realFetch = globalThis.fetch;
  globalThis.fetch = fake;
  try {
    const t = (await cashier.get('/api/branch/tickets')).json.tickets[0];
    await cashier.post(`/api/branch/tickets/${t.id}/ready`, { version: t.version });
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(sent.length, 1);

  const realNow = Date.now;
  let clock = realNow();
  Date.now = () => clock;
  try {
    for (let i = 0; i < 5; i++) {
      clock += REALERT_EVERY_MS + 1000;
      await scheduled(env, fake);
    }
  } finally {
    Date.now = realNow;
  }
  assert.equal(sent.length, 4, 'first alert + 3 repeats');

  // A gone subscription is removed.
  const goneEnv = makeEnv(keys);
  const s2 = await setupOrg(goneEnv);
  const c2 = await s2.cashier.post('/api/branch/tickets', { number: '1' });
  await client(goneEnv).post(`/api/t/${c2.json.token}/subscribe`, { endpoint: 'https://fcm.googleapis.com/x' });
  globalThis.fetch = async () => new Response(null, { status: 410 });
  try {
    const t = (await s2.cashier.get('/api/branch/tickets')).json.tickets[0];
    const r = await s2.cashier.post(`/api/branch/tickets/${t.id}/ready`, { version: t.version });
    assert.equal(r.json.push.failed, 1);
  } finally {
    globalThis.fetch = realFetch;
  }
  const left = await goneEnv.DB.prepare('SELECT COUNT(*) AS n FROM push_subscriptions').first();
  assert.equal(left.n, 0);
});

test('unknown ticket tokens 404 and closed tickets reject subscriptions', async () => {
  const env = makeEnv();
  const { cashier } = await setupOrg(env);
  const guest = client(env);
  assert.equal((await guest.get('/api/t/nope')).status, 404);
  const c = await cashier.post('/api/branch/tickets', {});
  const t = (await cashier.get('/api/branch/tickets')).json.tickets[0];
  await cashier.post(`/api/branch/tickets/${t.id}/cancel`, { version: t.version });
  const r = await guest.post(`/api/t/${c.json.token}/subscribe`, { endpoint: 'https://fcm.googleapis.com/x' });
  assert.equal(r.status, 409);
});

test('customer acknowledgment does not invalidate the cashier version', async () => {
  const env = makeEnv();
  const { cashier } = await setupOrg(env);
  const c = await cashier.post('/api/branch/tickets', {});
  let t = (await cashier.get('/api/branch/tickets')).json.tickets[0];
  t = (await cashier.post(`/api/branch/tickets/${t.id}/ready`, { version: t.version })).json.ticket;
  await client(env).post(`/api/t/${c.json.token}/seen`, {});
  const col = await cashier.post(`/api/branch/tickets/${t.id}/collect`, { version: t.version });
  assert.equal(col.status, 200);
});
