// Add-on store and Telegram notifications.
// Every add-on has a fixed schema: owners pick values, never code. Pixels are IDs that our own
// loader turns into the vendor's standard snippet, so no tenant can inject script.
import { requireRole, body, audit, rateLimit } from './context.js';
import { bad, notFound, forbidden, str, int, url, id, now, shortCode } from './util.js';
import { acceptOrder, rejectOrder } from './orders.js';

const PIXEL_RE = {
  pixel_meta: /^\d{10,20}$/,
  pixel_ga4: /^G-[A-Z0-9]{4,16}$/,
  pixel_gads: /^AW-\d{6,14}$/,
  pixel_tiktok: /^[A-Z0-9]{10,30}$/,
  pixel_snap: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
  pixel_x: /^[a-z0-9]{4,12}$/,
  pixel_pinterest: /^\d{10,16}$/,
  pixel_linkedin: /^\d{4,12}$/,
};

// key -> group shown in the store. Order is the order in the store.
export const ADDONS = Object.freeze({
  whatsapp_button: 'engage',
  announcement: 'engage',
  faq: 'engage',
  telegram: 'notify',
  ...Object.fromEntries(Object.keys(PIXEL_RE).map((k) => [k, 'pixels'])),
});

const text = (v, field, max, optional = true) => str(v, field, { max, optional });

function validConfig(key, c) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) c = {};
  if (PIXEL_RE[key]) {
    const v = typeof c.id === 'string' ? c.id.trim() : '';
    if (!PIXEL_RE[key].test(v)) throw bad('invalid_pixel_id');
    return { id: v };
  }
  switch (key) {
    case 'whatsapp_button': {
      let phone = String(c.phone ?? '').replace(/[\s+-]/g, '').replace(/^00/, '');
      if (/^05\d{8}$/.test(phone)) phone = '966' + phone.slice(1); // Saudi mobile written locally
      if (!/^\d{8,15}$/.test(phone)) throw bad('invalid_phone');
      return { phone, message_ar: text(c.message_ar, 'message', 200), message_en: text(c.message_en, 'message', 200) };
    }
    case 'announcement': {
      const starts = int(c.starts_at, 'starts_at', { optional: true, max: 4e12 });
      const ends = int(c.ends_at, 'ends_at', { optional: true, max: 4e12 });
      if (starts && ends && ends <= starts) throw bad('invalid_ends_at');
      const tones = ['brand', 'offer', 'notice'];
      return {
        text_ar: text(c.text_ar, 'text', 160, false),
        text_en: text(c.text_en, 'text', 160),
        href: url(c.href, 'href'),
        tone: tones.includes(c.tone) ? c.tone : 'brand',
        starts_at: starts,
        ends_at: ends,
      };
    }
    case 'faq': {
      if (!Array.isArray(c.items) || !c.items.length || c.items.length > 20) throw bad('invalid_faq');
      return {
        items: c.items.map((x) => ({
          q_ar: text(x?.q_ar, 'faq', 200, false),
          q_en: text(x?.q_en, 'faq', 200),
          a_ar: text(x?.a_ar, 'faq', 1000, false),
          a_en: text(x?.a_en, 'faq', 1000),
        })),
      };
    }
    default:
      return {};
  }
}

const parse = (s) => {
  try { return JSON.parse(s || '{}'); } catch { return {}; }
};

// Public view: only what visitors need, announcement only inside its dates.
export async function publicAddons(env, orgId) {
  const { results } = await env.DB.prepare('SELECT addon, config_json FROM org_addons WHERE org_id=?').bind(orgId).all();
  const out = { pixels: {} };
  const t = now();
  for (const r of results) {
    const c = parse(r.config_json);
    if (PIXEL_RE[r.addon]) out.pixels[r.addon.slice(6)] = c.id;
    else if (r.addon === 'announcement') {
      if ((!c.starts_at || c.starts_at <= t) && (!c.ends_at || c.ends_at > t)) out.announcement = c;
    } else if (r.addon === 'whatsapp_button' || r.addon === 'faq') out[r.addon] = c;
  }
  return out;
}

// ---------- Telegram ----------

export const telegramConfigured = (env) => Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_BOT_USERNAME && env.TELEGRAM_WEBHOOK_SECRET);
const EVENTS = ['orders', 'billing'];
const CODE_TTL = 30 * 60 * 1000;

export async function tgSend(env, chatId, message, fetcher = fetch, extra = {}) {
  const res = await fetcher(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: message, disable_web_page_preview: true, ...extra }),
  });
  return res.ok;
}
const tgCall = (env, method, payload, fetcher = fetch) => fetcher(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
});

// Points the bot at this Worker the first time an owner links a chat, so setup needs no manual setWebhook call.
// Remembered per isolate; Telegram treats a repeat call with the same settings as a no-op.
let webhookSetFor = null;
export async function ensureWebhook(env, fetcher = fetch) {
  if (!env.PUBLIC_BASE_URL) return false;
  const url = env.PUBLIC_BASE_URL.replace(/\/$/, '') + '/api/telegram/webhook';
  const key = url + '|' + env.TELEGRAM_WEBHOOK_SECRET;
  if (webhookSetFor === key) return true;
  try {
    const res = await tgCall(env, 'setWebhook', { url, secret_token: env.TELEGRAM_WEBHOOK_SECRET, allowed_updates: ['message', 'callback_query'] }, fetcher);
    if (res.ok) webhookSetFor = key;
    return res.ok;
  } catch { return false; }
}

// Accept / reject buttons under a new-order message.
export const orderButtons = (orderId) => ({ inline_keyboard: [[{ text: '✅ قبول', callback_data: 'zo:a:' + orderId }, { text: '✖️ رفض', callback_data: 'zo:r:' + orderId }]] });
const TYPE_AR = { dine_in: '🍽 محلي', pickup: '🛍 استلام', delivery: '🛵 توصيل', car: '🚗 سيارة' };

const sar = (h) => (h / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ر.س';

// Parts an order message can show. The owner picks any of them per chat.
export const ORDER_FIELDS = ['branch', 'items', 'options', 'prices', 'note', 'total', 'time', 'link'];
const DEFAULT_FIELDS = ['branch', 'items', 'options', 'note', 'total', 'link'];

export function normalizeFormat(f) {
  if (f === undefined || f === null) return { fields: DEFAULT_FIELDS, title: null };
  if (typeof f !== 'object' || Array.isArray(f)) throw bad('invalid_format');
  const fields = Array.isArray(f.fields) ? ORDER_FIELDS.filter((x) => f.fields.includes(x)) : DEFAULT_FIELDS;
  if (!fields.includes('items') && !fields.includes('total')) throw bad('invalid_format');
  return { fields, title: text(f.title, 'format', 60) };
}

const storedFormat = (s) => { try { const f = JSON.parse(s || '{}'); return f.fields ? f : normalizeFormat(null); } catch { return normalizeFormat(null); } };

export function orderMessage(order, branchName, base, format = {}) {
  const fields = new Set(format.fields || DEFAULT_FIELDS);
  const title = format.title || '🛎️ طلب جديد';
  const lines = fields.has('items') ? JSON.parse(order.items_json || '[]').map((l) => {
    const opts = fields.has('options') ? (l.options || []).map((o) => o.name_ar).join('، ') : '';
    return `• ${l.quantity}× ${l.name_ar || l.name_en}${opts ? ` (${opts})` : ''}${fields.has('prices') ? ` · ${sar(l.total)}` : ''}`;
  }) : [];
  const time = new Date(order.created_at || Date.now()).toLocaleTimeString('ar-SA-u-nu-latn', { timeZone: 'Asia/Riyadh', hour: '2-digit', minute: '2-digit' });
  const d = (() => { try { return JSON.parse(order.details_json || '{}'); } catch { return {}; } })();
  const who = [d.name, d.phone ? '+' + d.phone : null].filter(Boolean).join(' · ');
  return [
    fields.has('branch') ? `${title} · ${branchName}` : title,
    order.order_type && order.order_type !== 'pickup' ? `${TYPE_AR[order.order_type] || order.order_type}${d.table ? ` · طاولة ${d.table}` : ''}${d.car ? ` · ${d.car}` : ''}` : null,
    who || null,
    d.address ? `العنوان: ${d.address}` : null,
    ...lines,
    fields.has('note') && order.note ? `ملاحظة: ${order.note}` : null,
    order.discount ? `خصم${order.coupon_code ? ` (${order.coupon_code})` : ''}: −${sar(order.discount)}` : null,
    order.delivery_fee ? `التوصيل: ${sar(order.delivery_fee)}` : null,
    fields.has('total') ? `الإجمالي: ${sar(order.total)}` : null,
    fields.has('time') ? `الوقت: ${time}` : null,
    fields.has('link') && base ? `افتح الطلبات: ${base.replace(/\/$/, '')}/app#inbox` : null,
  ].filter(Boolean).join('\n');
}

// Sends to every chat linked to the org (or the branch) that subscribed to the event.
export async function notifyTelegram(env, orgId, branchId, event, message, fetcher = fetch, { markup } = {}) {
  if (!telegramConfigured(env)) return 0;
  const { results } = await env.DB.prepare(
    'SELECT chat_id, events_json, format_json FROM telegram_links WHERE org_id=? AND (branch_id IS NULL OR branch_id=?)',
  ).bind(orgId, branchId ?? '').all();
  let sent = 0;
  for (const r of results) {
    if (!JSON.parse(r.events_json || '[]').includes(event)) continue;
    const text = typeof message === 'function' ? message(JSON.parse(r.format_json || '{}')) : message;
    try { if (await tgSend(env, r.chat_id, text, fetcher, markup ? { reply_markup: markup } : {})) sent++; } catch { /* one chat failing never blocks the rest */ }
  }
  return sent;
}

// Runs after the response when the platform allows it, so a slow Telegram never delays a guest.
export function later(c, promise) {
  const p = Promise.resolve(promise).catch(() => {});
  try { c.executionCtx.waitUntil(p); } catch { return p; }
  return null;
}

// A tap on ✅/✖️ under an order. Only a chat linked to that order's business
// (and branch, when the link is per branch) with order alerts on can act on it.
async function handleOrderButton(env, cq, fetcher) {
  const m = /^zo:([ar]):([0-9a-f-]{36})$/.exec(String(cq.data || ''));
  const chatId = cq.message?.chat?.id;
  const answer = (text) => tgCall(env, 'answerCallbackQuery', { callback_query_id: cq.id, text }, fetcher).catch(() => {});
  if (!m || !chatId) return answer('');
  const order = await env.DB.prepare('SELECT id,org_id,branch_id,status FROM customer_orders WHERE id=?').bind(m[2]).first();
  const link = order && await env.DB.prepare('SELECT events_json FROM telegram_links WHERE org_id=? AND chat_id=? AND (branch_id IS NULL OR branch_id=?)').bind(order.org_id, String(chatId), order.branch_id).first();
  if (!order || !link || !JSON.parse(link.events_json || '[]').includes('orders')) return answer('غير مسموح لهذه المحادثة.');
  const by = String(cq.from?.first_name || cq.from?.username || '').slice(0, 40);
  let status;
  try {
    if (m[1] === 'a') {
      const { ticket } = await acceptOrder(env, { orgId: order.org_id, branchId: order.branch_id, orderId: order.id });
      status = `✅ قُبل${by ? ` بواسطة ${by}` : ''} · رقم النداء ${ticket.number}`;
      await audit(env, { org_id: order.org_id }, 'order.accept', { order: order.id, ticket: ticket.id, via: 'telegram' });
    } else {
      await rejectOrder(env, { branchId: order.branch_id, orderId: order.id });
      status = `✖️ رُفض${by ? ` بواسطة ${by}` : ''}`;
      await audit(env, { org_id: order.org_id }, 'order.reject', { order: order.id, via: 'telegram' });
    }
  } catch {
    const now = await env.DB.prepare('SELECT status FROM customer_orders WHERE id=?').bind(order.id).first();
    status = now?.status === 'accepted' ? '✅ الطلب مقبول مسبقًا' : now?.status === 'rejected' ? '✖️ الطلب مرفوض مسبقًا' : '⌛ انتهت صلاحية الطلب';
  }
  await answer(status);
  const original = String(cq.message.text || '').slice(0, 3500);
  await tgCall(env, 'editMessageText', { chat_id: chatId, message_id: cq.message.message_id, text: `${original}\n\n${status}`, disable_web_page_preview: true }, fetcher).catch(() => {});
}

async function handleUpdate(env, update, fetcher) {
  if (update?.callback_query) return handleOrderButton(env, update.callback_query, fetcher);
  const msg = update?.message;
  const chatId = msg?.chat?.id;
  if (!chatId || typeof msg.text !== 'string') return;
  const raw = msg.text.trim();
  if (/^\/stop\b/.test(raw)) {
    await env.DB.prepare('DELETE FROM telegram_links WHERE chat_id=?').bind(String(chatId)).run();
    await tgSend(env, chatId, 'تم إيقاف إشعارات زيمارا منيو في هذه المحادثة.', fetcher);
    return;
  }
  const code = raw.replace(/^\/start\s*/, '').trim().toUpperCase();
  if (!/^[2-9A-HJ-NP-Z]{8}$/.test(code)) {
    await tgSend(env, chatId, 'أهلًا! أنشئ رمز الربط من لوحة زيمارا منيو (الإضافات ← تيليجرام) ثم أرسله هنا.', fetcher);
    return;
  }
  const row = await env.DB.prepare('SELECT * FROM telegram_codes WHERE code=? AND expires_at>?').bind(code, now()).first();
  if (!row) {
    await tgSend(env, chatId, 'الرمز غير صحيح أو انتهت صلاحيته. أنشئ رمزًا جديدًا من اللوحة.', fetcher);
    return;
  }
  const title = String(msg.chat.title || [msg.chat.first_name, msg.chat.last_name].filter(Boolean).join(' ') || msg.chat.username || '').slice(0, 80);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM telegram_codes WHERE code=?').bind(code),
    env.DB.prepare(
      'INSERT INTO telegram_links(id,org_id,branch_id,chat_id,chat_title,events_json,format_json,created_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(org_id,chat_id) DO UPDATE SET branch_id=excluded.branch_id, events_json=excluded.events_json, format_json=excluded.format_json, chat_title=excluded.chat_title',
    ).bind(id(), row.org_id, row.branch_id, String(chatId), title, row.events_json, row.format_json || '{}', now()),
  ]);
  const org = await env.DB.prepare('SELECT name_ar FROM orgs WHERE id=?').bind(row.org_id).first();
  await tgSend(env, chatId, `✅ تم الربط مع ${org?.name_ar || 'منشأتك'}. ستصلك الإشعارات هنا. لإيقافها أرسل /stop`, fetcher);
}

export function registerAddons(app, { fetcher } = {}) {
  const owner = requireRole('owner');

  app.get('/api/owner/addons', owner, async (c) => {
    const { results } = await c.env.DB.prepare('SELECT addon, config_json, updated_at FROM org_addons WHERE org_id=?').bind(c.get('user').org_id).all();
    const installed = Object.fromEntries(results.map((r) => [r.addon, { config: parse(r.config_json), updated_at: r.updated_at }]));
    return c.json({
      addons: Object.entries(ADDONS).map(([key, group]) => ({ key, group, installed: Boolean(installed[key]), config: installed[key]?.config ?? null })),
      telegram: { configured: telegramConfigured(c.env), bot: c.env.TELEGRAM_BOT_USERNAME || null },
    });
  });

  app.put('/api/owner/addons/:key', owner, async (c) => {
    const key = c.req.param('key');
    if (!Object.hasOwn(ADDONS, key)) throw notFound();
    const b = await body(c);
    const config = validConfig(key, b.config);
    const user = c.get('user');
    await c.env.DB.prepare(
      'INSERT INTO org_addons(org_id,addon,config_json,updated_at) VALUES(?,?,?,?) ON CONFLICT(org_id,addon) DO UPDATE SET config_json=excluded.config_json, updated_at=excluded.updated_at',
    ).bind(user.org_id, key, JSON.stringify(config), now()).run();
    await audit(c.env, user, 'addon.install', { key });
    return c.json({ key, installed: true, config });
  });

  app.delete('/api/owner/addons/:key', owner, async (c) => {
    const key = c.req.param('key');
    if (!Object.hasOwn(ADDONS, key)) throw notFound();
    const user = c.get('user');
    await c.env.DB.prepare('DELETE FROM org_addons WHERE org_id=? AND addon=?').bind(user.org_id, key).run();
    if (key === 'telegram') await c.env.DB.prepare('DELETE FROM telegram_links WHERE org_id=?').bind(user.org_id).run();
    await audit(c.env, user, 'addon.remove', { key });
    return c.json({ key, installed: false });
  });

  app.get('/api/owner/telegram', owner, async (c) => {
    const { results } = await c.env.DB.prepare(
      'SELECT l.id,l.branch_id,l.chat_title,l.events_json,l.format_json,l.created_at,b.name_ar AS branch_ar,b.name_en AS branch_en FROM telegram_links l LEFT JOIN branches b ON b.id=l.branch_id WHERE l.org_id=? ORDER BY l.created_at',
    ).bind(c.get('user').org_id).all();
    return c.json({
      configured: telegramConfigured(c.env),
      bot: c.env.TELEGRAM_BOT_USERNAME || null,
      links: results.map(({ events_json, format_json, ...r }) => ({ ...r, events: JSON.parse(events_json || '[]'), format: storedFormat(format_json) })),
      fields: ORDER_FIELDS,
    });
  });

  app.post('/api/owner/telegram/code', owner, async (c) => {
    if (!telegramConfigured(c.env)) throw forbidden('telegram_not_configured');
    const user = c.get('user');
    await rateLimit(c, 'tgcode:' + user.org_id, { limit: 20, window: 3600000 });
    const b = await body(c);
    const events = Array.isArray(b.events) ? [...new Set(b.events)].filter((e) => EVENTS.includes(e)) : [];
    if (!events.length) throw bad('invalid_events');
    let branchId = null;
    if (b.branch_id) {
      const br = await c.env.DB.prepare('SELECT id FROM branches WHERE id=? AND org_id=?').bind(String(b.branch_id), user.org_id).first();
      if (!br) throw bad('invalid_branch_id');
      branchId = br.id;
    }
    const format = normalizeFormat(b.format);
    const code = shortCode(8);
    const expires = now() + CODE_TTL;
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM telegram_codes WHERE expires_at<?').bind(now()),
      c.env.DB.prepare('INSERT INTO telegram_codes(code,org_id,branch_id,events_json,format_json,expires_at) VALUES(?,?,?,?,?,?)').bind(code, user.org_id, branchId, JSON.stringify(events), JSON.stringify(format), expires),
      c.env.DB.prepare(
        "INSERT INTO org_addons(org_id,addon,config_json,updated_at) VALUES(?,'telegram','{}',?) ON CONFLICT(org_id,addon) DO NOTHING",
      ).bind(user.org_id, now()),
    ]);
    await ensureWebhook(c.env, fetcher);
    return c.json({ code, expires_at: expires, link: `https://t.me/${c.env.TELEGRAM_BOT_USERNAME}?start=${code}` }, 201);
  });

  // Change what a linked chat receives, without linking it again.
  app.patch('/api/owner/telegram/:id', owner, async (c) => {
    const b = await body(c);
    const events = Array.isArray(b.events) ? [...new Set(b.events)].filter((e) => EVENTS.includes(e)) : [];
    if (!events.length) throw bad('invalid_events');
    const format = normalizeFormat(b.format);
    const r = await c.env.DB.prepare('UPDATE telegram_links SET events_json=?, format_json=? WHERE id=? AND org_id=?')
      .bind(JSON.stringify(events), JSON.stringify(format), c.req.param('id'), c.get('user').org_id).run();
    if (!r.meta?.changes) throw notFound();
    return c.json({ ok: true, events, format });
  });

  // Shows the owner exactly what a message will look like with the chosen parts.
  app.post('/api/owner/telegram/preview', owner, async (c) => {
    const format = normalizeFormat((await body(c)).format);
    const sample = { total: 4600, note: 'بدون سكر', created_at: now(), items_json: JSON.stringify([
      { quantity: 2, name_ar: 'لاتيه', total: 3400, options: [{ name_ar: 'كبير' }, { name_ar: 'حليب شوفان' }] },
      { quantity: 1, name_ar: 'كروسان', total: 1200, options: [] },
    ]) };
    return c.json({ text: orderMessage(sample, 'الفرع الرئيسي', c.env.PUBLIC_BASE_URL || 'https://menu.zimara.co', format) });
  });

  app.delete('/api/owner/telegram/:id', owner, async (c) => {
    const r = await c.env.DB.prepare('DELETE FROM telegram_links WHERE id=? AND org_id=?').bind(c.req.param('id'), c.get('user').org_id).run();
    if (!r.meta?.changes) throw notFound();
    return c.json({ ok: true });
  });

  app.post('/api/owner/telegram/test', owner, async (c) => {
    if (!telegramConfigured(c.env)) throw forbidden('telegram_not_configured');
    const user = c.get('user');
    await rateLimit(c, 'tgtest:' + user.org_id, { limit: 5, window: 600000 });
    const { results } = await c.env.DB.prepare('SELECT chat_id FROM telegram_links WHERE org_id=?').bind(user.org_id).all();
    let sent = 0;
    for (const r of results) if (await tgSend(c.env, r.chat_id, '🔔 رسالة تجربة من زيمارا منيو. الإشعارات تعمل.', fetcher).catch(() => false)) sent++;
    return c.json({ sent });
  });

  // Telegram calls this with the secret it was given at setWebhook. Always answer 200 so it never retries forever.
  app.post('/api/telegram/webhook', async (c) => {
    const secret = c.req.header('x-telegram-bot-api-secret-token');
    if (!telegramConfigured(c.env) || secret !== c.env.TELEGRAM_WEBHOOK_SECRET) throw forbidden();
    let update = null;
    try { update = await c.req.json(); } catch { /* ignored */ }
    try { await handleUpdate(c.env, update, fetcher); } catch (e) { console.error('telegram', e); }
    return c.json({ ok: true });
  });
}
