import test from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';
import { makeEnv, setupOrg, client } from './helpers.js';

const TG = { TELEGRAM_BOT_TOKEN: '123:abc', TELEGRAM_BOT_USERNAME: 'ZimaraMenuBot', TELEGRAM_WEBHOOK_SECRET: 'hook-secret-123' };

// Captures Telegram API calls instead of reaching the network.
function captureFetch() {
  const sent = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (u, init) => {
    if (String(u).startsWith('https://api.telegram.org/')) {
      sent.push(JSON.parse(init.body));
      return new Response('{"ok":true}', { status: 200 });
    }
    return original(u, init);
  };
  return { sent, restore: () => { globalThis.fetch = original; } };
}

const hook = (env, update, secret = TG.TELEGRAM_WEBHOOK_SECRET) =>
  app.request('https://menu.test/api/telegram/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': secret },
    body: JSON.stringify(update),
  }, env);

test('add-on store installs validated pixels, WhatsApp, announcement and FAQ, and shows them publicly', async () => {
  const env = makeEnv(), s = await setupOrg(env);
  const store = await s.owner.get('/api/owner/addons');
  assert.equal(store.status, 200);
  assert.ok(store.json.addons.some((a) => a.key === 'pixel_snap'));

  assert.equal((await s.owner.put('/api/owner/addons/pixel_meta', { config: { id: '<script>' } })).status, 400);
  assert.equal((await s.owner.put('/api/owner/addons/evil', { config: {} })).status, 404);
  assert.equal((await s.owner.put('/api/owner/addons/pixel_meta', { config: { id: '123456789012345' } })).status, 200);
  assert.equal((await s.owner.put('/api/owner/addons/pixel_ga4', { config: { id: 'G-ABC123XYZ' } })).status, 200);
  assert.equal((await s.owner.put('/api/owner/addons/whatsapp_button', { config: { phone: '+966 55 000 1234', message_ar: 'أهلًا' } })).status, 200);
  assert.equal((await s.owner.put('/api/owner/addons/announcement', { config: { text_ar: 'خصم 20% اليوم', tone: 'offer' } })).status, 200);
  assert.equal((await s.owner.put('/api/owner/addons/faq', { config: { items: [{ q_ar: 'هل يوجد توصيل؟', a_ar: 'نعم' }] } })).status, 200);
  assert.equal((await s.cashier.put('/api/owner/addons/faq', { config: { items: [] } })).status, 403);

  const menu = (await client(env).get('/api/public/menu/' + s.branchSlug)).json;
  assert.deepEqual(menu.addons.pixels, { meta: '123456789012345', ga4: 'G-ABC123XYZ' });
  assert.equal(menu.addons.whatsapp_button.phone, '966550001234');
  assert.equal(menu.addons.announcement.text_ar, 'خصم 20% اليوم');
  assert.equal(menu.addons.faq.items.length, 1);

  // An expired announcement disappears; uninstalling removes the pixel.
  await s.owner.put('/api/owner/addons/announcement', { config: { text_ar: 'انتهى', ends_at: Date.now() - 1000 } });
  await s.owner.del('/api/owner/addons/pixel_meta');
  const profile = (await client(env).get('/api/public/profile/' + s.orgSlug)).json;
  assert.equal(profile.addons.announcement, undefined);
  assert.deepEqual(profile.addons.pixels, { ga4: 'G-ABC123XYZ' });
});

test('public menu pages allow only the fixed pixel vendors in CSP', async () => {
  const env = makeEnv(), s = await setupOrg(env);
  const page = await client(env).get('/m/' + s.branchSlug);
  assert.match(page.headers.get('content-security-policy'), /script-src 'self' https:\/\/connect\.facebook\.net/);
  const app_ = await client(env).get('/app');
  assert.match(app_.headers.get('content-security-policy'), /script-src 'self';/);
});

test('Telegram: link code, webhook binding, order alerts per branch, and /stop', async () => {
  const env = makeEnv(TG), s = await setupOrg(env);
  const cap = captureFetch();
  try {
    assert.equal((await s.owner.post('/api/owner/telegram/code', { events: [] })).status, 400);
    const code = await s.owner.post('/api/owner/telegram/code', { events: ['orders', 'billing'], branch_id: s.branchId });
    assert.equal(code.status, 201);
    assert.match(code.json.link, /^https:\/\/t\.me\/ZimaraMenuBot\?start=[2-9A-Z]{8}$/);

    assert.equal((await hook(env, { message: { chat: { id: 42 }, text: '/start ' + code.json.code } }, 'wrong')).status, 403);
    assert.equal((await hook(env, { message: { chat: { id: 42, first_name: 'Az' }, text: '/start ' + code.json.code } })).status, 200);
    assert.match(cap.sent.at(-1).text, /تم الربط/);
    // The code is single use.
    await hook(env, { message: { chat: { id: 43 }, text: code.json.code } });
    assert.match(cap.sent.at(-1).text, /غير صحيح/);

    const links = await s.owner.get('/api/owner/telegram');
    assert.equal(links.json.links.length, 1);
    assert.equal(links.json.links[0].chat_title, 'Az');

    // A new order reaches the linked chat with its lines and total.
    const menu = await s.owner.get('/api/owner/menu');
    const cat = menu.json.categories[0]?.id || (await s.owner.post('/api/owner/categories', { name_ar: 'قهوة', name_en: 'Coffee' })).json.id;
    const item = await s.owner.post('/api/owner/items', { category_id: cat, name_ar: 'لاتيه', name_en: 'Latte', price: 1600 });
    await s.owner.patch('/api/owner/branches/' + s.branchId + '/settings', { orders_enabled: true });
    const before = cap.sent.length;
    const idem = crypto.randomUUID();
    const order = await client(env).post('/api/public/orders/' + s.branchSlug, { idem_key: idem, items: [{ item_id: item.json.id, quantity: 2 }], note: 'بدون سكر' });
    assert.equal(order.status, 201);
    assert.equal(cap.sent.length, before + 1);
    assert.equal(cap.sent.at(-1).chat_id, '42');
    assert.match(cap.sent.at(-1).text, /2× لاتيه/);
    assert.match(cap.sent.at(-1).text, /32\.00/);
    assert.match(cap.sent.at(-1).text, /بدون سكر/);
    // Replaying the same order does not alert twice.
    await client(env).post('/api/public/orders/' + s.branchSlug, { idem_key: idem, items: [{ item_id: item.json.id, quantity: 2 }], note: 'بدون سكر' });
    assert.equal(cap.sent.length, before + 1);

    await hook(env, { message: { chat: { id: 42 }, text: '/stop' } });
    assert.equal((await s.owner.get('/api/owner/telegram')).json.links.length, 0);
  } finally {
    cap.restore();
  }
});

test('Telegram stays off without bot secrets', async () => {
  const env = makeEnv(), s = await setupOrg(env);
  assert.equal((await s.owner.post('/api/owner/telegram/code', { events: ['orders'] })).status, 403);
  assert.equal((await hook(env, { message: { chat: { id: 1 }, text: 'x' } })).status, 403);
});

test('Telegram messages follow the parts and heading the owner picks per chat', async () => {
  const env = makeEnv(TG), s = await setupOrg(env);
  const cap = captureFetch();
  try {
    const preview = await s.owner.post('/api/owner/telegram/preview', { format: { fields: ['items', 'total'], title: 'طلب يا شباب' } });
    assert.equal(preview.status, 200);
    assert.match(preview.json.text, /^طلب يا شباب\n• 2× لاتيه\n• 1× كروسان\nالإجمالي: 46\.00/);
    assert.doesNotMatch(preview.json.text, /كبير|ملاحظة|افتح/);
    assert.equal((await s.owner.post('/api/owner/telegram/preview', { format: { fields: ['note'] } })).status, 400, 'needs items or total');

    const code = await s.owner.post('/api/owner/telegram/code', { events: ['orders'], format: { fields: ['items', 'prices', 'total'], title: 'طلب جديد 🔥' } });
    await hook(env, { message: { chat: { id: 7 }, text: code.json.code } });
    const cat = (await s.owner.post('/api/owner/categories', { name_ar: 'قهوة', name_en: 'Coffee' })).json.id;
    const item = await s.owner.post('/api/owner/items', { category_id: cat, name_ar: 'لاتيه', name_en: 'Latte', price: 1600 });
    await s.owner.patch('/api/owner/branches/' + s.branchId + '/settings', { orders_enabled: true });
    await client(env).post('/api/public/orders/' + s.branchSlug, { idem_key: crypto.randomUUID(), items: [{ item_id: item.json.id, quantity: 2 }], note: 'سري' });
    assert.equal(cap.sent.at(-1).text, 'طلب جديد 🔥\n• 2× لاتيه · 32.00 ر.س\nالإجمالي: 32.00 ر.س');

    // The owner changes it later without relinking.
    const link = (await s.owner.get('/api/owner/telegram')).json.links[0];
    assert.deepEqual(link.format.fields, ['items', 'prices', 'total']);
    assert.equal((await s.owner.patch('/api/owner/telegram/' + link.id, { events: ['orders'], format: { fields: ['total', 'note'] } })).status, 200);
    await client(env).post('/api/public/orders/' + s.branchSlug, { idem_key: crypto.randomUUID(), items: [{ item_id: item.json.id, quantity: 1 }], note: 'سري' });
    assert.equal(cap.sent.at(-1).text, '🛎️ طلب جديد\nملاحظة: سري\nالإجمالي: 16.00 ر.س');
  } finally {
    cap.restore();
  }
});
