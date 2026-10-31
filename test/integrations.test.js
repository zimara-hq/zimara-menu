import { test } from 'node:test';
import assert from 'node:assert/strict';
import { client, makeEnv, setupOrg } from './helpers.js';
import { b64url, hmac, id, now } from '../src/util.js';
import { decryptSigningSecret, verifyBridgeSignature } from '../src/providers/pos-bridge.js';
import { integrationReadiness } from '../src/integrations.js';

function bridgeEnv() { return makeEnv({ POS_BRIDGE_ENABLED: 'true', POS_ENCRYPTION_KEY: b64url(new Uint8Array(32).fill(11)) }); }
async function enablePro(env) {
  const org = await env.DB.prepare('SELECT id FROM orgs LIMIT 1').first();
  await env.DB.prepare("INSERT INTO subscriptions (org_id,plan,status,trial_ends_at,current_period_end,created_at,updated_at) VALUES (?,'pro','active',?,?,?,?) ON CONFLICT(org_id) DO UPDATE SET plan='pro',status='active'")
    .bind(org.id, now() + 86400000, now() + 86400000, now(), now()).run();
  return org;
}
async function makeConnection(env) {
  const result = await setupOrg(env);
  const org = await enablePro(env);
  const connection = await result.owner.post('/api/owner/pos-connections', { branch_id: result.branchId, label: 'Local test bridge', provider: 'generic_bridge' });
  assert.equal(connection.status, 201, connection.text);
  return { ...result, org, connection: connection.json };
}
async function signed(guest, connection, data, options = {}) {
  const timestamp = options.timestamp || String(Math.floor(Date.now() / 1000));
  const signature = options.signature || await hmac(connection.signing_secret, timestamp + '.' + JSON.stringify(data));
  return guest.post(connection.endpoint, data, { 'x-zimara-timestamp': timestamp, 'x-zimara-signature': signature });
}

test('integration readiness distinguishes missing implementation, keys, and actual verification', () => {
  const rows = integrationReadiness({});
  assert.equal(rows.find((r) => r.id === 'payments').state, 'needs_configuration');
  assert.equal(rows.find((r) => r.id === 'payments').implemented, true);
  assert.equal(rows.find((r) => r.id === 'apple_wallet').implemented, false);
  assert.equal(rows.find((r) => r.id === 'apple_wallet').state, 'needs_credentials');
  assert.ok(rows.every((r) => r.verified === false));
  const configured = integrationReadiness({ POS_BRIDGE_ENABLED: 'true', POS_ENCRYPTION_KEY: b64url(new Uint8Array(32)) });
  assert.equal(configured.find((r) => r.id === 'pos_bridge').state, 'configured_unverified');
});

test('billing cannot be activated by checkout or an unverified payment webhook', async () => {
  const env = makeEnv();
  const { owner, admin } = await setupOrg(env);
  const readiness = await owner.get('/api/owner/integrations');
  assert.equal(readiness.status, 200, readiness.text);
  assert.equal((await owner.post('/api/owner/billing/checkout', { plan: 'pro', paid: true })).status, 503);
  assert.equal((await client(env).post('/api/billing/webhook/moyasar', { status: 'paid', amount: 1 })).status, 503);
  assert.equal((await admin.get('/api/admin/integrations')).status, 200);
  assert.equal((await owner.get('/api/admin/integrations')).status, 403);
  assert.equal((await client(env).get('/api/owner/integrations')).status, 401);
});

test('invoices use tenant filtering for list and detail; no fake invoices are seeded', async () => {
  const env = makeEnv();
  const { owner } = await setupOrg(env);
  assert.deepEqual((await owner.get('/api/owner/invoices')).json.invoices, []);
  const org = await env.DB.prepare('SELECT id FROM orgs LIMIT 1').first();
  const otherId = id();
  await env.DB.prepare('INSERT INTO orgs (id,slug,name_ar,name_en,created_at) VALUES (?,?,?,?,?)').bind(otherId, 'other-invoice-org', 'آخر', 'Other', now()).run();
  const insert = (orgId, invoiceId) => env.DB.prepare("INSERT INTO subscription_invoices (id,org_id,provider,provider_reference,state,subtotal,vat,total,created_at) VALUES (?,?, 'test-fixture', ?, 'issued',10000,1500,11500,?)").bind(invoiceId, orgId, invoiceId, now()).run();
  await insert(org.id, 'own-invoice');
  await insert(otherId, 'other-invoice');
  const list = await owner.get('/api/owner/invoices');
  assert.equal(list.json.total, 1);
  assert.equal(list.json.invoices[0].id, 'own-invoice');
  assert.equal((await owner.get('/api/owner/invoices/other-invoice')).status, 404);
  assert.equal((await owner.get('/api/owner/invoices/own-invoice')).status, 200);
  assert.equal((await owner.get('/api/owner/invoices?page_size=200')).status, 400);
});

test('POS signing keys are encrypted, lists never disclose them, and disabled bridge fails closed', async () => {
  const env = bridgeEnv();
  const s = await makeConnection(env);
  const row = await env.DB.prepare('SELECT * FROM pos_connections WHERE id = ?').bind(s.connection.id).first();
  assert.notEqual(row.secret_ciphertext, s.connection.signing_secret);
  assert.equal(await decryptSigningSecret(env, row.secret_ciphertext, row.id), s.connection.signing_secret);
  await assert.rejects(decryptSigningSecret(env, row.secret_ciphertext, 'different-connection'), /pos_connection_key_unavailable/);
  const list = await s.owner.get('/api/owner/integrations');
  assert.equal(JSON.stringify(list.json).includes(s.connection.signing_secret), false);
  assert.equal(list.json.pos_connections[0].secret_ciphertext, undefined);
  assert.equal((await s.owner.post('/api/owner/pos-connections', { branch_id: s.branchId, label: 'Unverified Foodics', provider: 'foodics' })).status, 400);
  delete env.POS_BRIDGE_ENABLED;
  assert.equal((await client(env).post(s.connection.endpoint, {})).status, 503);
});

test('POS signed create and ready are scoped, retry safe and reject forged/replayed mutation', async () => {
  const env = bridgeEnv();
  const s = await makeConnection(env);
  const guest = client(env);
  const created = { id: 'event-created', type: 'order.created', external_order_id: 'pos-order-123', invoice_number: '123' };
  assert.equal((await signed(guest, s.connection, created, { signature: 'forged' })).status, 401);
  assert.equal((await signed(guest, s.connection, created, { timestamp: String(Math.floor(Date.now() / 1000) - 600) })).status, 401);
  let result = await signed(guest, s.connection, created);
  assert.equal(result.status, 202, result.text);
  assert.equal((await signed(guest, s.connection, created)).json.duplicate, true);
  assert.equal((await signed(guest, s.connection, { ...created, invoice_number: '999' })).status, 409);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM tickets').first()).n, 1);
  const ready = { id: 'event-ready', type: 'order.ready', external_order_id: 'pos-order-123' };
  result = await signed(guest, s.connection, ready);
  assert.equal(result.status, 202, result.text);
  const ticket = await env.DB.prepare('SELECT * FROM tickets WHERE id = ?').bind(result.json.ticket_id).first();
  assert.equal(ticket.status, 'ready');
  assert.equal(ticket.org_id, s.org.id);
  assert.equal(ticket.branch_id, s.branchId);
  assert.equal((await signed(guest, s.connection, ready)).json.duplicate, true);
  assert.equal((await signed(guest, s.connection, { id: 'cross-scope', type: 'order.created', external_order_id: 'bad', branch_id: 'other' })).status, 400);
  assert.equal((await s.owner.post('/api/owner/pos-connections/' + s.connection.id + '/revoke', {})).status, 200);
  assert.equal((await signed(guest, s.connection, { ...created, id: 'after-revoke', external_order_id: 'new' })).status, 404);
});

test('signature verification rejects malformed, stale and altered signed payloads', async () => {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = await hmac('test-signing-secret', timestamp + '.{"id":"one"}');
  assert.equal(await verifyBridgeSignature('test-signing-secret', timestamp, signature, '{"id":"one"}'), true);
  assert.equal(await verifyBridgeSignature('test-signing-secret', timestamp, signature, '{"id":"two"}'), false);
  assert.equal(await verifyBridgeSignature('test-signing-secret', 'not-a-date', signature, '{}'), false);
});

test('another tenant cannot bind or revoke a POS connection, and concurrent retries create one ticket', async () => {
  const env = bridgeEnv();
  const s = await makeConnection(env);
  await s.admin.post('/api/admin/orgs', { name_ar: 'منشأة أخرى', name_en: 'Other integration org', owner: { email: 'other-integrations@test.example', name: 'Other', password: 'other-owner-pass-123' } });
  const otherOwner = client(env);
  await otherOwner.login('other-integrations@test.example', 'other-owner-pass-123');
  assert.equal((await otherOwner.post('/api/owner/pos-connections', { provider: 'generic_bridge', branch_id: s.branchId, label: 'Wrong tenant' })).status, 404);
  assert.equal((await otherOwner.post('/api/owner/pos-connections/' + s.connection.id + '/revoke', {})).status, 404);
  assert.deepEqual((await otherOwner.get('/api/owner/integrations')).json.pos_connections, []);
  const event = { id: 'concurrent', type: 'order.created', external_order_id: 'concurrent-order', invoice_number: '778' };
  const [a, b] = await Promise.all([signed(client(env), s.connection, event), signed(client(env), s.connection, event)]);
  assert.deepEqual([a.status, b.status].sort(), [200, 202]);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM tickets').first()).n, 1);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM pos_events').first()).n, 1);
});
