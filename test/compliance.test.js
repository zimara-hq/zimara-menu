// Saudi PDPL / e-commerce and App Store readiness guarantees.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, client, setupOrg } from './helpers.js';
import { ERASED_TABLES, ERASED_LAST, RETAINED_TABLES, PLATFORM_TABLES, privacyCron, eraseOrganization } from '../src/privacy.js';
import { appleAssociation } from '../src/app.js';

test('every database table is classified as erased, retained by law or platform-only', () => {
  const env = makeEnv();
  const tables = env.DB.raw.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'").all().map((r) => r.name);
  const known = new Set([...ERASED_TABLES.map(([t]) => t), ...ERASED_LAST, ...RETAINED_TABLES, ...PLATFORM_TABLES]);
  assert.deepEqual(tables.filter((t) => !known.has(t)), [], 'new tables must be added to src/privacy.js');
});

test('an organisation deletion request can be cancelled, then really erases data after the grace period', async () => {
  const env = makeEnv();
  const s = await setupOrg(env);
  const orgId = (await env.DB.prepare('SELECT id FROM orgs WHERE slug=?').bind(s.orgSlug).first()).id;
  const cat = (await s.owner.post('/api/owner/categories', { name_ar: 'قهوة', name_en: 'Coffee' })).json.id;
  assert.equal((await s.owner.post('/api/owner/items', { category_id: cat, name_ar: 'لاتيه', name_en: 'Latte', price: 1600, calories: 120 })).status, 201);
  assert.equal((await s.cashier.post('/api/branch/tickets', {})).status, 201);
  assert.equal((await s.cashier.post('/api/branch/waitlist', { name: 'سارة', party: 2, phone: '0551234567' })).status, 201);
  assert.equal((await client(env, '7.7.7.7').post('/api/cards', { org: s.orgSlug })).status, 201);
  await env.DB.prepare("INSERT INTO subscription_invoices (id, org_id, provider, provider_reference, state, currency, subtotal, vat, total, created_at) VALUES ('inv-1', ?, 'simple_fatoora', 'ref-1', 'issued', 'SAR', 12900, 0, 12900, 0)").bind(orgId).run();

  const req = await s.owner.post('/api/owner/data/deletion-request', { confirm: 'DELETE ORGANIZATION', password: 'owner-pass-123' });
  assert.equal(req.status, 201);
  assert.equal(req.json.message, 'deletion_scheduled');
  assert.ok(req.json.scheduled_for > Date.now() + 13 * 86400000);
  // Not due yet: nothing is erased.
  await privacyCron(env);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM items WHERE org_id=?').bind(orgId).first()).n, 1);
  // Cancel, then request again and let the grace period pass.
  assert.equal((await s.owner.post('/api/owner/data/deletion-request/' + req.json.request.id + '/cancel', {})).status, 200);
  const again = await s.owner.post('/api/owner/data/deletion-request', { confirm: 'DELETE ORGANIZATION', password: 'owner-pass-123' });
  await env.DB.prepare('UPDATE data_deletion_requests SET scheduled_for=0 WHERE id=?').bind(again.json.request.id).run();
  assert.equal((await privacyCron(env)).erased, 1);

  for (const table of ['items', 'categories', 'tickets', 'waitlist', 'loyalty_cards', 'branches']) {
    assert.equal((await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE org_id=?`).bind(orgId).first()).n, 0, table);
  }
  const users = (await env.DB.prepare('SELECT email, name, disabled FROM users WHERE org_id=?').bind(orgId).all()).results;
  assert.ok(users.length >= 1 && users.every((u) => u.email.endsWith('@erased.invalid') && u.name === '' && u.disabled === 1));
  assert.equal((await client(env).login('owner@cafe.test', 'owner-pass-123')).status, 401);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id IN (SELECT id FROM users WHERE org_id=?)').bind(orgId).first()).n, 0);
  // Invoices are tax and commercial records and stay.
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM subscription_invoices WHERE org_id=?').bind(orgId).first()).n, 1);
  const org = await env.DB.prepare('SELECT name_ar, active, erased_at, slug FROM orgs WHERE id=?').bind(orgId).first();
  assert.equal(org.active, 0);
  assert.ok(org.erased_at);
  assert.notEqual(org.slug, s.orgSlug);
  assert.equal((await env.DB.prepare('SELECT status FROM data_deletion_requests WHERE id=?').bind(again.json.request.id).first()).status, 'completed');
  assert.deepEqual(await eraseOrganization(env, orgId), { erased: false, already: true });
});

test('admins see deletion requests and owners cannot complete them', async () => {
  const env = makeEnv();
  const s = await setupOrg(env);
  const req = await s.owner.post('/api/owner/data/deletion-request', { confirm: 'DELETE ORGANIZATION', password: 'owner-pass-123' });
  assert.equal((await s.owner.post('/api/admin/deletion-requests/' + req.json.request.id + '/complete', {})).status, 403);
  const list = await s.admin.get('/api/admin/deletion-requests');
  assert.equal(list.json.requests[0].status, 'pending');
  const done = await s.admin.post('/api/admin/deletion-requests/' + req.json.request.id + '/complete', {});
  assert.equal(done.json.erased, true);
  assert.equal((await s.admin.post('/api/admin/deletion-requests/' + req.json.request.id + '/complete', {})).status, 404);
});

test('customer contact details are stripped after the retention period', async () => {
  const env = makeEnv({ PII_RETENTION_DAYS: '30' });
  const s = await setupOrg(env);
  const entry = await s.cashier.post('/api/branch/waitlist', { name: 'سارة', party: 2, phone: '0551234567', note: 'قرب النافذة' });
  await env.DB.prepare("UPDATE waitlist SET status='seated', created_at=? WHERE id=?").bind(Date.now() - 31 * 86400000, entry.json.id).run();
  const fresh = await s.cashier.post('/api/branch/waitlist', { name: 'نورة', party: 1, phone: '0557654321' });
  await env.DB.prepare("UPDATE waitlist SET status='seated' WHERE id=?").bind(fresh.json.id).run();
  const orgId = (await env.DB.prepare('SELECT id FROM orgs WHERE slug=?').bind(s.orgSlug).first()).id;
  await env.DB.prepare("INSERT INTO customer_orders (id, org_id, branch_id, token, idem_key, fingerprint, total, items_json, created_at, order_type, details_json, note) VALUES ('o-1', ?, ?, 'tok-1', 'k-1', 'f', 1000, '[]', ?, 'delivery', ?, 'بدون سكر')")
    .bind(orgId, s.branchId, Date.now() - 31 * 86400000, JSON.stringify({ name: 'سارة', phone: '+966551234567', address: 'حائل', table: '4' })).run();
  await privacyCron(env);
  const order = await env.DB.prepare("SELECT details_json, note FROM customer_orders WHERE id='o-1'").first();
  assert.deepEqual(JSON.parse(order.details_json), { table: '4' });
  assert.equal(order.note, null);
  const old = await env.DB.prepare('SELECT name, phone, note, party FROM waitlist WHERE id=?').bind(entry.json.id).first();
  assert.deepEqual({ ...old }, { name: '', phone: null, note: null, party: 2 });
  assert.ok((await env.DB.prepare('SELECT phone FROM waitlist WHERE id=?').bind(fresh.json.id).first()).phone);
});

test('sign-up requires accepting the terms and records the accepted version', async () => {
  const env = makeEnv();
  const c = client(env);
  const base = { name_ar: 'مقهى', name_en: 'Cafe', slug: 'terms-cafe', name: 'Owner', email: 'terms@example.test', password: 'owner-pass-123', sector: 'cafe' };
  assert.equal((await c.post('/api/register', base)).json.error, 'terms_acceptance_required');
  assert.equal((await c.post('/api/register', { ...base, accept_terms: 'yes' })).status, 400);
  assert.equal((await c.post('/api/register', { ...base, accept_terms: true })).status, 201);
  const u = await env.DB.prepare('SELECT terms_version, terms_accepted_at FROM users WHERE email=?').bind('terms@example.test').first();
  assert.match(u.terms_version, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(u.terms_accepted_at > 0);
});

test('calories cannot be hidden from the public menu', async () => {
  const env = makeEnv();
  const s = await setupOrg(env);
  assert.equal((await s.owner.patch('/api/owner/profile', { theme: { show_calories: false } })).status, 200);
  assert.equal((await client(env).get('/api/public/profile/' + s.orgSlug)).json.profile.theme.show_calories, true);
});

test('guests can stop offer messages from their loyalty card', async () => {
  const env = makeEnv();
  const s = await setupOrg(env);
  const guest = client(env, '8.8.8.8');
  const card = (await guest.post('/api/cards', { org: s.orgSlug })).json;
  const endpoint = 'https://fcm.googleapis.com/fcm/send/abc123';
  assert.equal((await guest.post('/api/cards/' + card.token + '/subscribe', { endpoint })).status, 200);
  const count = async () => (await env.DB.prepare('SELECT COUNT(*) AS n FROM card_push').first()).n;
  assert.equal(await count(), 1);
  assert.equal((await guest.post('/api/cards/' + card.token + '/unsubscribe', { endpoint })).status, 200);
  assert.equal(await count(), 0);
  assert.equal((await guest.post('/api/cards/not-a-real-token-at-all-xx/unsubscribe', {})).status, 404);
});

test('phone apps cannot start a subscription purchase (App Store 3.1.1)', async () => {
  const env = makeEnv();
  await setupOrg(env);
  const tok = await client(env).post('/api/v1/auth/token', { email: 'owner@cafe.test', password: 'owner-pass-123' });
  assert.equal(tok.status, 201);
  const res = await client(env).post('/api/v1/owner/billing/checkout', { plan: 'basic', cycle: 'monthly' }, { authorization: 'Bearer ' + tok.json.token });
  assert.equal(res.status, 403);
  assert.equal(res.json.error, 'billing_web_only');
});

test('Apple app association is published only with real Apple identifiers', async () => {
  assert.equal(appleAssociation({}), null);
  assert.equal(appleAssociation({ APPLE_TEAM_ID: 'invented', APPLE_BUNDLE_ID: 'co.zimara.menu' }), null);
  const env = makeEnv({ APPLE_TEAM_ID: 'ABCDE12345', APPLE_BUNDLE_ID: 'co.zimara.menu', APPLE_APP_CLIP_BUNDLE_ID: 'co.zimara.menu.Clip' });
  const res = await client(env).get('/.well-known/apple-app-site-association');
  assert.equal(res.status, 200);
  assert.deepEqual(res.json.appclips.apps, ['ABCDE12345.co.zimara.menu.Clip']);
  assert.equal(res.json.applinks.details[0].appIDs[0], 'ABCDE12345.co.zimara.menu');
  assert.equal((await client(makeEnv()).get('/.well-known/apple-app-site-association')).status, 404);
});
