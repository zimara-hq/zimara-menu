import { test } from 'node:test';
import assert from 'node:assert/strict';
import { client, makeEnv, setupOrg } from './helpers.js';

test('owner builds the menu, branch marks sold out, public sees active items only', async () => {
  const env = makeEnv();
  const { owner, cashier, branchSlug } = await setupOrg(env);
  const cat = await owner.post('/api/owner/categories', { name_ar: 'قهوة', name_en: 'Coffee' });
  const latte = await owner.post('/api/owner/items', { category_id: cat.json.id, name_ar: 'لاتيه', name_en: 'Latte', price: 1800, calories: 190 });
  const hidden = await owner.post('/api/owner/items', { category_id: cat.json.id, name_ar: 'سري', name_en: 'Secret', price: 100 });
  await owner.patch(`/api/owner/items/${hidden.json.id}`, { category_id: cat.json.id, name_ar: 'سري', name_en: 'Secret', price: 100, active: false });
  assert.equal((await owner.post('/api/owner/items', { category_id: cat.json.id, name_ar: 'x', name_en: 'x', price: -1 })).status, 400);
  assert.equal((await owner.post('/api/owner/items', { category_id: cat.json.id, name_ar: 'x', name_en: 'x', price: 1, image_url: 'javascript:alert(1)' })).status, 400);

  const anon = client(env);
  let menu = await anon.get('/api/public/menu/' + branchSlug);
  assert.equal(menu.status, 200);
  assert.deepEqual(menu.json.items.map((i) => i.name_en), ['Latte']);
  assert.equal(menu.json.items[0].available, 1);
  assert.equal(menu.json.branch.org_id, undefined);

  await cashier.put('/api/branch/availability/' + latte.json.id, { available: false });
  menu = await anon.get('/api/public/menu/' + branchSlug);
  assert.equal(menu.json.items[0].available, 0);
  assert.equal((await anon.get('/api/public/menu/missing')).status, 404);
});

test('loyalty: stamps, idempotent retries, atomic redeem, no overdraw', async () => {
  const env = makeEnv();
  const { owner, cashier, orgSlug } = await setupOrg(env);
  await owner.put('/api/owner/loyalty', { stamps_required: 3, reward_ar: 'قهوة مجانية', reward_en: 'Free coffee' });
  const guest = client(env);
  const card = await guest.post('/api/cards', { org: orgSlug });
  assert.equal(card.status, 201);
  assert.match(card.json.code, /^[2-9A-HJ-NP-Z]{6}$/);
  const code = card.json.code;

  assert.equal((await cashier.post(`/api/branch/loyalty/${code}/redeem`, { idem_key: 'redeem-early' })).status, 409);
  for (let i = 0; i < 3; i++) await cashier.post(`/api/branch/loyalty/${code}/stamp`, { idem_key: 'stamp-key-' + i });
  // Retrying the same key (lost response) does not double-stamp.
  const retry = await cashier.post(`/api/branch/loyalty/${code}/stamp`, { idem_key: 'stamp-key-2' });
  assert.equal(retry.json.stamps, 3);

  // Two concurrent redeems for one reward: exactly one lands.
  const [a, b] = await Promise.all([
    cashier.post(`/api/branch/loyalty/${code}/redeem`, { idem_key: 'redeem-a' }),
    cashier.post(`/api/branch/loyalty/${code}/redeem`, { idem_key: 'redeem-b' }),
  ]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  const view = await guest.get('/api/cards/' + card.json.token);
  assert.equal(view.json.stamps, 0);
  assert.deepEqual(view.json.history.map((h) => h.kind).sort(), ['redeem', 'stamp', 'stamp', 'stamp']);

  // Reusing a key for a different action is refused, not silently accepted.
  assert.equal((await cashier.post(`/api/branch/loyalty/${code}/redeem`, { idem_key: 'stamp-key-0' })).status, 409);
});

test('a branch cannot touch another org card', async () => {
  const env = makeEnv();
  const { admin, orgSlug } = await setupOrg(env);
  const card = await client(env).post('/api/cards', { org: orgSlug });
  await admin.post('/api/admin/orgs', { name_ar: 'ب', name_en: 'Other', owner: { email: 'o2@o.test', name: 'O', password: 'owner-pass-123' } });
  const o2 = client(env);
  await o2.login('o2@o.test', 'owner-pass-123');
  await o2.post('/api/owner/branches', { name_ar: 'ف', name_en: 'B', account: { email: 'b2@o.test', name: 'B', password: 'branch-pass-123' } });
  const b2 = client(env);
  await b2.login('b2@o.test', 'branch-pass-123');
  assert.equal((await b2.post(`/api/branch/loyalty/${card.json.code}/stamp`, { idem_key: 'cross-org-1' })).status, 404);
});

test('owner stats summarise tickets per branch', async () => {
  const env = makeEnv();
  const { owner, cashier } = await setupOrg(env);
  const c = await cashier.post('/api/branch/tickets', {});
  const t = (await cashier.get('/api/branch/tickets')).json.tickets[0];
  await cashier.post(`/api/branch/tickets/${t.id}/collect`, { version: t.version });
  const s = await owner.get('/api/owner/stats');
  assert.equal(s.json.branches[0].tickets, 1);
  assert.equal(s.json.branches[0].collected, 1);
});

test('pretty page routes serve their HTML shells', async () => {
  const env = makeEnv();
  const anon = client(env);
  assert.equal((await anon.get('/m/some-branch')).text, 'asset:/menu');
  assert.equal((await anon.get('/t/tok')).text, 'asset:/ticket');
  assert.equal((await anon.get('/c/tok')).text, 'asset:/card');
  assert.equal((await anon.get('/api/nothing')).status, 404);
});
