import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, setupOrg, client } from './helpers.js';

async function makeItem(owner, extra = {}) {
  const menu = (await owner.get('/api/owner/menu')).json;
  let catId = menu.categories[0]?.id;
  if (!catId) catId = (await owner.post('/api/owner/categories', { name_ar: 'قهوة', name_en: 'Coffee' })).json.id;
  const r = await owner.post('/api/owner/items', {
    category_id: catId,
    name_ar: 'لاتيه',
    name_en: 'Latte',
    price: 1600,
    ...extra,
  });
  return r;
}

const sizes = {
  name_ar: 'الحجم',
  name_en: 'Size',
  required: true,
  choices: [
    { id: 'small', name_ar: 'صغير', name_en: 'Small', price: 0 },
    { id: 'large', name_ar: 'كبير', name_en: 'Large', price: 400 },
  ],
};
const extras = {
  name_ar: 'إضافات',
  name_en: 'Extras',
  multi: true,
  max: 2,
  choices: [
    { id: 'oat', name_ar: 'حليب شوفان', name_en: 'Oat milk', price: 300 },
    { id: 'shot', name_ar: 'شوت إضافي', name_en: 'Extra shot', price: 500 },
    { id: 'syrup', name_ar: 'صوص', name_en: 'Syrup', price: 200 },
  ],
};

test('items store compare price, allergens, caffeine, sodium and option groups', async () => {
  const env = makeEnv(), s = await setupOrg(env);
  const created = await makeItem(s.owner, {
    compare_price: 2000,
    allergens: ['milk', 'gluten', 'milk'],
    caffeine_mg: 130,
    sodium_mg: 90,
    options: [sizes, extras],
  });
  assert.equal(created.status, 201, JSON.stringify(created.json));
  const item = (await client(env).get('/api/public/menu/' + s.branchSlug)).json.items.find((i) => i.id === created.json.id);
  assert.equal(item.compare_price, 2000);
  assert.deepEqual(item.allergens, ['gluten', 'milk']);
  assert.equal(item.caffeine_mg, 130);
  assert.equal(item.sodium_mg, 90);
  assert.equal(item.options.length, 2);
  assert.equal(item.options[0].choices[1].price, 400);
  assert.equal(item.options[1].max, 2);
});

test('item validation rejects bad compare price, unknown allergens and malformed options', async () => {
  const env = makeEnv(), s = await setupOrg(env);
  assert.equal((await makeItem(s.owner, { compare_price: 1600 })).status, 400);
  assert.equal((await makeItem(s.owner, { allergens: ['plutonium'] })).status, 400);
  assert.equal((await makeItem(s.owner, { options: [{ name_ar: 'x', choices: [] }] })).status, 400);
  assert.equal((await makeItem(s.owner, { options: 'big' })).status, 400);
});

test('orders price options on the server, enforce required and max picks, and keep the note', async () => {
  const env = makeEnv(), s = await setupOrg(env), guest = client(env);
  const { json } = await makeItem(s.owner, { options: [sizes, extras] });
  await s.owner.patch('/api/owner/branches/' + s.branchId + '/settings', { orders_enabled: true });
  const post = (items, extra = {}) =>
    guest.post('/api/public/orders/' + s.branchSlug, { idem_key: crypto.randomUUID(), items, ...extra });

  assert.equal((await post([{ item_id: json.id, quantity: 1 }])).status, 400, 'size is required');
  assert.equal((await post([{ item_id: json.id, quantity: 1, options: ['small', 'large'] }])).status, 400, 'one size only');
  assert.equal((await post([{ item_id: json.id, quantity: 1, options: ['small', 'oat', 'shot', 'syrup'] }])).status, 400, 'max 2 extras');
  assert.equal((await post([{ item_id: json.id, quantity: 1, options: ['small', 'ghost'] }])).status, 400, 'unknown choice');

  const ok = await post(
    [
      { item_id: json.id, quantity: 2, options: ['large', 'oat'] },
      { item_id: json.id, quantity: 1, options: ['small'] },
    ],
    { note: 'بدون سكر' },
  );
  assert.equal(ok.status, 201, JSON.stringify(ok.json));
  // (1600 + 400 + 300) * 2 + 1600 = 6200
  assert.equal(ok.json.order.total, 6200);
  assert.equal(ok.json.order.note, 'بدون سكر');
  assert.equal(ok.json.order.items[0].options.length, 2);
  assert.equal(ok.json.order.items[0].options[0].name_ar, 'كبير');

  const inbox = await s.cashier.get('/api/branch/orders');
  assert.equal(inbox.json.orders[0].note, 'بدون سكر');
  assert.equal(inbox.json.orders[0].items[0].price, 2300);
});
