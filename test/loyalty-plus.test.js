import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduled } from '../src/app.js';
import { segmentOf } from '../src/loyalty.js';
import { makeEnv, setupOrg, client } from './helpers.js';

const DAY = 86_400_000;
let n = 0;
const key = () => 'k-' + (++n) + '-' + Math.random().toString(36).slice(2);

async function withClock(fn) {
  const real = Date.now;
  let clock = real();
  Date.now = () => clock;
  try { return await fn((ms) => (clock += ms), () => clock); } finally { Date.now = real; }
}

test('points mode: the cashier enters the bill, the server converts and redeems by points', async () => {
  const env = makeEnv();
  const { owner, cashier, orgSlug } = await setupOrg(env);
  assert.equal((await owner.put('/api/owner/loyalty', { kind: 'cash', reward_ar: 'ق', reward_en: 'c' })).status, 400);
  assert.equal((await owner.put('/api/owner/loyalty', { kind: 'points', points_per_sar: 2, reward_points: 100, reward_ar: 'قهوة مجانية', reward_en: 'Free coffee' })).status, 200);
  const card = (await client(env).post('/api/cards', { org: orgSlug })).json;
  assert.equal(card.program.kind, 'points');
  assert.equal(card.program.need, 100);
  assert.equal((await cashier.post(`/api/branch/loyalty/${card.code}/stamp`, { idem_key: key() })).status, 400, 'points need the bill amount');
  const earn = await cashier.post(`/api/branch/loyalty/${card.code}/stamp`, { idem_key: key(), amount: 3550 });
  assert.equal(earn.json.stamps, 71, '35.50 SAR × 2 points');
  assert.equal((await cashier.post(`/api/branch/loyalty/${card.code}/redeem`, { idem_key: key() })).status, 409);
  await cashier.post(`/api/branch/loyalty/${card.code}/stamp`, { idem_key: key(), amount: 2000 });
  const red = await cashier.post(`/api/branch/loyalty/${card.code}/redeem`, { idem_key: key() });
  assert.equal(red.json.stamps, 11);
  // Switching back to stamps keeps the old settings working.
  await owner.put('/api/owner/loyalty', { kind: 'stamps' });
  assert.equal((await owner.get('/api/owner/loyalty')).json.program.reward_ar, 'قهوة مجانية');
  assert.equal((await cashier.post(`/api/branch/loyalty/${card.code}/stamp`, { idem_key: key() })).json.stamps, 12);
});

test('segments follow visit history', () => {
  const t = Date.now();
  assert.equal(segmentOf({ visits: 8, visits_60: 6, last_visit: t - DAY, created_at: t - 90 * DAY }, t), 'vip');
  assert.equal(segmentOf({ visits: 5, visits_60: 0, last_visit: t - 70 * DAY, created_at: t - 200 * DAY }, t), 'dormant');
  assert.equal(segmentOf({ visits: 3, visits_60: 1, last_visit: t - 30 * DAY, created_at: t - 90 * DAY }, t), 'at_risk');
  assert.equal(segmentOf({ visits: 1, visits_60: 1, last_visit: t - 2 * DAY, created_at: t - 2 * DAY }, t), 'new');
  assert.equal(segmentOf({ visits: 3, visits_60: 3, last_visit: t - 3 * DAY, created_at: t - 40 * DAY }, t), 'regular');
});

test('owner sees segments and sends a message that lands on the card and its phone', async () => {
  const env = makeEnv({ VAPID_SUBJECT: 'mailto:t@z.test', VAPID_PUBLIC_KEY: 'x', VAPID_PRIVATE_KEY: 'y' });
  const { owner, cashier, orgSlug } = await setupOrg(env);
  await owner.put('/api/owner/loyalty', { stamps_required: 5, reward_ar: 'قهوة', reward_en: 'Coffee' });
  const guest = client(env);
  const regular = (await guest.post('/api/cards', { org: orgSlug })).json;
  const fresh = (await guest.post('/api/cards', { org: orgSlug })).json;
  await withClock(async (tick) => {
    for (let i = 0; i < 6; i++) { await cashier.post(`/api/branch/loyalty/${regular.code}/stamp`, { idem_key: key() }); tick(DAY); }
    await cashier.post(`/api/branch/loyalty/${fresh.code}/stamp`, { idem_key: key() });
    const r = (await owner.get('/api/owner/loyalty/customers')).json;
    assert.equal(r.total, 2);
    assert.equal(r.counts.vip, 1);
    assert.equal(r.counts.new, 1);
    assert.equal((await owner.get('/api/owner/loyalty/customers?segment=vip')).json.customers[0].code, regular.code);
    assert.equal(r.customers[0].id, undefined, 'internal ids stay private');
  });
  assert.equal((await cashier.get('/api/owner/loyalty/customers')).status, 403);
  assert.equal((await guest.post('/api/cards/' + regular.token + '/subscribe', { endpoint: 'https://evil.example/p' })).status, 400);
  assert.equal((await guest.post('/api/cards/' + regular.token + '/subscribe', { endpoint: 'https://fcm.googleapis.com/vip' })).status, 200);

  assert.equal((await owner.post('/api/owner/loyalty/messages', { segment: 'everyone', title_ar: 'عرض', body_ar: 'خصم' })).status, 400);
  assert.equal((await owner.post('/api/owner/loyalty/messages', { segment: 'dormant', title_ar: 'عرض', body_ar: 'خصم' })).json.error, 'no_recipients');
  const sent = await owner.post('/api/owner/loyalty/messages', { segment: 'vip', title_ar: 'شكرًا لك', body_ar: 'قهوتك القادمة علينا' });
  assert.equal(sent.status, 201);
  assert.equal(sent.json.recipients, 1);
  assert.equal((await guest.get('/api/cards/' + regular.token)).json.messages[0].body_ar, 'قهوتك القادمة علينا');
  assert.equal((await guest.get('/api/cards/' + fresh.token)).json.messages.length, 0);
  await owner.post('/api/owner/loyalty/messages', { segment: 'all', title_ar: 'جديد', body_ar: 'صنف جديد' });
  assert.equal((await owner.post('/api/owner/loyalty/messages', { segment: 'all', title_ar: 'ثالث', body_ar: 'كثير' })).json.error, 'messages_daily_limit');
  assert.equal((await owner.get('/api/owner/loyalty/messages')).json.messages.length, 2);
});

test('win-back reaches guests away N days once, in daytime', async () => {
  const env = makeEnv();
  const { owner, cashier, orgSlug } = await setupOrg(env);
  assert.equal((await owner.put('/api/owner/loyalty', { stamps_required: 5, reward_ar: 'ق', reward_en: 'c', winback_days: 3 })).json?.error, 'invalid_winback_days');
  assert.equal((await owner.put('/api/owner/loyalty', { stamps_required: 5, reward_ar: 'ق', reward_en: 'c', winback_days: 14 })).json.error, 'winback_message_required');
  await owner.put('/api/owner/loyalty', { stamps_required: 5, reward_ar: 'ق', reward_en: 'c', winback_days: 14, winback_ar: 'وحشتنا! ختم مضاعف هالأسبوع' });
  const card = (await client(env).post('/api/cards', { org: orgSlug })).json;
  await withClock(async (tick, at) => {
    // Start at 09:23 UTC (12:23 Riyadh), the cron's daytime slot.
    const d = new Date(at()); d.setUTCHours(9, 23, 0, 0); tick(d.getTime() - at());
    await cashier.post(`/api/branch/loyalty/${card.code}/stamp`, { idem_key: key() });
    await scheduled(env, async () => new Response(null, { status: 201 }));
    assert.equal((await client(env).get('/api/cards/' + card.token)).json.messages.length, 0, 'not away long enough');
    tick(15 * DAY);
    await scheduled(env, async () => new Response(null, { status: 201 }));
    const msgs = (await client(env).get('/api/cards/' + card.token)).json.messages;
    assert.equal(msgs.length, 1);
    assert.match(msgs[0].body_ar, /وحشتنا/);
    tick(DAY);
    await scheduled(env, async () => new Response(null, { status: 201 }));
    assert.equal((await client(env).get('/api/cards/' + card.token)).json.messages.length, 1, 'only once per absence');
  });
});
