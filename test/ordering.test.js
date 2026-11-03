import test from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';
import { makeEnv, setupOrg, client } from './helpers.js';

async function shop(env) {
  const s = await setupOrg(env);
  const cat = (await s.owner.post('/api/owner/categories', { name_ar: 'برجر', name_en: 'Burgers' })).json.id;
  s.item = (await s.owner.post('/api/owner/items', { category_id: cat, name_ar: 'سماش', name_en: 'Smash', price: 3000 })).json.id;
  await s.owner.patch('/api/owner/branches/' + s.branchId + '/settings', { orders_enabled: true });
  s.order = (extra = {}, qty = 1) => client(env, '2.2.2.' + Math.floor(Math.random() * 200)).post('/api/public/orders/' + s.branchSlug, { idem_key: crypto.randomUUID(), items: [{ item_id: s.item, quantity: qty }], ...extra });
  return s;
}

test('owner picks order types, tables and delivery terms; guests see them', async () => {
  const env = makeEnv(), s = await shop(env);
  const url = '/api/owner/branches/' + s.branchId + '/ordering';
  assert.deepEqual((await s.owner.get(url)).json.ordering.types, ['pickup']);
  assert.equal((await s.owner.patch(url, { types: ['teleport'] })).status, 400);
  assert.equal((await s.owner.patch(url, { whatsapp: '12345' })).json.error, 'invalid_whatsapp');
  const r = await s.owner.patch(url, { types: ['delivery', 'dine_in', 'car', 'pickup'], tables: 12, whatsapp: '055 123 4567', delivery_fee: 1000, delivery_min: 5000 });
  assert.deepEqual(r.json.ordering.types, ['dine_in', 'pickup', 'delivery', 'car']);
  assert.equal(r.json.ordering.whatsapp, '966551234567');
  assert.equal((await s.cashier.patch(url, { tables: 3 })).status, 403);
  const menu = (await client(env).get('/api/public/menu/' + s.branchSlug)).json;
  assert.equal(menu.ordering.tables, 12);
  assert.equal(menu.branches.length, 1);
});

test('each order type checks its own details and the server prices delivery', async () => {
  const env = makeEnv(), s = await shop(env);
  await s.owner.patch('/api/owner/branches/' + s.branchId + '/ordering', { types: ['dine_in', 'pickup', 'delivery', 'car'], tables: 10, delivery_fee: 1000, delivery_min: 5000 });
  assert.equal((await s.order({ order_type: 'dine_in', table: 11 })).status, 400);
  const dine = await s.order({ order_type: 'dine_in', table: 4 });
  assert.equal(dine.status, 201);
  assert.equal(dine.json.order.details.table, '4');
  assert.equal((await s.order({ order_type: 'delivery', name: 'سارة', phone: '0551234567', address: 'حائل، حي النقرة' })).json.error, 'delivery_min_total');
  assert.equal((await s.order({ order_type: 'delivery', name: 'سارة', phone: '123', address: 'حائل' }, 2)).json.error, 'invalid_phone');
  const del = await s.order({ order_type: 'delivery', name: 'سارة', phone: '٠٥٥١٢٣٤٥٦٧', address: 'حائل، حي النقرة' }, 2);
  assert.equal(del.status, 201);
  assert.equal(del.json.order.total, 7000);
  assert.equal(del.json.order.delivery_fee, 1000);
  assert.equal(del.json.order.details.phone, '966551234567');
  assert.equal((await s.order({ order_type: 'car' })).status, 400);
  assert.equal((await s.order({ order_type: 'car', car: 'كامري بيضاء' })).json.order.details.car, 'كامري بيضاء');
  await s.owner.patch('/api/owner/branches/' + s.branchId + '/ordering', { types: ['pickup'] });
  assert.equal((await s.order({ order_type: 'delivery' })).json.error, 'order_type_unavailable');
  const inbox = (await s.cashier.get('/api/branch/orders')).json.orders;
  assert.ok(inbox.some((o) => o.order_type === 'delivery' && o.details.address));
});

test('coupons discount once per use, respect limits, and cannot be guessed freely', async () => {
  const env = makeEnv(), s = await shop(env);
  assert.equal((await s.owner.post('/api/owner/coupons', { code: 'x', kind: 'percent', value: 10 })).status, 400);
  assert.equal((await s.owner.post('/api/owner/coupons', { code: 'WELCOME', kind: 'percent', value: 120 })).status, 400);
  const c = await s.owner.post('/api/owner/coupons', { code: 'welcome20', kind: 'percent', value: 20, max_uses: 1, min_total: 2000 });
  assert.equal(c.status, 201);
  assert.equal(c.json.coupon.code, 'WELCOME20');
  assert.equal((await s.owner.post('/api/owner/coupons', { code: 'WELCOME20', kind: 'amount', value: 500 })).status, 409);
  const check = await client(env).post('/api/public/coupons/' + s.branchSlug + '/check', { code: 'welcome20', subtotal: 3000 });
  assert.equal(check.json.discount, 600);
  assert.equal((await client(env).post('/api/public/coupons/' + s.branchSlug + '/check', { code: 'NOPE', subtotal: 3000 })).json.error, 'coupon_invalid');
  const o = await s.order({ coupon: 'Welcome20' });
  assert.equal(o.status, 201);
  assert.equal(o.json.order.total, 2400);
  assert.equal(o.json.order.discount, 600);
  assert.equal((await s.order({ coupon: 'WELCOME20' })).json.error, 'coupon_used_up');
  const list = (await s.owner.get('/api/owner/coupons')).json.coupons;
  assert.equal(list[0].used, 1);
  await s.owner.post('/api/owner/coupons', { code: 'OFF5', kind: 'amount', value: 500 });
  const off = (await s.owner.get('/api/owner/coupons')).json.coupons.find((x) => x.code === 'OFF5');
  await s.owner.patch('/api/owner/coupons/' + off.id, { active: false });
  assert.equal((await s.order({ coupon: 'OFF5' })).json.error, 'coupon_invalid');
  // Guessing is rate limited per address.
  const guesser = client(env, '9.9.9.9');
  let last;
  for (let i = 0; i < 21; i++) last = await guesser.post('/api/public/coupons/' + s.branchSlug + '/check', { code: 'TRY' + i, subtotal: 3000 });
  assert.equal(last.status, 429);
});

const TG = { TELEGRAM_BOT_TOKEN: '123:abc', TELEGRAM_BOT_USERNAME: 'ZimaraMenuBot', TELEGRAM_WEBHOOK_SECRET: 'hook-secret-123' };
const hook = (env, update) => app.request('https://menu.test/api/telegram/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': TG.TELEGRAM_WEBHOOK_SECRET }, body: JSON.stringify(update) }, env);

test('order alerts on Telegram carry accept/reject buttons that only the linked chat can use', async () => {
  const sent = [], original = globalThis.fetch;
  globalThis.fetch = async (u, init) => {
    if (String(u).startsWith('https://api.telegram.org/')) { sent.push({ method: String(u).split('/').at(-1), body: JSON.parse(init.body) }); return new Response('{"ok":true}'); }
    return original(u, init);
  };
  try {
    const env = makeEnv(TG), s = await shop(env);
    const code = await s.owner.post('/api/owner/telegram/code', { events: ['orders'] });
    await hook(env, { message: { chat: { id: 42, first_name: 'Az' }, text: '/start ' + code.json.code } });
    const o = await s.order({ name: 'خالد' });
    const alert = sent.filter((x) => x.method === 'sendMessage').at(-1).body;
    assert.match(alert.text, /خالد/);
    const [accept, reject] = alert.reply_markup.inline_keyboard[0];
    assert.equal(accept.callback_data, 'zo:a:' + o.json.order.id);
    // A chat that is not linked cannot act.
    await hook(env, { callback_query: { id: 'q1', data: accept.callback_data, from: { first_name: 'X' }, message: { message_id: 7, chat: { id: 99 }, text: alert.text } } });
    assert.equal((await client(env).get('/api/public/order/' + o.json.order.token)).json.order.status, 'pending');
    await hook(env, { callback_query: { id: 'q2', data: accept.callback_data, from: { first_name: 'Az' }, message: { message_id: 7, chat: { id: 42 }, text: alert.text } } });
    const after = (await client(env).get('/api/public/order/' + o.json.order.token)).json;
    assert.equal(after.order.status, 'accepted');
    assert.ok(after.ticket.number);
    assert.match(sent.filter((x) => x.method === 'editMessageText').at(-1).body.text, /قُبل بواسطة Az/);
    // Pressing reject afterwards does not undo it.
    await hook(env, { callback_query: { id: 'q3', data: reject.callback_data, from: { first_name: 'Az' }, message: { message_id: 7, chat: { id: 42 }, text: alert.text } } });
    assert.equal((await client(env).get('/api/public/order/' + o.json.order.token)).json.order.status, 'accepted');
    assert.match(sent.filter((x) => x.method === 'answerCallbackQuery').at(-1).body.text, /مقبول مسبقًا/);
  } finally { globalThis.fetch = original; }
});
