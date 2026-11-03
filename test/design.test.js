import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, setupOrg, client } from './helpers.js';
import { PRESETS, SECTORS, validateRecipe, contrast, derived, FONTS_AR } from '../src/design.js';

test('100 ready designs, all valid and readable', () => {
  assert.equal(PRESETS.length, 100);
  assert.equal(new Set(PRESETS.map((p) => p.id)).size, 100);
  assert.equal(FONTS_AR.length, 30);
  for (const p of PRESETS) {
    assert.ok(SECTORS.includes(p.sector), p.id);
    assert.deepEqual(validateRecipe(p.recipe), p.recipe, p.id);
    const c = p.recipe.colors, d = derived(p.recipe);
    assert.ok(contrast(c.text, c.surface) >= 4.5, p.id + ' text/surface');
    assert.ok(contrast(d.on_primary, c.primary) >= 3, p.id + ' button text');
    assert.ok(contrast(d.price, c.surface) >= 4.5, p.id + ' price');
  }
});

test('recipes reject anything outside the allowed choices', () => {
  assert.throws(() => validateRecipe({ colors: { primary: 'red;}body{display:none' } }), { code: 'invalid_design' });
  assert.throws(() => validateRecipe({ layout: 'custom' }), { code: 'invalid_design' });
  assert.throws(() => validateRecipe({ css: 'body{}' }), { code: 'invalid_design' });
  assert.throws(() => validateRecipe({ background: { type: 'image', image: 'https://x.test/a.png");}' } }), { code: 'invalid_design' });
  assert.throws(() => validateRecipe({ font_ar: 'Comic Sans' }), { code: 'invalid_design' });
  const r = validateRecipe({ background: { type: 'image', image: null } });
  assert.equal(r.background.type, 'solid');
});

test('owner edits a draft, publishes, and guests only see the published design', async () => {
  const env = makeEnv(), s = await setupOrg(env);
  const studio = await s.owner.get('/api/owner/design');
  assert.equal(studio.status, 200);
  assert.equal(studio.json.presets.length, 100);
  assert.equal((await client(env).get('/api/public/menu/' + s.branchSlug)).json.design, null);

  assert.equal((await s.owner.post('/api/owner/design/presets/smash-photo/apply', {})).status, 200);
  const draft = (await s.owner.get('/api/owner/design')).json.draft;
  assert.equal(draft.layout, 'cards');
  // Unreadable text is fixed on save.
  const saved = await s.owner.put('/api/owner/design/draft', { recipe: { ...draft, derived: undefined, colors: { ...draft.colors, text: '#fffbf2' } } });
  assert.equal(saved.status, 200, JSON.stringify(saved.json));
  assert.deepEqual(saved.json.adjusted, ['colors.text']);
  assert.equal((await client(env).get('/api/public/menu/' + s.branchSlug)).json.design, null, 'draft is private');

  assert.equal((await s.owner.post('/api/owner/design/publish', {})).status, 200);
  const pub = (await client(env).get('/api/public/menu/' + s.branchSlug)).json.design;
  assert.equal(pub.colors.primary, '#d62828');
  assert.ok(pub.derived.on_primary);
  assert.equal((await client(env).get('/api/public/profile/' + s.orgSlug)).json.design.layout, 'cards');
  assert.equal((await s.cashier.get('/api/owner/design')).status, 403);
});

test('named versions, restore, automatic snapshots and scheduled designs', async () => {
  const env = makeEnv(), s = await setupOrg(env);
  await s.owner.post('/api/owner/design/presets/latte-classic/apply', {});
  await s.owner.post('/api/owner/design/publish', {});
  await s.owner.post('/api/owner/design/presets/season-ramadan/apply', {});
  const v = await s.owner.post('/api/owner/design/versions', { name: 'رمضان' });
  assert.equal(v.status, 201);
  const studio = (await s.owner.get('/api/owner/design')).json;
  assert.ok(studio.versions.some((x) => x.auto), 'snapshot before applying a preset');

  // Schedule Ramadan from now; guests see it while it runs.
  const t = Date.now();
  assert.equal((await s.owner.post('/api/owner/design/schedules', { version_id: v.json.version.id, starts_at: t - 1000, ends_at: t + 86400000 })).status, 201);
  assert.equal((await s.owner.post('/api/owner/design/schedules', { version_id: v.json.version.id, starts_at: t, ends_at: t + 1000 })).status, 409, 'overlap');
  assert.equal((await s.owner.post('/api/owner/design/schedules', { version_id: v.json.version.id, starts_at: t, ends_at: t + 200 * 86400000 })).status, 400);
  const live = (await client(env).get('/api/public/menu/' + s.branchSlug)).json.design;
  assert.equal(live.colors.primary, '#d4af37');
  assert.equal((await s.owner.del('/api/owner/design/versions/' + v.json.version.id)).status, 409, 'scheduled version is kept');

  // Restore the latte version as draft.
  const latte = studio.versions.find((x) => x.auto);
  assert.equal((await s.owner.post(`/api/owner/design/versions/${latte.id}/restore`, {})).status, 200);
  assert.equal((await s.owner.get('/api/owner/design')).json.draft.colors.primary, '#5b3a29');
  const sid = (await s.owner.get('/api/owner/design')).json.schedules[0].id;
  assert.equal((await s.owner.del('/api/owner/design/schedules/' + sid)).status, 200);
  assert.equal((await client(env).get('/api/public/menu/' + s.branchSlug)).json.design.colors.primary, '#5b3a29');
});

test('public pages can be framed by our own studio only', async () => {
  const env = makeEnv(), s = await setupOrg(env);
  const page = await client(env).get('/m/' + s.branchSlug);
  assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'self'/);
  assert.equal(page.headers.get('x-frame-options'), 'SAMEORIGIN');
  const appPage = await client(env).get('/app');
  assert.match(appPage.headers.get('content-security-policy'), /frame-ancestors 'none'/);
});
