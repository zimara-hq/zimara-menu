import { test } from 'node:test';
import assert from 'node:assert/strict';
import { client, makeEnv, seedAdmin, setupOrg } from './helpers.js';

test('login sets an HttpOnly session and /api/me reflects the role', async () => {
  const env = makeEnv();
  const root = await seedAdmin(env);
  const c = client(env);
  const r = await c.login(root.email, root.password);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('set-cookie'), /HttpOnly/);
  assert.match(r.headers.get('set-cookie'), /Secure/);
  const me = await c.get('/api/me');
  assert.equal(me.json.user.role, 'admin');
});

test('wrong password is rejected and repeated failures are rate limited', async () => {
  const env = makeEnv();
  const root = await seedAdmin(env);
  const c = client(env);
  for (let i = 0; i < 8; i++) assert.equal((await c.login(root.email, 'nope-nope-nope')).status, 401);
  assert.equal((await c.login(root.email, root.password)).status, 429);
});

test('at most four platform admins', async () => {
  const env = makeEnv();
  const root = await seedAdmin(env);
  const c = client(env);
  await c.login(root.email, root.password);
  for (let i = 2; i <= 4; i++) {
    const r = await c.post('/api/admin/admins', { email: `a${i}@z.test`, name: 'A' + i, password: 'admin-pass-123' });
    assert.equal(r.status, 201, JSON.stringify(r.json));
  }
  const fifth = await c.post('/api/admin/admins', { email: 'a5@z.test', name: 'A5', password: 'admin-pass-123' });
  assert.equal(fifth.status, 409);
  assert.equal(fifth.json.error, 'admin_limit');
});

test('mutations require JSON (CSRF guard) and authentication', async () => {
  const env = makeEnv();
  const anon = client(env);
  const form = await anon.raw('POST', '/api/admin/admins', undefined, { 'content-type': 'application/x-www-form-urlencoded' });
  assert.equal(form.status, 400);
  assert.equal(form.json.error, 'json_required');
  assert.equal((await anon.post('/api/admin/admins', {})).status, 401);
});

test('roles are isolated: branch cannot reach owner or admin APIs, owner cannot reach another org', async () => {
  const env = makeEnv();
  const { admin, owner, cashier } = await setupOrg(env);
  assert.equal((await cashier.get('/api/owner/branches')).status, 403);
  assert.equal((await cashier.get('/api/admin/orgs')).status, 403);
  assert.equal((await owner.get('/api/admin/orgs')).status, 403);

  await admin.post('/api/admin/orgs', {
    name_ar: 'ب',
    name_en: 'Other',
    owner: { email: 'o2@other.test', name: 'O2', password: 'owner-pass-123' },
  });
  const other = client(env);
  await other.login('o2@other.test', 'owner-pass-123');
  const mine = await owner.get('/api/owner/branches');
  assert.equal(mine.json.branches.length, 1);
  const theirs = await other.get('/api/owner/branches');
  assert.equal(theirs.json.branches.length, 0);
  const hijack = await other.patch(`/api/owner/branches/${mine.json.branches[0].id}`, { name_ar: 'x', name_en: 'x' });
  assert.equal(hijack.status, 404);
});

test('one account per branch and disabling it ends its sessions', async () => {
  const env = makeEnv();
  const { owner, cashier, branchId } = await setupOrg(env);
  const dup = await owner.post('/api/owner/branches', {
    name_ar: 'ف',
    name_en: 'Second',
    account: { email: 'hail@cafe.test', name: 'dup', password: 'branch-pass-123' },
  });
  assert.equal(dup.status, 409);
  assert.equal((await cashier.get('/api/branch/tickets')).status, 200);
  await owner.patch(`/api/owner/branches/${branchId}/account`, { disabled: true });
  assert.equal((await cashier.get('/api/branch/tickets')).status, 401);
});
