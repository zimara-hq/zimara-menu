import { requireRole, body, audit, rateLimit, PLANS, subscriptionFor } from './context.js';
import { HttpError, bad, id, notFound, now, hmac } from './util.js';
import { sendPaymentReceipt } from './notices.js';
import { simpleFatooraConfigured } from './providers/simple-fatoora.js';

// Moyasar hosted invoices (SAMA-licensed gateway). Card data never touches this Worker.
// Activation rule: a plan is activated only after GET /v1/invoices/:id, authenticated with the
// secret key, reports status "paid" for the exact amount and currency we created. The success
// redirect and the webhook body are only hints that trigger that server-side check.
const API = 'https://api.moyasar.com/v1';
const DAY = 86400000;
const PERIOD = { monthly: 30 * DAY, annual: 365 * DAY };

export const billingConfigured = (env) => Boolean(env.MOYASAR_SECRET_KEY && env.MOYASAR_WEBHOOK_SECRET && env.PUBLIC_BASE_URL);

const http = (env) => env.HTTP_FETCH || fetch;

// VAT is added only once ZIMARA is VAT-registered (VAT_RATE_BPS=1500). Prices are listed before VAT.
export function priceFor(env, plan, cycle) {
  const p = PLANS[plan];
  if (!p || plan === 'chains') throw bad('invalid_plan');
  if (!PERIOD[cycle]) throw bad('invalid_cycle');
  const subtotal = cycle === 'annual' ? p.annual : p.monthly;
  const bps = Math.max(0, Math.min(10000, Number(env.VAT_RATE_BPS || 0) || 0));
  const vat = Math.round((subtotal * bps) / 10000);
  return { subtotal, vat, total: subtotal + vat };
}

async function moyasar(env, method, path, payload) {
  const res = await http(env)(API + path, {
    method,
    headers: {
      authorization: 'Basic ' + btoa(env.MOYASAR_SECRET_KEY + ':'),
      ...(payload ? { 'content-type': 'application/json' } : {}),
    },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) throw new HttpError(502, 'payment_provider_error');
  return data;
}

async function safeEqual(env, a, b) {
  const [x, y] = await Promise.all([hmac(env.AUTH_SECRET, 'cmp:' + String(a)), hmac(env.AUTH_SECRET, 'cmp:' + String(b))]);
  return x === y;
}

// Re-reads the invoice from Moyasar and applies it once. Safe to call any number of times.
export async function settleCheckout(env, checkout) {
  if (!checkout.provider_invoice_id) return { status: checkout.status };
  if (checkout.status !== 'pending') return { status: checkout.status };
  const inv = await moyasar(env, 'GET', '/invoices/' + encodeURIComponent(checkout.provider_invoice_id));
  if (inv.id !== checkout.provider_invoice_id) throw new HttpError(502, 'payment_provider_mismatch');
  if (inv.status === 'expired' || inv.status === 'canceled' || inv.status === 'failed') {
    await env.DB.prepare("UPDATE billing_checkouts SET status = 'expired' WHERE id = ? AND status = 'pending'").bind(checkout.id).run();
    return { status: 'expired' };
  }
  if (inv.status !== 'paid') return { status: 'pending' };
  if (Number(inv.amount) !== checkout.total || String(inv.currency).toUpperCase() !== 'SAR') {
    await audit(env, null, 'billing.amount_mismatch', { checkout: checkout.id, amount: inv.amount, currency: inv.currency });
    throw new HttpError(409, 'payment_amount_mismatch');
  }
  const t = now();
  // The conditional UPDATE is the idempotency guard: only one caller flips pending -> paid.
  const flip = await env.DB.prepare("UPDATE billing_checkouts SET status = 'paid', paid_at = ? WHERE id = ? AND status = 'pending'").bind(t, checkout.id).run();
  if (!flip.meta?.changes) return { status: 'paid' };
  const sub = await env.DB.prepare('SELECT current_period_end, status FROM subscriptions WHERE org_id = ?').bind(checkout.org_id).first();
  const base = sub && sub.status === 'active' && sub.current_period_end > t ? sub.current_period_end : t;
  const end = base + PERIOD[checkout.cycle];
  const invoiceId = id();
  const invoiceReference = 'ZM-SUB-' + checkout.id;
  await env.DB.batch([
    sub
      ? env.DB.prepare("UPDATE subscriptions SET plan = ?, status = 'active', current_period_end = ?, cancel_at_period_end = 0, updated_at = ? WHERE org_id = ?").bind(checkout.plan, end, t, checkout.org_id)
      : env.DB.prepare("INSERT INTO subscriptions (org_id, plan, status, current_period_end, created_at, updated_at) VALUES (?, ?, 'active', ?, ?, ?)").bind(checkout.org_id, checkout.plan, end, t, t),
    // The invoice outbox is durable; it runs only after Moyasar confirms payment.
    env.DB.prepare("INSERT OR IGNORE INTO subscription_invoices (id, org_id, provider, provider_reference, state, currency, subtotal, vat, total, created_at) VALUES (?, ?, 'simple_fatoora', ?, 'pending', 'SAR', ?, ?, ?, ?)")
      .bind(invoiceId, checkout.org_id, checkout.provider_invoice_id, checkout.subtotal, checkout.vat, checkout.total, t),
    env.DB.prepare("INSERT OR IGNORE INTO subscription_invoice_jobs (invoice_id, payment_reference, reference_number, state, next_attempt_at, created_at, updated_at) VALUES (?, ?, ?, 'pending', ?, ?, ?)")
      .bind(invoiceId, checkout.provider_invoice_id, invoiceReference, t, t, t),
  ]);
  await audit(env, null, 'billing.paid', { org_id: checkout.org_id, checkout: checkout.id, plan: checkout.plan, cycle: checkout.cycle, total: checkout.total });
  try { await sendPaymentReceipt(env, checkout, end); } catch { /* the payment stands; the receipt is best effort */ }
  return { status: 'paid', current_period_end: end };
}

export function registerBilling(app) {
  app.post('/api/owner/billing/checkout', requireRole('owner'), async (c) => {
    if (!billingConfigured(c.env)) throw new HttpError(503, 'billing_not_configured');
    if (!simpleFatooraConfigured(c.env)) throw new HttpError(503, 'invoicing_not_configured');
    await rateLimit(c, 'checkout', { limit: 10, window: 3600000 });
    const b = await body(c);
    const plan = String(b.plan || ''), cycle = String(b.cycle || '');
    const price = priceFor(c.env, plan, cycle);
    const u = c.get('user');
    const org = await c.env.DB.prepare('SELECT name_ar, billing_legal_name, billing_vat_number, billing_address FROM orgs WHERE id = ?').bind(u.org_id).first();
    if (!org?.billing_legal_name || !org?.billing_address || (price.vat > 0 && !org.billing_vat_number)) {
      throw new HttpError(400, 'billing_profile_incomplete');
    }
    const cid = id(), t = now();
    const base = c.env.PUBLIC_BASE_URL.replace(/\/$/, '');
    await c.env.DB.prepare("INSERT INTO billing_checkouts (id, org_id, plan, cycle, provider, subtotal, vat, total, status, created_by, created_at) VALUES (?, ?, ?, ?, 'moyasar', ?, ?, ?, 'pending', ?, ?)")
      .bind(cid, u.org_id, plan, cycle, price.subtotal, price.vat, price.total, u.id, t).run();
    const inv = await moyasar(c.env, 'POST', '/invoices', {
      amount: price.total,
      currency: 'SAR',
      description: `ZIMARA Menu · ${plan} · ${cycle} · ${org?.name_ar || ''}`.slice(0, 250),
      callback_url: `${base}/api/webhooks/moyasar`,
      success_url: `${base}/app?billing=${cid}#subscription`,
      back_url: `${base}/app#subscription`,
      metadata: { checkout_id: cid, org_id: u.org_id },
    });
    if (!inv.id || !inv.url) throw new HttpError(502, 'payment_provider_error');
    await c.env.DB.prepare('UPDATE billing_checkouts SET provider_invoice_id = ? WHERE id = ?').bind(inv.id, cid).run();
    await audit(c.env, u, 'billing.checkout_created', { checkout: cid, plan, cycle, total: price.total });
    return c.json({ checkout_id: cid, url: inv.url, ...price }, 201);
  });

  // Called by the dashboard after the hosted page redirects back. Never trusts query params.
  app.post('/api/owner/billing/sync', requireRole('owner'), async (c) => {
    if (!billingConfigured(c.env)) throw new HttpError(503, 'billing_not_configured');
    const b = await body(c);
    const row = await c.env.DB.prepare('SELECT * FROM billing_checkouts WHERE id = ? AND org_id = ?').bind(String(b.checkout_id || ''), c.get('user').org_id).first();
    if (!row) throw notFound();
    const result = await settleCheckout(c.env, row);
    return c.json({ ...result, subscription: await subscriptionFor(c.env, row.org_id) });
  });

  app.post('/api/webhooks/moyasar', async (c) => {
    if (!billingConfigured(c.env)) throw new HttpError(503, 'billing_not_configured');
    const b = await body(c);
    if (!b.secret_token || !(await safeEqual(c.env, b.secret_token, c.env.MOYASAR_WEBHOOK_SECRET))) throw new HttpError(401, 'invalid_webhook');
    const invoiceId = b.data?.invoice_id || (b.type?.startsWith('invoice') ? b.data?.id : null);
    if (!invoiceId) return c.json({ ok: true, ignored: true });
    const row = await c.env.DB.prepare("SELECT * FROM billing_checkouts WHERE provider = 'moyasar' AND provider_invoice_id = ?").bind(String(invoiceId)).first();
    if (!row) return c.json({ ok: true, ignored: true });
    const result = await settleCheckout(c.env, row);
    return c.json({ ok: true, status: result.status });
  });
}

// Cron fallback: settle checkouts whose webhook may have been lost, for up to 2 days.
export async function reconcileCheckouts(env) {
  if (!billingConfigured(env)) return;
  const { results } = await env.DB.prepare("SELECT * FROM billing_checkouts WHERE status = 'pending' AND provider_invoice_id IS NOT NULL AND created_at > ? ORDER BY created_at LIMIT 20").bind(now() - 2 * DAY).all();
  for (const row of results) {
    try { await settleCheckout(env, row); } catch { /* retried on the next run */ }
  }
}
