import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduled } from '../src/app.js';
import { makeEnv, setupOrg, client } from './helpers.js';

async function vapid() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  return { VAPID_SUBJECT: 'mailto:test@zimara.test', VAPID_PUBLIC_KEY: Buffer.from(raw).toString('base64url'), VAPID_PRIVATE_KEY: jwk.d };
}

async function open(env, extra = {}) {
  const s = await setupOrg(env);
  const url = '/api/owner/branches/' + s.branchId + '/waitlist';
  await s.owner.patch(url, { active: true, minutes_per_party: 5, max_party: 8, ...extra });
  s.join = (b, ip = '4.4.4.' + Math.floor(Math.random() * 200)) => client(env, ip).post('/api/public/waitlist/' + s.branchSlug, b);
  return s;
}

test('owner opens the waitlist; guests join, see their place and wait, and cannot join when closed', async () => {
  const env = makeEnv();
  const s = await setupOrg(env);
  const url = '/api/owner/branches/' + s.branchId + '/waitlist';
  assert.equal((await s.owner.get(url)).json.settings.active, false);
  assert.equal((await client(env).post('/api/public/waitlist/' + s.branchSlug, { name: 'نورة', party: 2 })).json.error, 'waitlist_closed');
  assert.equal((await s.cashier.patch(url, { active: true })).status, 403);
  assert.equal((await s.owner.patch(url, { minutes_per_party: 0 })).status, 400);
  assert.equal((await s.owner.patch(url, { active: true, minutes_per_party: 5, max_party: 8 })).json.settings.active, true);

  const join = (b) => client(env, '5.5.5.' + Math.floor(Math.random() * 200)).post('/api/public/waitlist/' + s.branchSlug, b);
  assert.equal((await join({ name: 'كبير', party: 9 })).status, 400);
  assert.equal((await join({ name: 'رقم', party: 2, phone: '123' })).json.error, 'invalid_phone');
  const a = await join({ name: 'نورة', party: 2, phone: '0551234567' });
  assert.equal(a.status, 201);
  assert.equal(a.json.number, 1);
  const again = await join({ name: 'نورة', party: 3, phone: '+966551234567' });
  assert.equal(again.json.token, a.json.token, 'the same mobile keeps its place');
  const b = await join({ name: 'خالد', party: 4 });
  assert.equal(b.json.number, 2);

  const info = (await client(env).get('/api/public/waitlist/' + s.branchSlug)).json;
  assert.equal(info.waiting, 2);
  assert.equal(info.eta_minutes, 15);
  const vb = (await client(env).get('/api/w/' + b.json.token)).json;
  assert.equal(vb.position, 2);
  assert.equal(vb.eta_minutes, 10);
  assert.equal(vb.phone, undefined, 'the guest page never echoes phone numbers');

  // Guest leaves the line; the next one moves up.
  assert.equal((await client(env).post('/api/w/' + a.json.token + '/cancel', {})).json.status, 'cancelled');
  assert.equal((await client(env).get('/api/w/' + b.json.token)).json.position, 1);
  assert.equal((await client(env).post('/api/w/' + a.json.token + '/cancel', {})).status, 409);
});

test('staff call, re-call, seat, mark no-show, and add walk-ins with stale-safe versions', async () => {
  const env = makeEnv(), s = await open(env);
  const g = await s.join({ name: 'سارة', party: 2 });
  const walk = await s.cashier.post('/api/branch/waitlist', { name: 'عائلة', party: 12 });
  assert.equal(walk.status, 201, 'staff can seat bigger walk-ins than the guest limit');
  assert.equal(walk.json.number, 2);
  assert.equal((await s.owner.get('/api/branch/waitlist')).status, 403);

  let list = (await s.cashier.get('/api/branch/waitlist')).json;
  assert.equal(list.entries.length, 2);
  assert.equal(list.slug, s.branchSlug);
  const e = list.entries.find((x) => x.number === 1);
  const called = await s.cashier.post(`/api/branch/waitlist/${e.id}/call`, { version: e.version });
  assert.equal(called.json.entry.status, 'called');
  assert.equal((await s.cashier.post(`/api/branch/waitlist/${e.id}/call`, { version: e.version })).status, 409, 'stale version');
  const v = (await client(env).get('/api/w/' + g.json.token)).json;
  assert.equal(v.status, 'called');
  assert.equal(v.position, null);
  const recall = await s.cashier.post(`/api/branch/waitlist/${e.id}/call`, { version: called.json.entry.version });
  assert.equal(recall.json.entry.alerts_sent, 2);
  assert.equal((await client(env).post('/api/w/' + g.json.token + '/seen', {})).json.seen_at > 0, true);
  const seated = await s.cashier.post(`/api/branch/waitlist/${e.id}/seat`, { version: recall.json.entry.version });
  assert.equal(seated.json.entry.status, 'seated');

  const w = (await s.cashier.get('/api/branch/waitlist')).json.entries.find((x) => x.number === 2);
  assert.equal((await s.cashier.post(`/api/branch/waitlist/${w.id}/no_show`, { version: w.version })).status, 409, 'no-show only after a call');
  assert.equal((await s.cashier.post(`/api/branch/waitlist/${w.id}/teleport`, { version: w.version })).status, 404);

});

test('a call alerts subscribed phones and repeats until seen, three times at most', async () => {
  const keys = await vapid();
  const env = makeEnv(keys), s = await open(env);
  const g = await s.join({ name: 'ريم', party: 2 });
  assert.equal((await client(env).post('/api/w/' + g.json.token + '/subscribe', { endpoint: 'https://evil.example/x' })).status, 400);
  await client(env).post('/api/w/' + g.json.token + '/subscribe', { endpoint: 'https://web.push.apple.com/wl' });
  const sent = [];
  const fake = async (u) => (sent.push(String(u)), new Response(null, { status: 201 }));
  const realFetch = globalThis.fetch;
  globalThis.fetch = fake;
  try {
    const e = (await s.cashier.get('/api/branch/waitlist')).json.entries[0];
    const r = await s.cashier.post(`/api/branch/waitlist/${e.id}/call`, { version: e.version });
    assert.equal(r.json.push.sent, 1);
  } finally { globalThis.fetch = realFetch; }
  const realNow = Date.now;
  let clock = realNow();
  Date.now = () => clock;
  try {
    for (let i = 0; i < 6; i++) { clock += 61_000; await scheduled(env, fake); }
  } finally { Date.now = realNow; }
  assert.equal(sent.filter((u) => u.includes('/wl')).length, 4, 'first call + 3 repeats');
});
