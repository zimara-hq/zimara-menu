import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, client } from './helpers.js';
import { settleCheckout } from '../src/billing.js';
import { send } from '../src/mail.js';
import { createSimpleFatooraInvoice, findSimpleFatooraInvoice, simpleFatooraConfigured } from '../src/providers/simple-fatoora.js';

const gateway = { MOYASAR_SECRET_KEY: 'test-key', MOYASAR_WEBHOOK_SECRET: 'test-hook', PUBLIC_BASE_URL: 'https://menu.test' };
const invoicing = { SIMPLE_FATOORA_ENABLED: 'true', SIMPLE_FATOORA_SELLER_PROFILE_APPROVED: 'true', SIMPLE_FATOORA_API_KEY: 'test-sandbox', SIMPLE_FATOORA_ENV: 'sandbox' };
async function pendingCheckout() {
  const env = makeEnv({ ...gateway, HTTP_FETCH: async () => Response.json({ id: 'provider-1', amount: 12900, currency: 'SAR', status: 'paid' }) });
  const owner = client(env);
  await owner.post('/api/register', { name_ar: 'مقهى', name_en: 'Cafe', slug: 'atomic-cafe', name: 'Owner', email: 'owner@example.test', password: 'owner-password-123', plan: 'basic', sector: 'cafe', accept_terms: true });
  const org = await env.DB.prepare('SELECT id FROM orgs LIMIT 1').first();
  await env.DB.prepare("INSERT INTO billing_checkouts (id,org_id,plan,cycle,provider,provider_invoice_id,subtotal,vat,total,status,created_at) VALUES ('checkout-1',?,'basic','monthly','moyasar','provider-1',12900,0,12900,'pending',?)").bind(org.id, Date.now()).run();
  return { env, checkout: await env.DB.prepare("SELECT * FROM billing_checkouts WHERE id = 'checkout-1'").first() };
}

test('paid settlement rolls back every write when invoice outbox fails, then recovers on retry', async () => {
  const { env, checkout } = await pendingCheckout();
  const before = await env.DB.prepare('SELECT * FROM subscriptions WHERE org_id = ?').bind(checkout.org_id).first();
  env.DB.raw.exec("CREATE TRIGGER fail_invoice_job BEFORE INSERT ON subscription_invoice_jobs BEGIN SELECT RAISE(ABORT, 'temporary_outbox_failure'); END");
  await assert.rejects(settleCheckout(env, checkout), /temporary_outbox_failure/);
  assert.equal((await env.DB.prepare('SELECT status FROM billing_checkouts WHERE id = ?').bind(checkout.id).first()).status, 'pending');
  assert.deepEqual(await env.DB.prepare('SELECT * FROM subscriptions WHERE org_id = ?').bind(checkout.org_id).first(), before);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM subscription_invoices').first()).n, 0);
  env.DB.raw.exec('DROP TRIGGER fail_invoice_job');
  const result = await settleCheckout(env, checkout);
  assert.equal(result.status, 'paid');
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM subscription_invoice_jobs').first()).n, 1);
});

test('concurrent payment settlement extends a subscription once and preserves paid renewal time', async () => {
  const { env, checkout } = await pendingCheckout();
  const existingEnd = Date.now() + 5 * 86400000;
  await env.DB.prepare("UPDATE subscriptions SET status = 'active', current_period_end = ?, cancel_at_period_end = 1 WHERE org_id = ?").bind(existingEnd, checkout.org_id).run();
  await Promise.all([settleCheckout(env, checkout), settleCheckout(env, checkout), settleCheckout(env, checkout)]);
  const sub = await env.DB.prepare('SELECT * FROM subscriptions WHERE org_id = ?').bind(checkout.org_id).first();
  assert.equal(sub.current_period_end, existingEnd + 30 * 86400000);
  assert.equal(sub.cancel_at_period_end, 0);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM subscription_invoices').first()).n, 1);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM subscription_invoice_jobs').first()).n, 1);
});

test('missing payment/mail keys cause no outbound request and network failure has stable provider errors', async () => {
  let calls = 0;
  const HTTP_FETCH = async () => { calls++; throw new Error('private upstream diagnostic'); };
  await assert.rejects(send({ HTTP_FETCH }, 'owner@example.test', 'Subject', [], 'https://menu.test', 'Open'), (e) => e.status === 503 && e.message === 'mail_not_configured');
  await assert.rejects(settleCheckout({ HTTP_FETCH }, { status: 'pending', provider_invoice_id: 'invoice' }), (e) => e.status === 503 && e.message === 'billing_not_configured');
  assert.equal(calls, 0);
  await assert.rejects(send({ HTTP_FETCH, RESEND_API_KEY: 'test', MAIL_FROM: 'hello@example.test', PUBLIC_BASE_URL: 'https://menu.test' }, 'owner@example.test', 'Subject', [], 'https://menu.test', 'Open'), (e) => e.status === 502 && e.message === 'mail_provider_error');
  assert.equal(calls, 1);
});

test('invoice issuance needs explicit environment, and missing provider environment is ambiguous', async () => {
  assert.equal(simpleFatooraConfigured({ ...invoicing, SIMPLE_FATOORA_ENV: undefined }), false);
  assert.equal(simpleFatooraConfigured({ ...invoicing, SIMPLE_FATOORA_ENV: 'production' }), false);
  const response = { id: 17, invoice_number: 'INV-17', total: 129, reference_number: 'stable-ref' };
  const env = { ...invoicing, HTTP_FETCH: async (url) => Response.json({ status: true, response: url.endsWith('get_all') ? { invoices: [response] } : response }) };
  await assert.rejects(createSimpleFatooraInvoice(env, {}), (e) => e.kind === 'unknown' && e.message === 'simple_fatoora_environment_mismatch');
  assert.deepEqual(await findSimpleFatooraInvoice(env, 'stable-ref'), { ambiguous: true });
});

test('malformed successful invoice response remains unknown for reconciliation', async () => {
  const env = { ...invoicing, HTTP_FETCH: async () => new Response('not-json', { status: 200 }) };
  await assert.rejects(createSimpleFatooraInvoice(env, {}), (e) => e.kind === 'unknown');
});

test('payment receipt outbox survives missing mail config, timeout and changed account details', async () => {
  const { processReceiptOutbox } = await import('../src/receipt-outbox.js');
  const { env, checkout } = await pendingCheckout();
  await settleCheckout(env, checkout);
  const original = await env.DB.prepare('SELECT * FROM subscription_receipt_jobs').first();
  assert.equal(original.state, 'pending');
  assert.deepEqual(await processReceiptOutbox(env), { configured: false, processed: 0 });
  assert.equal((await env.DB.prepare('SELECT attempts FROM subscription_receipt_jobs').first()).attempts, 0);
  Object.assign(env, { RESEND_API_KEY: 'test', MAIL_FROM: 'hello@example.test' });
  const requests = [], accepted = new Map();
  env.HTTP_FETCH = async (url, init) => {
    assert.equal(url, 'https://api.resend.com/emails');
    const key = init.headers['Idempotency-Key'];
    requests.push({ key, body: JSON.parse(init.body) });
    if (!accepted.has(key)) {
      accepted.set(key, 'provider-receipt-1');
      throw new Error('timeout after upstream accepted');
    }
    return Response.json({ id: accepted.get(key) });
  };
  await processReceiptOutbox(env);
  const failed = await env.DB.prepare('SELECT * FROM subscription_receipt_jobs').first();
  assert.equal(failed.state, 'pending');
  assert.equal(failed.attempts, 1);
  assert.ok(failed.next_attempt_at > Date.now());
  // Changing the live profile, renewal period or configured base cannot change a queued receipt.
  await env.DB.prepare("UPDATE users SET email = 'changed@example.test', name = 'Changed' WHERE id = ?").bind(original.user_id).run();
  await env.DB.prepare('UPDATE subscriptions SET current_period_end = ? WHERE org_id = ?').bind(Date.now() + 90 * 86400000, checkout.org_id).run();
  env.PUBLIC_BASE_URL = 'https://changed.example.test';
  env.MAIL_FROM = 'changed-sender@example.test';
  await env.DB.prepare('UPDATE subscription_receipt_jobs SET next_attempt_at = 0').run();
  await Promise.all([processReceiptOutbox(env), processReceiptOutbox(env)]);
  assert.equal(accepted.size, 1);
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[1], requests[0]);
  assert.deepEqual(requests[1].body.to, [original.recipient_email]);
  const sent = await env.DB.prepare('SELECT * FROM subscription_receipt_jobs').first();
  assert.equal(sent.state, 'sent');
  assert.equal(sent.provider_message_id, 'provider-receipt-1');
  await processReceiptOutbox(env);
  assert.equal(requests.length, 2);
});

test('receipt jobs are atomic with payment and pause ambiguous delivery outside provider idempotency window', async () => {
  const { processReceiptOutbox } = await import('../src/receipt-outbox.js');
  const { env, checkout } = await pendingCheckout();
  env.DB.raw.exec("CREATE TRIGGER fail_receipt_job BEFORE INSERT ON subscription_receipt_jobs BEGIN SELECT RAISE(ABORT, 'receipt_outbox_failure'); END");
  await assert.rejects(settleCheckout(env, checkout), /receipt_outbox_failure/);
  assert.equal((await env.DB.prepare('SELECT status FROM billing_checkouts').first()).status, 'pending');
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM subscription_invoice_jobs').first()).n, 0);
  env.DB.raw.exec('DROP TRIGGER fail_receipt_job');
  await settleCheckout(env, checkout);
  const yesterday = Date.now() - 24 * 3600000;
  await env.DB.prepare("UPDATE subscription_receipt_jobs SET state = 'sending', locked_at = ?, first_attempt_at = ?").bind(yesterday, yesterday).run();
  Object.assign(env, { RESEND_API_KEY: 'test', MAIL_FROM: 'hello@example.test', HTTP_FETCH: async () => { throw new Error('must not resend'); } });
  const result = await processReceiptOutbox(env);
  assert.equal(result.processed, 0);
  const job = await env.DB.prepare('SELECT * FROM subscription_receipt_jobs').first();
  assert.equal(job.state, 'unknown');
  assert.equal(job.last_error, 'idempotency_window_elapsed');
});

test('password recovery provider outages do not reveal whether an account exists', async () => {
  const { env } = await pendingCheckout();
  let calls = 0;
  Object.assign(env, { RESEND_API_KEY: 'test', MAIL_FROM: 'hello@example.test', HTTP_FETCH: async () => { calls++; throw new Error('provider unavailable'); } });
  const known = await client(env, '6.6.6.6').post('/api/password/forgot', { email: 'owner@example.test' });
  const unknown = await client(env, '7.7.7.7').post('/api/password/forgot', { email: 'nobody@example.test' });
  assert.equal(known.status, 200);
  assert.equal(unknown.status, known.status);
  assert.deepEqual(unknown.json, known.json);
  assert.equal(calls, 1);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'password.reset_delivery_failed'").first()).n, 1);
});
