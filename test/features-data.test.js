import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, setupOrg, client } from './helpers.js';

async function secondTenant(env, admin) {
  const created = await admin.post('/api/admin/orgs', {
    name_ar: 'منشأة أخرى',
    name_en: 'Other Company',
    owner: {
      email: 'private-other@example.test',
      name: 'Other owner',
      password: 'other-password-123',
    },
  });
  const owner = client(env);
  await owner.login('private-other@example.test', 'other-password-123');
  return { id: created.json.id, owner };
}

test('organization JSON export is tenant scoped and omits credentials and other staff identities', async () => {
  const env = makeEnv(),
    s = await setupOrg(env),
    other = await secondTenant(env, s.admin);
  const firstTicket = await s.cashier.post('/api/branch/tickets', {
    invoice_number: 'POS-482',
  });
  const card = await client(env).post('/api/cards', { org: s.orgSlug });
  await s.cashier.post('/api/branch/loyalty/' + card.json.code + '/stamp', {
    idem_key: 'export-stamp-1234',
  });
  const device = await s.cashier.post('/api/branch/display-devices', {
    label: 'Display',
  });
  const org = await env.DB.prepare('SELECT org_id FROM branches WHERE id=?')
    .bind(s.branchId)
    .first();
  await env.DB.prepare(
    "INSERT INTO pos_connections(id,org_id,branch_id,provider,label,secret_ciphertext,created_at) VALUES('pos-export',?,?,'generic_bridge','POS','DO-NOT-EXPORT-CIPHERTEXT',0)",
  )
    .bind(org.org_id, s.branchId)
    .run();
  const exported = await s.owner.get('/api/owner/data/export');
  assert.equal(exported.status, 200, JSON.stringify(exported.json));
  assert.match(exported.headers.get('content-disposition'), /attachment/);
  assert.equal(exported.json.organization.slug, s.orgSlug);
  assert.equal(exported.json.data.tickets.length, 1);
  assert.equal(exported.json.data.loyalty_ledger.length, 1);
  assert.equal(exported.json.data.integrations[0].label, 'POS');
  for (const secret of [
    firstTicket.json.token,
    card.json.token,
    card.json.code,
    device.json.token,
    'DO-NOT-EXPORT-CIPHERTEXT',
    'private-other@example.test',
    'hail@cafe.test',
    'Other Company',
  ])
    assert.equal(exported.text.includes(secret), false, secret);
  const forbidden = new Set([
    'token',
    'token_hash',
    'password_hash',
    'password',
    'secret',
    'secret_ciphertext',
    'idem_key',
    'fingerprint',
    'code',
    'session',
  ]);
  function check(value) {
    if (!value || typeof value !== 'object') return;
    for (const [k, v] of Object.entries(value)) {
      assert.equal(forbidden.has(k), false, k);
      check(v);
    }
  }
  check(exported.json);
  const otherExport = await other.owner.get('/api/owner/data/export');
  assert.equal(otherExport.json.data.tickets.length, 0);
  assert.equal(otherExport.json.organization.name_en, 'Other Company');
  assert.equal((await s.cashier.get('/api/owner/data/export')).status, 403);
  assert.equal((await client(env).get('/api/owner/data/export')).status, 401);
});

test('large exports expose explicit cursors rather than silently dropping records', async () => {
  const env = makeEnv(),
    s = await setupOrg(env);
  await s.owner.post('/api/owner/menu/import/apply', {
    rows: [
      {
        category_ar: 'قهوة',
        category_en: 'Coffee',
        name_ar: 'لاتيه',
        name_en: 'Latte',
        price: '18.50',
      },
      {
        category_ar: 'قهوة',
        category_en: 'Coffee',
        name_ar: 'قهوة',
        name_en: 'Coffee',
        price: '15.00',
      },
    ],
  });
  const first = await s.owner.get(
    '/api/owner/data/export?dataset=items&page_size=1',
  );
  assert.equal(first.status, 200);
  assert.equal(first.json.complete, false);
  assert.equal(first.json.pages.items.has_more, true);
  const next = await s.owner.get(first.json.pages.items.next_url);
  assert.equal(next.status, 200);
  assert.equal(next.json.complete, true);
  assert.notEqual(first.json.data.items[0].id, next.json.data.items[0].id);
  assert.equal(
    (await s.owner.get('/api/owner/data/export?dataset=users')).status,
    400,
  );
  assert.equal(
    (await s.owner.get('/api/owner/data/export?after=bad-without-dataset'))
      .status,
    400,
  );
});

test('deletion requests require explicit confirmation and password; pending is honest and cancellable', async () => {
  const env = makeEnv(),
    s = await setupOrg(env);
  assert.equal(
    (
      await s.owner.post('/api/owner/data/deletion-request', {
        password: 'owner-pass-123',
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await s.owner.post('/api/owner/data/deletion-request', {
        confirm: 'DELETE ORGANIZATION',
        password: 'wrong-password',
      })
    ).status,
    401,
  );
  const created = await s.owner.post('/api/owner/data/deletion-request', {
    confirm: 'DELETE ORGANIZATION',
    password: 'owner-pass-123',
  });
  assert.equal(created.status, 201, JSON.stringify(created.json));
  assert.equal(created.json.deleted, false);
  assert.equal(created.json.request.status, 'pending');
  const duplicate = await s.owner.post('/api/owner/data/deletion-request', {
    confirm: 'DELETE ORGANIZATION',
    password: 'owner-pass-123',
  });
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.json.request.id, created.json.request.id);
  assert.equal((await s.owner.get('/api/owner/data/export')).status, 200);
  assert.equal(
    (await s.owner.get('/api/owner/data/deletion-request')).json.request.id,
    created.json.request.id,
  );
  const other = await secondTenant(env, s.admin);
  assert.equal(
    (
      await other.owner.post(
        '/api/owner/data/deletion-request/' +
          created.json.request.id +
          '/cancel',
        {},
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await s.owner.post(
        '/api/owner/data/deletion-request/' +
          created.json.request.id +
          '/cancel',
        {},
      )
    ).status,
    200,
  );
  assert.equal(
    (await s.owner.get('/api/owner/data/deletion-request')).json.request.status,
    'cancelled',
  );
});

test('data rights remain available when an organization or subscription is suspended', async () => {
  const env = makeEnv(),
    s = await setupOrg(env),
    stamp = Date.now();
  const org = await env.DB.prepare('SELECT org_id FROM branches WHERE id=?')
    .bind(s.branchId)
    .first();
  await env.DB.prepare(
    "INSERT INTO subscriptions(org_id,plan,status,created_at,updated_at) VALUES(?,'pro','suspended',?,?)",
  )
    .bind(org.org_id, stamp, stamp)
    .run();
  await env.DB.prepare('UPDATE orgs SET active=0 WHERE id=?')
    .bind(org.org_id)
    .run();
  assert.equal((await s.owner.get('/api/owner/data/export')).status, 200);
  assert.equal(
    (
      await s.owner.post('/api/owner/data/deletion-request', {
        confirm: 'DELETE ORGANIZATION',
        password: 'owner-pass-123',
      })
    ).status,
    201,
  );
  assert.equal(
    (await s.owner.patch('/api/owner/profile', { description_ar: 'blocked' }))
      .status,
    403,
  );
  assert.equal((await s.owner.get('/api/owner/menu')).status, 403);
  assert.equal((await s.owner.post('/api/owner/data/export', {})).status, 403);
  assert.equal((await s.owner.get('/api/owner/data/export/extra')).status, 403);
  assert.equal((await s.cashier.get('/api/owner/data/export')).status, 403);
  await env.DB.prepare('UPDATE users SET disabled=1 WHERE email=?')
    .bind('owner@cafe.test')
    .run();
  assert.equal((await s.owner.get('/api/owner/data/export')).status, 401);
});

test('guest card revocation disables old link and code while retaining immutable stamp ledger', async () => {
  const env = makeEnv(),
    s = await setupOrg(env),
    guest = client(env);
  const card = await guest.post('/api/cards', { org: s.orgSlug });
  assert.equal(card.status, 201);
  await s.cashier.post('/api/branch/loyalty/' + card.json.code + '/stamp', {
    idem_key: 'delete-stamp-123456',
  });
  const before = await env.DB.prepare(
    'SELECT COUNT(*) AS n,SUM(delta) AS balance FROM loyalty_ledger',
  ).first();
  assert.equal(
    (await guest.post('/api/cards/' + card.json.token + '/delete', {})).status,
    400,
  );
  const deletion = await guest.post(
    '/api/cards/' + card.json.token + '/delete',
    { confirm: 'DELETE CARD' },
  );
  assert.equal(deletion.status, 200, JSON.stringify(deletion.json));
  assert.equal(deletion.json.status, 'revoked');
  assert.equal(deletion.json.ledger_retained, true);
  assert.equal((await guest.get('/api/cards/' + card.json.token)).status, 404);
  assert.equal(
    (await s.cashier.get('/api/branch/loyalty/' + card.json.code)).status,
    404,
  );
  assert.equal(
    (
      await s.cashier.post('/api/branch/loyalty/' + card.json.code + '/stamp', {
        idem_key: 'delete-stamp-78901',
      })
    ).status,
    404,
  );
  const after = await env.DB.prepare(
    'SELECT COUNT(*) AS n,SUM(delta) AS balance FROM loyalty_ledger',
  ).first();
  assert.deepEqual(after, before);
  const retry = await guest.post('/api/cards/' + card.json.token + '/delete', {
    confirm: 'DELETE CARD',
  });
  assert.equal(retry.status, 200);
  assert.equal(retry.json.replayed, true);
  const changed = await env.DB.prepare(
    'SELECT token,code,revoked_at FROM loyalty_cards',
  ).first();
  assert.notEqual(changed.token, card.json.token);
  assert.notEqual(changed.code, card.json.code);
  assert.ok(changed.revoked_at);
  const revocation = await env.DB.prepare(
    'SELECT token_hash FROM revoked_card_tokens',
  ).first();
  assert.notEqual(revocation.token_hash, card.json.token);
  assert.equal(
    (
      await guest.post('/api/cards/not-a-real-card/delete', {
        confirm: 'DELETE CARD',
      })
    ).status,
    404,
  );
});
