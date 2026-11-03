import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, setupOrg, client } from './helpers.js';
import { rowsFromMenu, AI_DAILY_LIMIT } from '../src/ai-import.js';

async function addItem(owner, extra = {}) {
  const cat = (await owner.post('/api/owner/categories', { name_ar: 'قهوة', name_en: 'Coffee' })).json.id;
  return owner.post('/api/owner/items', { category_id: cat, name_ar: 'لاتيه', name_en: 'Latte', price: 1800, ...extra });
}

test('items carry up to three known badges that guests see', async () => {
  const env = makeEnv(), s = await setupOrg(env);
  assert.equal((await addItem(s.owner, { badges: ['spicy', 'x'] })).json.error, 'invalid_badges');
  assert.equal((await addItem(s.owner, { badges: ['new', 'popular', 'chef', 'spicy'] })).status, 400);
  assert.equal((await addItem(s.owner, { badges: ['new', 'popular', 'new'] })).status, 201);
  const menu = (await client(env).get('/api/public/menu/' + s.branchSlug)).json;
  assert.deepEqual(menu.items[0].badges, ['new', 'popular']);
});

test('setup progress reports design, photos, hours and links', async () => {
  const env = makeEnv(), s = await setupOrg(env);
  let p = (await s.owner.get('/api/owner/setup')).json;
  assert.equal(p.design_published, false);
  assert.equal(p.items, 0);
  assert.equal(p.review_link, true);
  assert.equal(p.ai_import, false);
  await addItem(s.owner, { image_url: 'https://cdn.test/latte.jpg' });
  await s.owner.post('/api/owner/design/presets/smash-photo/apply', {});
  await s.owner.post('/api/owner/design/publish', {});
  p = (await s.owner.get('/api/owner/setup')).json;
  assert.equal(p.design_published, true);
  assert.equal(p.items, 1);
  assert.equal(p.photos, 1);
  assert.equal((await s.cashier.get('/api/owner/setup')).status, 403);
});

test('Claude output becomes import rows; bad values are dropped, not trusted', () => {
  const rows = rowsFromMenu({ categories: [
    { name_ar: 'مشروبات', name_en: 'Drinks', items: [
      { name_ar: 'قهوة سعودية', name_en: 'Saudi coffee', desc_ar: '', desc_en: '', price: 12.5, calories: 5 },
      { name_ar: '', name_en: 'Tea', desc_ar: '', desc_en: '', price: -3, calories: 1.5 },
      { name_ar: '', name_en: '', price: 4 },
    ] },
  ] });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].price, '12.5');
  assert.equal(rows[1].name_ar, 'Tea');
  assert.equal(rows[1].price, '');
  assert.equal(rows[1].calories, null);
});

function fakeClaude(reply, calls = []) {
  return async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body), headers: init.headers });
    return new Response(JSON.stringify({
      id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn', stop_details: null,
      content: [{ type: 'text', text: JSON.stringify(reply) }], usage: { input_tokens: 10, output_tokens: 10 },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
}

test('AI import reads a photo into a draft the owner can review and save', async () => {
  const calls = [];
  const env = makeEnv({ ANTHROPIC_API_KEY: 'test-key', ANTHROPIC_FETCH: fakeClaude({ categories: [
    { name_ar: 'برجر', name_en: 'Burgers', items: [{ name_ar: 'سماش', name_en: 'Smash', desc_ar: 'لحم', desc_en: 'Beef', price: 29, calories: 640 }] },
  ] }, calls) });
  const s = await setupOrg(env);
  assert.equal((await client(env).get('/api/config')).json.ai_import, true);
  const png = Buffer.from('fake-image-bytes').toString('base64');
  const r = await s.owner.post('/api/owner/menu/ai-import', { kind: 'image', media_type: 'image/png', data: png });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.rows.length, 1);
  assert.equal(r.json.preview.valid, true);
  assert.equal(r.json.remaining, AI_DAILY_LIMIT - 1);
  // The request asks Claude for structured JSON and sends the photo as an image block.
  const sent = calls[0].body;
  assert.equal(sent.model, 'claude-opus-5-5');
  assert.equal(sent.output_config.format.type, 'json_schema');
  assert.equal(sent.messages[0].content[0].type, 'image');
  // Nothing is saved until the owner applies the reviewed rows.
  assert.equal((await s.owner.get('/api/owner/menu')).json.items.length, 0);
  const saved = await s.owner.post('/api/owner/menu/import/apply', { rows: r.json.rows });
  assert.equal(saved.status, 201);
  assert.equal((await s.owner.get('/api/owner/menu')).json.items[0].price, 2900);
});

test('AI import is owner-only, checks input, and has a daily limit', async () => {
  const env = makeEnv({ ANTHROPIC_API_KEY: 'test-key', ANTHROPIC_FETCH: fakeClaude({ categories: [] }) });
  const s = await setupOrg(env);
  assert.equal((await s.cashier.post('/api/owner/menu/ai-import', { kind: 'text', text: 'قهوة 10' })).status, 403);
  assert.equal((await s.owner.post('/api/owner/menu/ai-import', { kind: 'image', media_type: 'image/svg+xml', data: 'AAAA' })).status, 400);
  assert.equal((await s.owner.post('/api/owner/menu/ai-import', { kind: 'link', url: 'http://127.0.0.1/admin' })).json.error, 'invalid_url');
  assert.equal((await s.owner.post('/api/owner/menu/ai-import', { kind: 'link', url: 'https://localhost/x' })).json.error, 'invalid_url');
  assert.equal((await s.owner.post('/api/owner/menu/ai-import', { kind: 'text', text: 'not a menu' })).json.error, 'ai_no_items');
  for (let i = 1; i < AI_DAILY_LIMIT; i++) await s.owner.post('/api/owner/menu/ai-import', { kind: 'text', text: 'not a menu' });
  assert.equal((await s.owner.post('/api/owner/menu/ai-import', { kind: 'text', text: 'not a menu' })).json.error, 'ai_daily_limit');
  const off = makeEnv(), o = await setupOrg(off);
  assert.equal((await o.owner.post('/api/owner/menu/ai-import', { kind: 'text', text: 'قهوة 10' })).status, 503);
});
