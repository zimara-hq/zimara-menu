import test from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';
import { makeEnv, setupOrg, client } from './helpers.js';

test('templates restyle the page and add sample items that stay hidden until edited', async () => {
  const env = makeEnv(), s = await setupOrg(env);
  const list = await s.owner.get('/api/owner/templates');
  assert.equal(list.status, 200);
  assert.ok(list.json.templates.length >= 8);
  assert.equal(list.json.menu_empty, true);

  const applied = await s.owner.post('/api/owner/templates/burger/apply', {});
  assert.equal(applied.status, 200, JSON.stringify(applied.json));
  assert.ok(applied.json.sample_items > 0);
  assert.equal((await s.owner.get('/api/owner/templates')).json.hidden_samples, applied.json.sample_items);

  const pub = (await client(env).get('/api/public/menu/' + s.branchSlug)).json;
  assert.equal(pub.branch.brand_color, '#b3261e');
  assert.equal(pub.items.length, 0, 'samples are hidden from guests');
  const prof = (await client(env).get('/api/public/profile/' + s.orgSlug)).json;
  assert.equal(prof.profile.theme.layout, 'cards');

  // Sample items cannot be ordered while hidden.
  const owned = (await s.owner.get('/api/owner/menu')).json;
  assert.ok(owned.items.every((i) => i.is_sample === 1));
  await s.owner.patch('/api/owner/branches/' + s.branchId + '/settings', { orders_enabled: true });
  const sample = owned.items[0];
  assert.equal((await client(env).post('/api/public/orders/' + s.branchSlug, { idem_key: crypto.randomUUID(), items: [{ item_id: sample.id, quantity: 1 }] })).status, 400);

  // Editing an item publishes it.
  await s.owner.patch('/api/owner/items/' + sample.id, { category_id: sample.category_id, name_ar: 'سماش الزيمارا', name_en: 'Zimara smash', price: 3100 });
  const after = (await client(env).get('/api/public/menu/' + s.branchSlug)).json;
  assert.deepEqual(after.items.map((i) => i.name_ar), ['سماش الزيمارا']);

  // A second template on a non-empty menu only restyles, unless the menu is required.
  assert.equal((await s.owner.post('/api/owner/templates/clinic/apply', { with_menu: true })).status, 409);
  const restyle = await s.owner.post('/api/owner/templates/roastery/apply', {});
  assert.equal(restyle.json.sample_items, 0);

  // Publish the rest, or remove them.
  const published = await s.owner.post('/api/owner/templates/samples/publish', {});
  assert.equal(published.json.published, applied.json.sample_items - 1);
  assert.equal((await client(env).get('/api/public/menu/' + s.branchSlug)).json.items.length, applied.json.sample_items);
  assert.equal((await s.owner.post('/api/owner/templates/nope/apply', {})).status, 404);
  assert.equal((await s.cashier.post('/api/owner/templates/burger/apply', {})).status, 403);
});

const CF = { CF_API_TOKEN: 'tok', CF_ZONE_ID: 'zone1', DOMAIN_CNAME_TARGET: 'domains.zimara.co', PUBLIC_BASE_URL: 'https://menu.zimara.co' };

function fakeCloudflare() {
  const calls = [];
  let status = 'pending';
  const original = globalThis.fetch;
  globalThis.fetch = async (u, init = {}) => {
    const url = String(u);
    if (!url.startsWith('https://api.cloudflare.com/')) return original(u, init);
    calls.push([init.method, url]);
    const result = { id: 'ch_1', hostname: 'menu.mycafe.sa', status, ssl: { status: status === 'active' ? 'active' : 'pending_validation', validation_records: [{ txt_name: '_acme-challenge.menu.mycafe.sa', txt_value: 'abc' }] }, ownership_verification: { type: 'txt', name: '_cf-custom-hostname.menu.mycafe.sa', value: 'xyz' } };
    return new Response(JSON.stringify({ success: true, result }), { status: 200 });
  };
  return { calls, activate: () => { status = 'active'; }, restore: () => { globalThis.fetch = original; } };
}

test('custom domain: add, DNS records, verify, and root redirect on the owner domain', async () => {
  const env = makeEnv(CF), s = await setupOrg(env);
  const cf = fakeCloudflare();
  try {
    assert.equal((await s.owner.put('/api/owner/domain', { hostname: 'menu.zimara.co' })).status, 400);
    assert.equal((await s.owner.put('/api/owner/domain', { hostname: 'not a host' })).status, 400);
    const added = await s.owner.put('/api/owner/domain', { hostname: 'https://Menu.MyCafe.sa/' });
    assert.equal(added.status, 201, JSON.stringify(added.json));
    assert.equal(added.json.domain.hostname, 'menu.mycafe.sa');
    assert.equal(added.json.domain.status, 'pending');
    assert.deepEqual(added.json.domain.records.map((r) => r.type + ':' + r.purpose), ['CNAME:route', 'TXT:ownership', 'TXT:certificate']);
    assert.equal(added.json.domain.records[0].value, 'domains.zimara.co');

    // Not active yet: the root is not redirected.
    const before = await app.request('https://menu.mycafe.sa/', {}, env);
    assert.notEqual(before.status, 302);

    cf.activate();
    const checked = await s.owner.post('/api/owner/domain/check', {});
    assert.equal(checked.json.domain.status, 'active');
    const root = await app.request('https://menu.mycafe.sa/', {}, env);
    assert.equal(root.status, 302);
    assert.equal(root.headers.get('location'), '/p/' + s.orgSlug);
    // The platform's own host is never redirected.
    assert.notEqual((await app.request('https://menu.zimara.co/', {}, env)).status, 302);

    assert.equal((await s.owner.del('/api/owner/domain')).status, 200);
    assert.ok(cf.calls.some(([m]) => m === 'DELETE'));
    assert.notEqual((await app.request('https://menu.mycafe.sa/', {}, env)).status, 302);
  } finally {
    cf.restore();
  }
});

test('custom domain is off without Cloudflare settings', async () => {
  const env = makeEnv(), s = await setupOrg(env);
  assert.equal((await s.owner.put('/api/owner/domain', { hostname: 'menu.mycafe.sa' })).status, 403);
  assert.equal((await s.owner.get('/api/owner/domain')).json.configured, false);
});
