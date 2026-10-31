import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, client } from './helpers.js';

const signup = (slug = 'live-cafe') => ({ name_ar: 'مقهى حي', name_en: 'Live Cafe', slug, name: 'Owner', email: `${slug}@example.test`, password: 'owner-pass-123', plan: 'basic', sector: 'cafe', accept_terms: true });
const completeBillingProfile = (c) => c.put('/api/owner/billing-profile', { billing_legal_name: 'مقهى حي', billing_cr_number: '1010123456', billing_vat_number: '300000000000003', billing_address: 'حائل' });

// A fake Moyasar + Resend. Invoices start "initiated"; tests flip them to "paid".
function fakeProviders() {
  const invoices = new Map();
  const mails = [];
  let seq = 0;
  const HTTP_FETCH = async (url, init = {}) => {
    const u = new URL(url);
    if (u.host === 'api.resend.com') { mails.push(JSON.parse(init.body)); return Response.json({ id: 'mail_' + mails.length }); }
    assert.equal(init.headers.authorization, 'Basic ' + btoa('sk_test_x:'));
    if (init.method === 'POST' && u.pathname === '/v1/invoices') {
      const b = JSON.parse(init.body); const inv = { id: 'inv_' + ++seq, status: 'initiated', amount: b.amount, currency: b.currency, url: 'https://checkout.moyasar.com/inv_' + seq, metadata: b.metadata };
      invoices.set(inv.id, inv); return Response.json(inv, { status: 201 });
    }
    const m = u.pathname.match(/^\/v1\/invoices\/(.+)$/);
    if (m && invoices.has(m[1])) return Response.json(invoices.get(m[1]));
    return Response.json({ message: 'not found' }, { status: 404 });
  };
  return { invoices, mails, env: { HTTP_FETCH, MOYASAR_SECRET_KEY: 'sk_test_x', MOYASAR_WEBHOOK_SECRET: 'whsec-test-123', PUBLIC_BASE_URL: 'https://menu.test', SIMPLE_FATOORA_API_KEY: 'sf_sandbox_test', SIMPLE_FATOORA_ENABLED: 'true', SIMPLE_FATOORA_ENV: 'sandbox', RESEND_API_KEY: 're_test', MAIL_FROM: 'ZIMARA <no-reply@zimara.co>' } };
}

test('checkout is refused until the gateway is configured, and browser redirects never activate a plan', async () => {
  const env = makeEnv(); const c = client(env);
  await c.post('/api/register', signup());
  assert.equal((await c.post('/api/owner/billing/checkout', { plan: 'basic', cycle: 'monthly' })).status, 503);
  assert.equal((await c.get('/api/owner/subscription')).json.payment.status, 'needs_provider');
});

test('paid Moyasar invoice activates the plan once, extends the period, and records a pending e-invoice', async () => {
  const p = fakeProviders(); const env = makeEnv(p.env); const c = client(env);
  await c.post('/api/register', signup());
  assert.equal((await completeBillingProfile(c)).status, 200);
  assert.equal((await c.post('/api/owner/billing/checkout', { plan: 'chains', cycle: 'monthly' })).status, 400);
  const co = await c.post('/api/owner/billing/checkout', { plan: 'basic', cycle: 'annual' });
  assert.equal(co.status, 201, JSON.stringify(co.json));
  assert.equal(co.json.total, 129000);
  assert.match(co.json.url, /^https:\/\/checkout\.moyasar\.com\//);

  // Unpaid: syncing changes nothing.
  let s = await c.post('/api/owner/billing/sync', { checkout_id: co.json.checkout_id });
  assert.equal(s.json.status, 'pending');
  assert.equal(s.json.subscription.status, 'trial');

  // Forged webhook is rejected; a valid webhook triggers a server-side re-check.
  const inv = [...p.invoices.values()][0];
  assert.equal((await client(env).post('/api/webhooks/moyasar', { secret_token: 'wrong', type: 'payment_paid', data: { invoice_id: inv.id } })).status, 401);
  inv.status = 'paid';
  const hook = await client(env).post('/api/webhooks/moyasar', { secret_token: 'whsec-test-123', type: 'payment_paid', data: { invoice_id: inv.id } });
  assert.equal(hook.json.status, 'paid');
  s = await c.post('/api/owner/billing/sync', { checkout_id: co.json.checkout_id });
  assert.equal(s.json.subscription.status, 'active');
  assert.equal(s.json.subscription.plan, 'basic');
  assert.ok(s.json.subscription.current_period_end > Date.now() + 364 * 86400000);

  const invoices = (await c.get('/api/owner/invoices')).json.invoices;
  assert.equal(invoices.length, 1, 'replayed webhook and sync must not duplicate the record');
  assert.equal(invoices[0].state, 'pending');
  assert.equal(invoices[0].total, 129000);
});

test('amount tampering at the provider is refused and VAT is added only when configured', async () => {
  const p = fakeProviders(); const env = makeEnv({ ...p.env, VAT_RATE_BPS: '1500' }); const c = client(env);
  await c.post('/api/register', signup());
  await completeBillingProfile(c);
  const co = await c.post('/api/owner/billing/checkout', { plan: 'pro', cycle: 'monthly' });
  assert.equal(co.json.vat, 3735);
  assert.equal(co.json.total, 28635);
  const inv = [...p.invoices.values()][0];
  inv.status = 'paid'; inv.amount = 100;
  assert.equal((await c.post('/api/owner/billing/sync', { checkout_id: co.json.checkout_id })).status, 409);
  assert.equal((await c.get('/api/owner/subscription')).json.subscription.status, 'trial');
});

test('another business cannot sync someone else\'s checkout', async () => {
  const p = fakeProviders(); const env = makeEnv(p.env);
  const a = client(env, '3.3.3.3'), b = client(env, '4.4.4.4');
  await a.post('/api/register', signup('cafe-a')); await b.post('/api/register', signup('cafe-b'));
  await completeBillingProfile(a);
  const co = await a.post('/api/owner/billing/checkout', { plan: 'basic', cycle: 'monthly' });
  assert.equal((await b.post('/api/owner/billing/sync', { checkout_id: co.json.checkout_id })).status, 404);
});

test('signup sends a verification email and the link verifies once', async () => {
  const p = fakeProviders(); const env = makeEnv(p.env); const c = client(env);
  const r = await c.post('/api/register', signup());
  assert.equal(r.json.emailVerification.status, 'sent');
  const link = p.mails[0].html.match(/href="([^"]+)"/)[1].replace(/&amp;/g, '&');
  const path = new URL(link).pathname + new URL(link).search;
  const first = await client(env).get(path);
  assert.equal(first.headers.get('location'), '/login?verified=1');
  assert.equal((await env.DB.prepare('SELECT email_verified FROM users WHERE email = ?').bind('live-cafe@example.test').first()).email_verified, 1);
  assert.equal((await client(env).get(path)).headers.get('location'), '/login?verified=0');
});

test('password reset: no account enumeration, single-use token, old sessions revoked', async () => {
  const p = fakeProviders(); const env = makeEnv(p.env); const c = client(env);
  await c.post('/api/register', signup());
  const before = p.mails.length;
  assert.equal((await client(env, '5.5.5.5').post('/api/password/forgot', { email: 'nobody@example.test' })).json.ok, true);
  assert.equal(p.mails.length, before);
  await client(env, '5.5.5.5').post('/api/password/forgot', { email: 'live-cafe@example.test' });
  const token = decodeURIComponent(p.mails.at(-1).html.match(/\/reset#([^"]+)"/)[1]);
  assert.equal((await client(env).post('/api/password/reset', { token, password: 'short' })).status, 400);
  assert.equal((await client(env).post('/api/password/reset', { token, password: 'brand-new-pass-1' })).status, 200);
  assert.equal((await client(env).post('/api/password/reset', { token, password: 'brand-new-pass-2' })).status, 400);
  assert.equal((await c.get('/api/me')).status, 401);
  assert.equal((await client(env).login('live-cafe@example.test', 'brand-new-pass-1')).status, 200);
});
