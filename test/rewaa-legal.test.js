import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, client, setupOrg } from './helpers.js';
import { b64url, now } from '../src/util.js';
import { pollRewaa } from '../src/providers/rewaa.js';
import { sendBillingNotices } from '../src/notices.js';

const signup = (slug) => ({ name_ar: 'مقهى', name_en: 'Cafe', slug, name: 'Owner', email: `${slug}@example.test`, password: 'owner-pass-123', plan: 'pro', sector: 'cafe', accept_terms: true });

// Fake Rewaa: /authenticate needs the issued Authorization value; data calls need the idToken.
function fakeRewaa() {
  const state = { invoices: [], auths: 0, tokenValid: true };
  const HTTP_FETCH = async (url, init = {}) => {
    const u = new URL(url);
    if (u.pathname === '/authenticate') {
      const b = JSON.parse(init.body);
      if (init.headers.authorization !== 'issued-by-rewaa' || b.password !== 'rw-pass') return Response.json({ message: 'no' }, { status: 401 });
      state.auths++; state.tokenValid = true;
      return Response.json({ idToken: 'id-' + state.auths, refreshToken: 'r' });
    }
    if (!state.tokenValid || init.headers.authorization !== 'id-' + state.auths) return Response.json({ message: 'expired' }, { status: 401 });
    if (u.pathname === '/stock-location') return Response.json({ data: [{ id: 77, name: 'فرع حائل', code: 'HAIL', isActive: true }] });
    if (u.pathname === '/pos/invoices') return Response.json({ data: state.invoices });
    return Response.json({}, { status: 404 });
  };
  return { state, env: { HTTP_FETCH, REWAA_ENABLED: 'true', POS_ENCRYPTION_KEY: b64url(new Uint8Array(32).fill(5)) } };
}
const creds = { email: 'api@cafe.test', password: 'rw-pass', authorization: 'issued-by-rewaa' };

test('Rewaa: credentials are verified and encrypted, sales open one ticket each, other locations and old sales are ignored', async () => {
  const r = fakeRewaa(); const env = makeEnv(r.env); const c = client(env);
  await c.post('/api/register', signup('rw-cafe'));
  const branch = await env.DB.prepare('SELECT id FROM branches LIMIT 1').first();
  assert.equal((await c.post('/api/owner/rewaa/locations', { ...creds, password: 'wrong' })).status, 502);
  const locs = await c.post('/api/owner/rewaa/locations', creds);
  assert.equal(locs.status, 200, locs.text);
  assert.equal(locs.json.locations[0].id, '77');
  const made = await c.post('/api/owner/rewaa-connections', { ...creds, branch_id: branch.id, location_id: '77', label: 'Hail' });
  assert.equal(made.status, 201, made.text);
  assert.equal((await c.post('/api/owner/rewaa-connections', { ...creds, branch_id: branch.id, location_id: '77' })).status, 409);
  const row = await env.DB.prepare('SELECT * FROM rewaa_connections').first();
  assert.equal(row.credentials_ciphertext.includes('rw-pass'), false);
  const list = await c.get('/api/owner/rewaa-connections');
  assert.equal(JSON.stringify(list.json).includes('ciphertext'), false);

  const iso = (ms) => new Date(ms).toISOString();
  await env.DB.prepare('UPDATE rewaa_connections SET since = ?').bind(now() - 60000).run();
  r.state.invoices = [
    { id: 1, invoiceNumber: 'INV-1001', stockLocationId: 77, status: 'Completed', createdAt: iso(now() - 1000) },
    { id: 2, invoiceNumber: 'INV-1002', stockLocationId: 99, status: 'Completed', createdAt: iso(now() - 1000) },
    { id: 3, invoiceNumber: 'INV-0999', stockLocationId: 77, status: 'Completed', createdAt: iso(now() - 3600000) },
    { id: 4, invoiceNumber: 'INV-1003', stockLocationId: 77, status: 'Cancelled', createdAt: iso(now() - 1000) },
  ];
  await pollRewaa(env);
  let tickets = (await env.DB.prepare('SELECT number, invoice_number, status FROM tickets ORDER BY created_at').all()).results;
  assert.deepEqual(tickets.map((t) => t.invoice_number), ['INV-1001']);
  assert.equal(tickets[0].status, 'preparing');
  // Expired token is refreshed transparently; the same invoice never opens a second ticket.
  r.state.tokenValid = false;
  r.state.invoices.push({ id: 5, invoiceNumber: 'INV-1004', stockLocationId: '77', createdAt: iso(now()) });
  await env.DB.prepare('UPDATE rewaa_connections SET last_polled_at = 0').run();
  await pollRewaa(env);
  tickets = (await env.DB.prepare('SELECT number, invoice_number FROM tickets ORDER BY CAST(number AS INTEGER)').all()).results;
  assert.deepEqual(tickets.map((t) => t.invoice_number), ['INV-1001', 'INV-1004']);
  assert.deepEqual(tickets.map((t) => t.number), ['1', '2']);
  const conn = await env.DB.prepare('SELECT imported, last_error FROM rewaa_connections').first();
  assert.equal(conn.imported, 2);
  assert.equal(conn.last_error, null);
  assert.equal((await c.post(`/api/owner/rewaa-connections/${made.json.id}/revoke`)).status, 200);
  assert.equal((await env.DB.prepare('SELECT credentials_ciphertext FROM rewaa_connections').first()).credentials_ciphertext, '');
});

test('Rewaa: disabled feature and other tenants fail closed', async () => {
  const env = makeEnv(); const c = client(env);
  await c.post('/api/register', signup('rw-off'));
  assert.equal((await c.post('/api/owner/rewaa/locations', creds)).status, 503);
  const r = fakeRewaa(); const env2 = makeEnv(r.env); const a = client(env2, '2.2.2.2'); const b = client(env2, '3.3.3.3');
  await a.post('/api/register', signup('rw-a')); await b.post('/api/register', signup('rw-b'));
  const branchA = await env2.DB.prepare("SELECT b.id FROM branches b JOIN orgs o ON o.id = b.org_id WHERE o.slug = 'rw-a'").first();
  assert.equal((await b.post('/api/owner/rewaa-connections', { ...creds, branch_id: branchA.id, location_id: '77' })).status, 404);
  const made = await a.post('/api/owner/rewaa-connections', { ...creds, branch_id: branchA.id, location_id: '77' });
  assert.equal((await b.post(`/api/owner/rewaa-connections/${made.json.id}/revoke`)).status, 404);
});

test('legal details are admin-editable, validated, and public; owners keep their own billing profile', async () => {
  const env = makeEnv(); const { owner, admin } = await setupOrg(env);
  assert.deepEqual(Object.values((await client(env).get('/api/legal')).json.legal).filter(Boolean), []);
  assert.equal((await owner.raw('PUT', '/api/admin/legal', { legal_name_ar: 'x' })).status, 403);
  assert.equal((await admin.put('/api/admin/legal', { vat_number: '123' })).status, 400);
  assert.equal((await admin.put('/api/admin/legal', { legal_name_ar: 'مؤسسة زيمارا', cr_number: '1010123456' })).status, 200);
  assert.equal((await client(env).get('/api/legal')).json.legal.legal_name_ar, 'مؤسسة زيمارا');
  assert.equal((await owner.put('/api/owner/billing-profile', { billing_vat_number: '300000000000003', billing_legal_name: 'مقهى' })).status, 200);
  assert.equal((await owner.put('/api/owner/billing-profile', { billing_vat_number: '12' })).status, 400);
  assert.equal((await owner.get('/api/owner/billing-profile')).json.profile.billing_legal_name, 'مقهى');
});

test('trial and renewal reminders are sent once per period', async () => {
  const mails = [];
  const env = makeEnv({ RESEND_API_KEY: 're', MAIL_FROM: 'ZIMARA <no-reply@zimara.co>', PUBLIC_BASE_URL: 'https://menu.test',
    HTTP_FETCH: async (_u, init) => { mails.push(JSON.parse(init.body)); return Response.json({ id: 'm' }); } });
  const c = client(env);
  await c.post('/api/register', signup('rem-cafe'));
  mails.length = 0;
  await env.DB.prepare('UPDATE subscriptions SET trial_ends_at = ?').bind(now() + 2 * 86400000).run();
  await sendBillingNotices(env); await sendBillingNotices(env);
  assert.equal(mails.length, 1);
  assert.match(mails[0].subject, /تجربتك/);
  await env.DB.prepare("UPDATE subscriptions SET status = 'active', current_period_end = ?").bind(now() + 12 * 3600000).run();
  await sendBillingNotices(env); await sendBillingNotices(env);
  assert.equal(mails.length, 2);
  assert.match(mails[1].html, /جدّد الآن/);
});
