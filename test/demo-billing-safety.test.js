import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, client } from './helpers.js';
import { settleCheckout, reconcileCheckouts, isDemoBillingOrg } from '../src/billing.js';

const configured = {
  MOYASAR_SECRET_KEY: 'test-secret', MOYASAR_WEBHOOK_SECRET: 'test-webhook', PUBLIC_BASE_URL: 'https://menu.test',
  SIMPLE_FATOORA_API_KEY: 'test-sandbox', SIMPLE_FATOORA_ENABLED: 'true',
  SIMPLE_FATOORA_SELLER_PROFILE_APPROVED: 'true', SIMPLE_FATOORA_ENV: 'sandbox',
};
const billingProfile = { billing_legal_name: 'Sample business', billing_address: 'Sample address' };
async function demoOwner(env) {
  const owner = client(env);
  const room = await owner.post('/api/demo');
  assert.equal(room.status, 201);
  assert.equal((await owner.post(`/api/demo/${room.json.token}/session`, { role: 'owner' })).status, 200);
  assert.equal((await owner.put('/api/owner/billing-profile', billingProfile)).status, 200);
  return owner;
}

test('fully configured providers cannot enable checkout or sync for synthetic room owners', async () => {
  let providerCalls = 0;
  const env = makeEnv({ ...configured, HTTP_FETCH: async () => { providerCalls++; throw new Error('demo must never reach a provider'); } });
  const owner = await demoOwner(env);
  assert.equal((await owner.get('/api/owner/subscription')).json.payment.status, 'demo_unavailable');
  const checkout = await owner.post('/api/owner/billing/checkout', { plan: 'basic', cycle: 'monthly' });
  assert.equal(checkout.status, 403);
  assert.equal(checkout.json.error, 'demo_billing_unavailable');
  const sync = await owner.post('/api/owner/billing/sync', { checkout_id: 'forged' });
  assert.equal(sync.status, 403);
  assert.equal(sync.json.error, 'demo_billing_unavailable');
  assert.equal(providerCalls, 0);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM billing_checkouts').first()).n, 0);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM subscription_invoice_jobs').first()).n, 0);
  // The room remains synthetic after its expiry timestamp: no conversion to a paid account.
  const demo = await env.DB.prepare('SELECT org_id FROM demo_rooms').first();
  await env.DB.prepare('UPDATE demo_rooms SET expires_at = 0').run();
  assert.equal(await isDemoBillingOrg(env, demo.org_id), true);
  const expiredCheckout = await owner.post('/api/owner/billing/checkout', { plan: 'basic', cycle: 'annual' });
  assert.ok([401, 403, 410].includes(expiredCheckout.status), JSON.stringify(expiredCheckout.json));
  assert.equal(providerCalls, 0);
});

test('legacy demo checkout cannot contact providers through webhook, cron or direct settlement', async () => {
  let providerCalls = 0;
  const env = makeEnv({ ...configured, HTTP_FETCH: async () => { providerCalls++; throw new Error('demo must never reach a provider'); } });
  const owner = await demoOwner(env);
  const room = await env.DB.prepare('SELECT org_id FROM demo_rooms').first();
  await env.DB.prepare("INSERT INTO billing_checkouts (id,org_id,plan,cycle,provider,provider_invoice_id,subtotal,vat,total,status,created_at) VALUES ('legacy-demo',?,'basic','monthly','moyasar','legacy-invoice',12900,0,12900,'pending',?)").bind(room.org_id, Date.now()).run();
  const checkout = await env.DB.prepare("SELECT * FROM billing_checkouts WHERE id = 'legacy-demo'").first();
  await assert.rejects(settleCheckout(env, checkout), (error) => error.status === 403 && error.message === 'demo_billing_unavailable');
  const hook = await client(env).post('/api/webhooks/moyasar', { secret_token: configured.MOYASAR_WEBHOOK_SECRET, type: 'payment_paid', data: { invoice_id: checkout.provider_invoice_id } });
  assert.equal(hook.status, 403);
  assert.equal(hook.json.error, 'demo_billing_unavailable');
  await reconcileCheckouts(env);
  assert.equal((await owner.get('/api/owner/subscription')).json.subscription.status, 'trial');
  assert.equal((await env.DB.prepare("SELECT status FROM billing_checkouts WHERE id = 'legacy-demo'").first()).status, 'pending');
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM subscription_invoices').first()).n, 0);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM subscription_receipt_jobs').first()).n, 0);
  delete env.MOYASAR_SECRET_KEY;
  delete env.SIMPLE_FATOORA_API_KEY;
  assert.equal((await owner.post('/api/owner/billing/checkout', { plan: 'basic', cycle: 'monthly' })).status, 403);
  assert.equal((await owner.post('/api/owner/billing/sync', { checkout_id: checkout.id })).status, 403);
  await assert.rejects(settleCheckout(env, checkout), (error) => error.status === 403 && error.message === 'demo_billing_unavailable');
  assert.equal(providerCalls, 0);
});

test('normal business owners retain available checkout with the same configured providers', async () => {
  const paths = [];
  const env = makeEnv({ ...configured, HTTP_FETCH: async (url) => {
    paths.push(url);
    if (url.endsWith('/sdk/users/validate_user_api_key')) return Response.json({ status: true, response: { sandbox_api_key: configured.SIMPLE_FATOORA_API_KEY } });
    assert.equal(url, 'https://api.moyasar.com/v1/invoices');
    return Response.json({ id: 'normal-invoice', url: 'https://checkout.moyasar.com/normal-invoice' });
  } });
  const owner = client(env);
  assert.equal((await owner.post('/api/register', { name_ar: 'مقهى', name_en: 'Cafe', slug: 'real-business', name: 'Owner', email: 'real@example.test', password: 'owner-password-123', plan: 'basic', sector: 'cafe', accept_terms: true })).status, 201);
  assert.equal((await owner.put('/api/owner/billing-profile', billingProfile)).status, 200);
  assert.equal((await owner.get('/api/owner/subscription')).json.payment.status, 'available');
  assert.equal(paths.length, 0);
  assert.equal((await owner.post('/api/owner/billing/checkout', { plan: 'basic', cycle: 'monthly' })).status, 201);
  assert.equal(paths.length, 2);
});
