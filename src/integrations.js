import { requireRole, body, audit, assertOrgWritable, subscriptionFor } from './context.js';
import { HttpError, bad, conflict, id, int, notFound, now, randomToken, str } from './util.js';
import { encryptionConfigured, encryptSigningSecret, decryptSigningSecret, verifyBridgeSignature, payloadHash } from './providers/pos-bridge.js';
import { paymentProvider } from './providers/contracts.js';
import { pushConfigured } from './push.js';
import { billingConfigured, subscriptionCheckoutConfigured } from './billing.js';
import { mailConfigured } from './mail.js';
import { rewaaConfigured } from './providers/rewaa.js';
import { simpleFatooraConfigured } from './providers/simple-fatoora.js';

const INVOICE_COLS = 'id, provider, provider_reference, number, state, currency, subtotal, vat, total, pdf_url, issued_at, created_at';
const POS_COLS = 'id, branch_id, provider, label, active, created_at, revoked_at';

export function integrationReadiness(env) {
  const entry = (id, label_ar, label_en, state, implemented, configured, reason_ar, reason_en) => ({ id, label_ar, label_en, state, implemented, configured, verified: false, reason_ar, reason_en });
  return [
    entry('payments', 'الدفع والاشتراكات (ميسر)', 'Subscription payments (Moyasar)', subscriptionCheckoutConfigured(env) ? 'configured_unverified' : 'needs_configuration', true, subscriptionCheckoutConfigured(env),
      'الدفع عبر صفحة ميسر آمن بعد تأكيد المبلغ، ويُعرض فقط مع جاهزية Simple Fatoora. يحتاج مفاتيح المزودين واختبار Sandbox.', 'Moyasar hosted checkout activates only after a verified payment and is offered only when Simple Fatoora is ready. Provider keys and sandbox verification are required.'),
    entry('email', 'البريد (تأكيد الحساب واستعادة كلمة المرور)', 'Email (verification and password reset)', mailConfigured(env) ? 'configured_unverified' : 'needs_configuration', true, mailConfigured(env),
      'الإرسال عبر Resend مبني. يحتاج مفتاح Resend ونطاق مرسل موثّق.', 'Sending through Resend is built. Needs a Resend key and a verified sender domain.'),
    entry('simple_fatoora', 'الفوترة الإلكترونية', 'Electronic invoicing', simpleFatooraConfigured(env) ? 'configured_unverified' : 'needs_configuration', true, simpleFatooraConfigured(env),
      'إصدار فواتير الاشتراكات بعد تأكيد الدفع مبني. يحتاج مفتاح API، وبيانات فوترة مكتملة، واعتماد ملف البائع؛ لم يُثبت إصدار فاتورة حتى الآن.', 'Subscription invoicing after confirmed payment is implemented. It needs an API key, complete billing details, and an approved seller profile; no invoice issuance has been verified.'),
    entry('rewaa', 'رواء', 'Rewaa', rewaaConfigured(env) ? 'configured_unverified' : 'needs_configuration', true, rewaaConfigured(env),
      'الربط المباشر مع رواء مبني: كل فاتورة بيع في فرع مربوط تفتح رقم انتظار تلقائيًا. يحتاج بيانات API من رواء واختبار فاتورة حقيقية.', 'The direct Rewaa link is built: each sale invoice in a linked branch opens a pager ticket. Needs Rewaa API access and a real invoice test.'),
    entry('foodics', 'فودكس', 'Foodics', 'needs_partner_approval', false, false,
      'يحتاج محول OAuth واعتماد الشريك واختبار حساب تجريبي.', 'Requires an OAuth adapter, partner approval and sandbox verification.'),
    entry('pos_bridge', 'جسر نقاط البيع العام', 'Generic POS bridge', env.POS_BRIDGE_ENABLED === 'true' && encryptionConfigured(env) ? 'configured_unverified' : 'needs_configuration', true,
      env.POS_BRIDGE_ENABLED === 'true' && encryptionConfigured(env),
      'بروتوكول زيمارا الموقّع للأحداث جاهز للاختبار؛ كل اتصال مقيّد بمنشأة وفرع. لم يُختبر مع نظام كاشير خارجي.', 'The signed ZIMARA event protocol is locally tested, with each connection bound to an organization and branch. No external POS has been verified.'),
    entry('apple_wallet', 'محفظة Apple', 'Apple Wallet', 'needs_credentials', false, false,
      'يتطلب حساب المطور والشهادة وتنفيذ توقيع البطاقة وخدمة تحديثها واختبار جهاز فعلي.', 'Requires developer credentials plus pass signing, update service implementation and real-device testing.'),
    entry('google_wallet', 'محفظة Google', 'Google Wallet', 'needs_credentials', false, false,
      'يتطلب حساب جهة إصدار واعتمادًا وتنفيذ الواجهة واختبار جهاز فعلي.', 'Requires an approved issuer, implementation and real-device testing.'),
    entry('web_push', 'إشعارات المتصفح', 'Web Push', pushConfigured(env) ? 'configured_unverified' : 'needs_configuration', true, pushConfigured(env),
      'تنفيذ Web Push موجود. إعداد المفاتيح لا يثبت وصول الإشعار؛ يلزم اختبار أجهزة حقيقية، ويخضع الصوت لإعدادات الجهاز.', 'Web Push is implemented. Keys do not prove delivery; real devices must be tested and sound depends on device settings.'),
    entry('sms', 'الرسائل النصية', 'SMS', 'not_built', false, false, 'غير مربوط بمزود رسائل.', 'No SMS provider is connected.'),
    entry('whatsapp', 'واتساب', 'WhatsApp', 'not_built', false, false, 'غير مربوط بمزود رسائل أو قوالب معتمدة.', 'No messaging provider or approved templates are connected.'),
  ];
}

async function bridgeEntitlement(c) {
  if (c.env.POS_BRIDGE_ENABLED !== 'true' || !encryptionConfigured(c.env)) throw new HttpError(503, 'pos_bridge_not_configured');
  const user = c.get('user');
  await assertOrgWritable(c.env, user);
  const subscription = await subscriptionFor(c.env, user.org_id);
  if (subscription && !['pro', 'chains'].includes(subscription.plan)) throw new HttpError(403, 'pos_plan_required');
}

export function registerIntegrations(app, { onTicketReady } = {}) {
  app.get('/api/owner/integrations', requireRole('owner'), async (c) => {
    const { results } = await c.env.DB.prepare(`SELECT ${POS_COLS} FROM pos_connections WHERE org_id = ? ORDER BY created_at DESC LIMIT 100`).bind(c.get('user').org_id).all();
    return c.json({ integrations: integrationReadiness(c.env), pos_connections: results });
  });

  app.get('/api/admin/integrations', requireRole('admin'), async (c) => c.json({ integrations: integrationReadiness(c.env) }));

  app.get('/api/owner/invoices', requireRole('owner'), async (c) => {
    const page = int(c.req.query('page') || 1, 'page', { min: 1, max: 100000 });
    const size = int(c.req.query('page_size') || 20, 'page_size', { min: 1, max: 50 });
    const org = c.get('user').org_id;
    const count = await c.env.DB.prepare('SELECT COUNT(*) AS total FROM subscription_invoices WHERE org_id = ?').bind(org).first();
    const { results } = await c.env.DB.prepare(`SELECT ${INVOICE_COLS} FROM subscription_invoices WHERE org_id = ? ORDER BY created_at DESC, id LIMIT ? OFFSET ?`).bind(org, size, (page - 1) * size).all();
    return c.json({ invoices: results, total: count.total, page, page_size: size, issuance_enabled: simpleFatooraConfigured(c.env) });
  });

  app.get('/api/owner/invoices/:id', requireRole('owner'), async (c) => {
    const invoice = await c.env.DB.prepare(`SELECT ${INVOICE_COLS} FROM subscription_invoices WHERE id = ? AND org_id = ?`).bind(c.req.param('id'), c.get('user').org_id).first();
    if (!invoice) throw notFound();
    return c.json({ invoice });
  });

  app.post('/api/owner/billing/checkout', requireRole('owner'), async (c) => {
    await body(c);
    return paymentProvider(c.env).createCheckout();
  });

  // Fail closed. No browser success page or arbitrary incoming callback activates a plan.
  app.post('/api/billing/webhook/:provider', async () => { throw new HttpError(503, 'billing_webhook_not_implemented'); });

  app.post('/api/owner/pos-connections', requireRole('owner'), async (c) => {
    await bridgeEntitlement(c);
    const b = await body(c);
    if (b.provider !== 'generic_bridge') throw bad('unsupported_pos_provider');
    const branch = await c.env.DB.prepare('SELECT id FROM branches WHERE id = ? AND org_id = ? AND active = 1').bind(str(b.branch_id, 'branch_id', { max: 100 }), c.get('user').org_id).first();
    if (!branch) throw notFound('branch_not_found');
    const label = str(b.label, 'label', { max: 80 });
    const connectionId = id();
    const secret = randomToken(32);
    await c.env.DB.prepare("INSERT INTO pos_connections (id, org_id, branch_id, provider, label, secret_ciphertext, created_at) VALUES (?, ?, ?, 'generic_bridge', ?, ?, ?)")
      .bind(connectionId, c.get('user').org_id, branch.id, label, await encryptSigningSecret(c.env, secret, connectionId), now()).run();
    await audit(c.env, c.get('user'), 'pos.connection.create', { id: connectionId, branch_id: branch.id, provider: 'generic_bridge' });
    return c.json({ id: connectionId, signing_secret: secret, endpoint: '/api/integrations/pos/' + connectionId + '/events', protocol: 'zimara-bridge-v1', secret_shown_once: true }, 201);
  });

  app.post('/api/owner/pos-connections/:id/revoke', requireRole('owner'), async (c) => {
    const result = await c.env.DB.prepare('UPDATE pos_connections SET active = 0, revoked_at = ? WHERE id = ? AND org_id = ?').bind(now(), c.req.param('id'), c.get('user').org_id).run();
    if (!result.meta.changes) throw notFound();
    await audit(c.env, c.get('user'), 'pos.connection.revoke', { id: c.req.param('id') });
    return c.json({ ok: true });
  });

  app.post('/api/integrations/pos/:connection/events', async (c) => {
    if (c.env.POS_BRIDGE_ENABLED !== 'true' || !encryptionConfigured(c.env)) throw new HttpError(503, 'pos_bridge_not_configured');
    const connection = await c.env.DB.prepare(`SELECT p.* FROM pos_connections p JOIN orgs o ON o.id = p.org_id JOIN branches b ON b.id = p.branch_id
      WHERE p.id = ? AND p.active = 1 AND o.active = 1 AND b.active = 1 AND b.org_id = p.org_id`).bind(c.req.param('connection')).first();
    if (!connection) throw notFound();
    await assertOrgWritable(c.env, { org_id: connection.org_id, role: 'owner' });
    const subscription = await subscriptionFor(c.env, connection.org_id);
    if (subscription && !['pro', 'chains'].includes(subscription.plan)) throw new HttpError(403, 'pos_plan_required');
    const raw = await c.req.text();
    if (new TextEncoder().encode(raw).byteLength > 16384) throw new HttpError(413, 'event_too_large');
    const secret = await decryptSigningSecret(c.env, connection.secret_ciphertext, connection.id);
    if (!(await verifyBridgeSignature(secret, c.req.header('x-zimara-timestamp'), c.req.header('x-zimara-signature'), raw))) throw new HttpError(401, 'invalid_pos_signature');
    let event;
    try { event = JSON.parse(raw); } catch { throw bad('invalid_json'); }
    if (!event || typeof event !== 'object' || Array.isArray(event)) throw bad('invalid_event');
    const eventId = str(event.id, 'event_id', { max: 120 });
    const externalId = str(event.external_order_id, 'external_order_id', { max: 120 });
    if (!['order.created', 'order.ready'].includes(event.type)) throw bad('unsupported_event_type');
    if ('org_id' in event || 'branch_id' in event || 'status' in event) throw bad('event_scope_is_connection_bound');
    const digest = await payloadHash(raw);
    const duplicate = async () => {
      const prior = await c.env.DB.prepare('SELECT payload_hash FROM pos_events WHERE connection_id = ? AND event_id = ?').bind(connection.id, eventId).first();
      if (!prior) return false;
      if (prior.payload_hash !== digest) throw conflict('event_id_reused');
      return true;
    };
    if (await duplicate()) return c.json({ ok: true, duplicate: true });
    const stamp = now();
    const eventInsert = c.env.DB.prepare('INSERT INTO pos_events (connection_id, event_id, payload_hash, event_type, received_at) VALUES (?, ?, ?, ?, ?)').bind(connection.id, eventId, digest, event.type, stamp);
    let ticketId;
    if (event.type === 'order.created') {
      const existing = await c.env.DB.prepare('SELECT ticket_id FROM pos_orders WHERE connection_id = ? AND external_order_id = ?').bind(connection.id, externalId).first();
      if (existing) throw conflict('external_order_exists');
      const number = str(event.invoice_number, 'invoice_number', { optional: true, max: 12 }) || randomToken(6).replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
      if (!/^[0-9A-Za-z-]+$/.test(number)) throw bad('invalid_invoice_number');
      ticketId = id();
      try {
        await c.env.DB.batch([
          eventInsert,
          c.env.DB.prepare("INSERT INTO tickets (id, org_id, branch_id, number, token, status, created_at) VALUES (?, ?, ?, ?, ?, 'preparing', ?)").bind(ticketId, connection.org_id, connection.branch_id, number, randomToken(24), stamp),
          c.env.DB.prepare('INSERT INTO pos_orders (connection_id, external_order_id, ticket_id) VALUES (?, ?, ?)').bind(connection.id, externalId, ticketId),
        ]);
      } catch (error) {
        if (await duplicate()) return c.json({ ok: true, duplicate: true });
        if (/UNIQUE/i.test(String(error))) throw conflict('order_or_number_exists');
        throw error;
      }
    } else {
      const order = await c.env.DB.prepare(`SELECT t.id, t.status FROM pos_orders p JOIN tickets t ON t.id = p.ticket_id
        WHERE p.connection_id = ? AND p.external_order_id = ? AND t.org_id = ? AND t.branch_id = ?`).bind(connection.id, externalId, connection.org_id, connection.branch_id).first();
      if (!order) throw notFound('order_not_found');
      if (order.status !== 'preparing') throw conflict('order_not_preparing');
      ticketId = order.id;
      try {
        const transition = await c.env.DB.batch([
          eventInsert,
          c.env.DB.prepare("UPDATE tickets SET status = 'ready', ready_at = ?, alerts_sent = 1, last_alert_at = ?, version = version + 1 WHERE id = ? AND org_id = ? AND branch_id = ? AND status = 'preparing'").bind(stamp, stamp, ticketId, connection.org_id, connection.branch_id),
        ]);
        if (!transition[1].meta.changes) return c.json({ ok: true, duplicate: false, already_ready: true, ticket_id: ticketId }, 202);
      } catch (error) {
        if (await duplicate()) return c.json({ ok: true, duplicate: true });
        throw error;
      }
      if (onTicketReady) {
        // Persistence already committed. Delivery is reported separately; the existing pager
        // repeat scheduler remains responsible for subsequent configured delivery attempts.
        try { await onTicketReady(c.env, ticketId); } catch { /* Never leak provider errors or undo a committed state. */ }
      }
    }
    return c.json({ ok: true, duplicate: false, ticket_id: ticketId }, 202);
  });
}
