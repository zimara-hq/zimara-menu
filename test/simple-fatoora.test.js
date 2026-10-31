import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, setupOrg } from './helpers.js';
import { now } from '../src/util.js';
import { processSimpleFatooraInvoices, simpleFatooraConfigured } from '../src/providers/simple-fatoora.js';
import { integrationReadiness } from '../src/integrations.js';

const configured = {
  SIMPLE_FATOORA_API_KEY: 'sandbox-test-key',
  SIMPLE_FATOORA_ENABLED: 'true',
  SIMPLE_FATOORA_ENV: 'sandbox',
};

async function seedInvoice(env, owner, checkoutId = 'checkout-test') {
  const org = await env.DB.prepare('SELECT id FROM orgs LIMIT 1').first();
  await owner.put('/api/owner/billing-profile', {
    billing_legal_name: 'مقهى الاختبار',
    billing_address: 'حائل',
    billing_cr_number: '1010123456',
  });
  const t = now(), invoiceId = 'invoice-' + checkoutId, paymentRef = 'pay-' + checkoutId;
  await env.DB.batch([
    env.DB.prepare("INSERT INTO billing_checkouts (id,org_id,plan,cycle,provider,provider_invoice_id,subtotal,vat,total,status,created_at,paid_at) VALUES (?,?, 'basic','monthly','moyasar',?,12900,0,12900,'paid',?,?)")
      .bind(checkoutId, org.id, paymentRef, t, t),
    env.DB.prepare("INSERT INTO subscription_invoices (id,org_id,provider,provider_reference,state,currency,subtotal,vat,total,created_at) VALUES (?,?, 'simple_fatoora',?,'pending','SAR',12900,0,12900,?)")
      .bind(invoiceId, org.id, paymentRef, t),
    env.DB.prepare("INSERT INTO subscription_invoice_jobs (invoice_id,payment_reference,reference_number,state,next_attempt_at,created_at,updated_at) VALUES (?,?,?,'pending',?,?,?)")
      .bind(invoiceId, paymentRef, 'ZM-SUB-' + checkoutId, t, t, t),
  ]);
  return { invoiceId, paymentRef, reference: 'ZM-SUB-' + checkoutId };
}

test('Simple Fatoora stays disabled without an explicit server key and environment', () => {
  assert.equal(simpleFatooraConfigured({}), false);
  assert.equal(simpleFatooraConfigured({ ...configured, SIMPLE_FATOORA_ENV: 'live' }), false);
  assert.equal(simpleFatooraConfigured({ ...configured, SIMPLE_FATOORA_ENV: 'live', SIMPLE_FATOORA_LIVE_ISSUING_ENABLED: 'true' }), true);
  const ready = integrationReadiness({ ...configured, MOYASAR_SECRET_KEY: 'moyasar', MOYASAR_WEBHOOK_SECRET: 'webhook', PUBLIC_BASE_URL: 'https://menu.example' });
  assert.equal(ready.find((r) => r.id === 'simple_fatoora').state, 'configured_unverified');
  assert.equal(ready.find((r) => r.id === 'payments').state, 'configured_unverified');
});

test('verified paid subscription invoice is issued once and never exposes the API key', async () => {
  const calls = [];
  const env = makeEnv({
    ...configured,
    HTTP_FETCH: async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ status: true, response: { id: 732, invoice_number: 'INV-732', invoice: 'https://simplefatoora.test/invoice/732.pdf', environment: 'sandbox' } }), { status: 200 });
    },
  });
  const { owner } = await setupOrg(env);
  const seeded = await seedInvoice(env, owner);
  const result = await processSimpleFatooraInvoices(env);
  assert.equal(result.processed, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.simplefatoora.com/sdk/invoice/create');
  assert.equal(calls[0].init.headers['X-API-Key'], configured.SIMPLE_FATOORA_API_KEY);
  const payload = JSON.parse(calls[0].init.body);
  assert.equal(payload.reference_number, seeded.reference);
  assert.equal(payload.invoice_type, 0);
  assert.equal(payload.client_name, 'مقهى الاختبار');
  assert.equal(payload.client_address, 'حائل');
  assert.equal(payload.invoice_detail[0].unit_price, 129);
  assert.equal(JSON.stringify(payload).includes(configured.SIMPLE_FATOORA_API_KEY), false);
  const invoice = await env.DB.prepare('SELECT * FROM subscription_invoices WHERE id = ?').bind(seeded.invoiceId).first();
  const job = await env.DB.prepare('SELECT * FROM subscription_invoice_jobs WHERE invoice_id = ?').bind(seeded.invoiceId).first();
  assert.equal(invoice.state, 'issued');
  assert.equal(invoice.provider, 'simple_fatoora');
  assert.equal(invoice.provider_reference, '732');
  assert.equal(invoice.number, 'INV-732');
  assert.equal(invoice.pdf_url, 'https://simplefatoora.test/invoice/732.pdf');
  assert.equal(job.state, 'issued');
  await processSimpleFatooraInvoices(env);
  assert.equal(calls.length, 1);
});

test('ambiguous create is reconciled by stable reference, never blindly issued twice', async () => {
  const paths = [];
  let creates = 0;
  const env = makeEnv({
    ...configured,
    HTTP_FETCH: async (url) => {
      paths.push(url);
      if (url.endsWith('/sdk/invoice/create')) {
        creates++;
        return new Response('temporary failure', { status: 503 });
      }
      return new Response(JSON.stringify({ status: true, response: { invoices: [{
        id: 901, invoice_number: 'INV-901', invoice: 'https://simplefatoora.test/invoice/901.pdf',
        reference_number: 'ZM-SUB-checkout-unknown', environment: 'sandbox',
      }] } }), { status: 200 });
    },
  });
  const { owner } = await setupOrg(env);
  const seeded = await seedInvoice(env, owner, 'checkout-unknown');
  await processSimpleFatooraInvoices(env);
  assert.equal((await env.DB.prepare('SELECT state FROM subscription_invoice_jobs WHERE invoice_id = ?').bind(seeded.invoiceId).first()).state, 'unknown');
  await processSimpleFatooraInvoices(env);
  const invoice = await env.DB.prepare('SELECT * FROM subscription_invoices WHERE id = ?').bind(seeded.invoiceId).first();
  assert.equal(invoice.state, 'issued');
  assert.equal(invoice.number, 'INV-901');
  assert.equal(creates, 1);
  assert.equal(paths.filter((url) => url.endsWith('/sdk/invoice/get_all')).length, 1);
});
