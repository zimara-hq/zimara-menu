import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, setupOrg, client } from './helpers.js';

test('menu context matches the public profile for its current branch without private data', async () => {
  const env = makeEnv(), s = await setupOrg(env), guest = client(env);
  await s.owner.patch('/api/owner/profile', { description_en: 'Public description', phone: '+966500000000' });
  await s.owner.patch(`/api/owner/branches/${s.branchId}/settings`, { address: 'Current address', orders_enabled: true });
  await env.DB.prepare("INSERT INTO branches (id,org_id,slug,name_ar,name_en,created_at) SELECT 'sibling',id,'sibling','آخر','Sibling',1 FROM orgs WHERE slug=?").bind(s.orgSlug).run();
  await env.DB.prepare("INSERT INTO branch_settings (branch_id,address,updated_at) VALUES ('sibling','Other branch address',0)").run();
  await env.DB.prepare("INSERT INTO orgs (id,slug,name_ar,name_en,created_at) VALUES ('other-org','other-org','آخر','Other',0)").run();
  await env.DB.prepare("INSERT INTO branches (id,org_id,slug,name_ar,name_en,created_at) VALUES ('foreign','other-org','foreign','آخر','Foreign',0)").run();
  const ticket = await s.cashier.post('/api/branch/tickets', {});
  const profile = (await guest.get('/api/public/profile/' + s.orgSlug)).json;
  const menu = await guest.get('/api/public/menu/' + s.branchSlug);
  assert.equal(menu.status, 200);
  assert.deepEqual(menu.json.profile_data, {
    org: profile.org, profile: profile.profile, loyalty: profile.loyalty,
    branches: profile.branches.filter(b => b.slug === s.branchSlug), timezone: profile.timezone,
  });
  assert.deepEqual(menu.json.branches.map(b => b.slug).sort(), [s.branchSlug, 'sibling'].sort());
  assert.equal(menu.json.profile_data.org.id, undefined);
  for (const privateValue of [ticket.json.token, 'Other branch address', 'owner@cafe.test', 'foreign', 'other-org']) {
    assert.equal(JSON.stringify(menu.json.profile_data).includes(privateValue), false, privateValue);
  }
  assert.equal(menu.headers.get('cache-control'), 'no-store');
  assert.deepEqual(Object.keys(menu.json.profile_data).sort(), ['branches', 'loyalty', 'org', 'profile', 'timezone']);
  assert.deepEqual(Object.keys(menu.json.profile_data.branches[0]).sort(), ['google_review_url', 'id', 'name_ar', 'name_en', 'settings', 'slug']);
  const foreign = (await guest.get('/api/public/menu/foreign')).json.profile_data;
  assert.equal(foreign.org.slug, 'other-org');
  assert.deepEqual(foreign.branches.map(b => b.slug), ['foreign']);
  assert.equal(foreign.profile.description_en, '');
  assert.equal(foreign.branches[0].settings.address, '');
});

test('menu context uses the public profile defaults when optional rows are absent', async () => {
  const env = makeEnv(), s = await setupOrg(env), guest = client(env);
  await env.DB.prepare('DELETE FROM org_profiles').run();
  await env.DB.prepare('DELETE FROM branch_settings').run();
  await env.DB.prepare('DELETE FROM loyalty_programs').run();
  const profile = (await guest.get('/api/public/profile/' + s.orgSlug)).json;
  const menu = (await guest.get('/api/public/menu/' + s.branchSlug)).json;
  assert.deepEqual(menu.profile_data, {
    org: profile.org, profile: profile.profile, loyalty: null,
    branches: profile.branches, timezone: profile.timezone,
  });
  assert.equal(menu.profile_data.branches[0].settings.orders_enabled, false);
});

test('menu context does not change published design, ordering or inactive tenant rejection', async () => {
  const env = makeEnv(), s = await setupOrg(env), guest = client(env);
  await s.owner.post('/api/owner/design/presets/smash-photo/apply', {});
  assert.equal((await guest.get('/api/public/menu/' + s.branchSlug)).json.design, null);
  await s.owner.post('/api/owner/design/publish', {});
  const profile = (await guest.get('/api/public/profile/' + s.orgSlug)).json;
  const menu = (await guest.get('/api/public/menu/' + s.branchSlug)).json;
  assert.ok(menu.profile_data);
  assert.deepEqual(menu.design, profile.design);
  assert.equal(menu.design.layout, 'cards');
  assert.ok(menu.ordering);
  assert.equal(menu.ordering.branch_id, undefined);
  await env.DB.prepare('UPDATE branches SET active=0 WHERE id=?').bind(s.branchId).run();
  assert.equal((await guest.get('/api/public/menu/' + s.branchSlug)).status, 404);
  await env.DB.prepare('UPDATE branches SET active=1 WHERE id=?').bind(s.branchId).run();
  await env.DB.prepare('UPDATE orgs SET active=0 WHERE slug=?').bind(s.orgSlug).run();
  assert.equal((await guest.get('/api/public/menu/' + s.branchSlug)).status, 404);
});
