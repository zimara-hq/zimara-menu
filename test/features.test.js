import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, setupOrg, client } from './helpers.js';
import { parseCsv } from '../src/features.js';

const row = {
  category_ar: 'قهوة',
  category_en: 'Coffee',
  name_ar: 'لاتيه',
  name_en: 'Latte',
  price: '18.50',
  calories: 120,
};
async function importItem(owner) {
  const r = await owner.post('/api/owner/menu/import/apply', { rows: [row] });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return (await owner.get('/api/owner/menu')).json.items[0];
}

test('CSV handles BOM, commas, escaped quotes and multiline values without evaluation', () => {
  const rows = parseCsv(
    '\uFEFFname_ar,name_en,category_ar,category_en,price\r\n"قهوة، حليب","Latte ""large""",قهوة,Coffee,18.50\r\n',
  );
  assert.equal(rows[0].name_en, 'Latte "large"');
  assert.equal(rows[0].price, '18.50');
  assert.throws(() => parseCsv('name_ar,name_ar\na,b'), /invalid_csv_headers/);
  assert.throws(() => parseCsv('name_ar\n"unterminated'), /invalid_csv/);
});

test('tenant profile round trips sector, hours and sections without leaking pager tokens', async () => {
  const env = makeEnv(),
    s = await setupOrg(env);
  const saved = await s.owner.patch('/api/owner/profile', {
    sector: 'clinic',
    description_ar: 'خدمات المركز',
    social_links: [{ label: 'الموقع', url: 'https://example.org' }],
    sections: ['menu', 'branches'],
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.json));
  assert.equal(
    (
      await s.owner.patch('/api/owner/branches/' + s.branchId + '/settings', {
        game: 'memory',
        orders_enabled: true,
        hours: [{ day: 0, open: '08:00', close: '23:00', closed: false }],
      })
    ).status,
    200,
  );
  const ticket = await s.cashier.post('/api/branch/tickets', {});
  const profile = await client(env).get('/api/public/profile/' + s.orgSlug);
  assert.equal(profile.status, 200);
  assert.equal(profile.json.profile.sector, 'clinic');
  assert.equal(profile.json.branches[0].settings.orders_enabled, true);
  assert.equal(profile.text.includes(ticket.json.token), false);
  assert.equal(
    (
      await s.owner.patch('/api/owner/profile', {
        social_links: [{ label: 'XSS', url: 'javascript:alert(1)' }],
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await s.owner.patch('/api/owner/branches/' + s.branchId + '/settings', {
        hours: [{ day: 0, open: '25:00', close: '23:00', closed: false }],
      })
    ).status,
    400,
  );
});

test('import preview reports row errors and apply is all or nothing with money in halalas', async () => {
  const env = makeEnv(),
    s = await setupOrg(env);
  let result = await s.owner.post('/api/owner/menu/import/preview', {
    rows: [row, { ...row, price: 'bad' }],
  });
  assert.equal(result.status, 200);
  assert.equal(result.json.valid, false);
  assert.equal(result.json.errors[0].field, 'price');
  result = await s.owner.post('/api/owner/menu/import/apply', {
    rows: [row, { ...row, price: 'bad' }],
  });
  assert.equal(result.status, 400);
  assert.equal((await s.owner.get('/api/owner/menu')).json.items.length, 0);
  const item = await importItem(s.owner);
  assert.equal(item.price, 1850);
  assert.equal(
    (await client(env).get('/api/public/menu/' + s.branchSlug)).json.items[0]
      .price,
    1850,
  );
});

test('revocable front display shows newest QR until customer links, never resurfaces an older QR', async () => {
  const env = makeEnv(),
    s = await setupOrg(env),
    guest = client(env);
  const d = await s.cashier.post('/api/branch/display-devices', {
    label: 'آيباد الكاشير',
  });
  assert.equal(d.status, 201, JSON.stringify(d.json));
  assert.equal(d.json.token.length, 43);
  const a = await s.cashier.post('/api/branch/tickets', {});
  const b = await s.cashier.post('/api/branch/tickets', {});
  let display = await guest.get('/api/public/display/' + d.json.token);
  assert.equal(display.status, 200);
  assert.equal(display.json.ticket.token, b.json.token);
  await guest.get('/api/t/' + b.json.token);
  display = await guest.get('/api/public/display/' + d.json.token);
  assert.equal(display.json.ticket, null);
  assert.equal(display.text.includes(a.json.token), false);
  assert.equal(
    (await s.cashier.get('/api/branch/display-devices')).text.includes(
      d.json.token,
    ),
    false,
  );
  const record = await env.DB.prepare(
    'SELECT token_hash FROM display_devices WHERE id=?',
  )
    .bind(d.json.id)
    .first();
  assert.notEqual(record.token_hash, d.json.token);
  assert.equal(
    (
      await s.cashier.post(
        '/api/branch/display-devices/' + d.json.id + '/revoke',
        {},
      )
    ).status,
    200,
  );
  assert.equal(
    (await guest.get('/api/public/display/' + d.json.token)).status,
    404,
  );
});

test('ordering is opt-in; server prices and idempotency survive retries and only cashier accepts', async () => {
  const env = makeEnv(),
    s = await setupOrg(env),
    guest = client(env),
    item = await importItem(s.owner);
  const input = {
    idem_key: 'order-idempotent-123456',
    items: [{ item_id: item.id, quantity: 2, price: 1 }],
  };
  assert.equal(
    (await guest.post('/api/public/orders/' + s.branchSlug, input)).status,
    409,
  );
  await s.owner.patch('/api/owner/branches/' + s.branchId + '/settings', {
    orders_enabled: true,
  });
  const created = await guest.post('/api/public/orders/' + s.branchSlug, input);
  assert.equal(created.status, 201, JSON.stringify(created.json));
  assert.equal(created.json.order.total, 3700);
  const retry = await guest.post('/api/public/orders/' + s.branchSlug, input);
  assert.equal(retry.json.order.id, created.json.order.id);
  const altered = await guest.post('/api/public/orders/' + s.branchSlug, {
    ...input,
    items: [{ item_id: item.id, quantity: 3 }],
  });
  assert.equal(altered.status, 409);
  assert.equal(
    (
      await guest.post(
        '/api/branch/orders/' + created.json.order.id + '/accept',
        { version: 1 },
      )
    ).status,
    401,
  );
  const accepted = await s.cashier.post(
    '/api/branch/orders/' + created.json.order.id + '/accept',
    { version: 1, invoice_number: 'POS-7788' },
  );
  assert.equal(accepted.status, 201, JSON.stringify(accepted.json));
  assert.equal(accepted.json.ticket.number, '1');
  assert.equal(
    (
      await s.cashier.post(
        '/api/branch/orders/' + created.json.order.id + '/accept',
        { version: 1 },
      )
    ).status,
    409,
  );
  const poll = await guest.get('/api/public/order/' + created.json.order.token);
  assert.equal(poll.json.order.status, 'accepted');
  assert.equal(poll.json.ticket.token, accepted.json.ticket.token);
  assert.equal(
    (await env.DB.prepare('SELECT COUNT(*) AS n FROM tickets').first()).n,
    1,
  );
});

test('profile and display management stay inside tenant and order items cannot cross tenants', async () => {
  const env = makeEnv(),
    s = await setupOrg(env),
    item = await importItem(s.owner);
  await s.admin.post('/api/admin/orgs', {
    name_ar: 'آخر',
    name_en: 'Other',
    owner: {
      email: 'other@example.test',
      name: 'Other',
      password: 'different-owner-123',
    },
  });
  const other = client(env);
  await other.login('other@example.test', 'different-owner-123');
  assert.equal(
    (await other.get('/api/owner/branches/' + s.branchId + '/settings')).status,
    404,
  );
  assert.equal(
    (
      await other.post(
        '/api/owner/branches/' + s.branchId + '/display-devices',
        { label: 'attack' },
      )
    ).status,
    404,
  );
  const created = await other.post('/api/owner/branches', {
    name_ar: 'آخر',
    name_en: 'Other',
    account: {
      email: 'other-branch@example.test',
      name: 'Other',
      password: 'different-branch-123',
    },
  });
  await other.patch('/api/owner/branches/' + created.json.id + '/settings', {
    orders_enabled: true,
  });
  assert.equal(
    (
      await client(env).post('/api/public/orders/' + created.json.slug, {
        idem_key: 'cross-tenant-order-123',
        items: [{ item_id: item.id, quantity: 1 }],
      })
    ).status,
    400,
  );
});

test('asset uploader fails honestly without storage and validates magic bytes before storing', async () => {
  const env = makeEnv(),
    s = await setupOrg(env);
  assert.equal(
    (
      await s.owner.post('/api/owner/assets', {
        mime: 'image/png',
        data: btoa('not actually png'),
      })
    ).status,
    503,
  );
  const stored = new Map();
  env.MEDIA = {
    put: async (k, b) => stored.set(k, b),
    get: async (k) => (stored.has(k) ? { body: stored.get(k) } : null),
    delete: async (k) => stored.delete(k),
  };
  assert.equal(
    (
      await s.owner.post('/api/owner/assets', {
        mime: 'image/png',
        data: btoa('<svg onload=alert(1)>'),
      })
    ).status,
    400,
  );
  const data = btoa('wOF2' + '\0'.repeat(24));
  const uploaded = await s.owner.post('/api/owner/assets', {
    mime: 'font/woff2',
    data,
  });
  assert.equal(uploaded.status, 201, JSON.stringify(uploaded.json));
  assert.equal(
    (await s.owner.patch('/api/owner/profile', { font_url: uploaded.json.url }))
      .status,
    200,
  );
  const asset = await client(env).get(uploaded.json.url);
  assert.equal(asset.status, 200);
  assert.equal(asset.headers.get('content-type'), 'font/woff2');
});

test('import idempotency replays a complete import and rejects changed content', async () => {
  const env = makeEnv(),
    s = await setupOrg(env),
    request = { rows: [row], idem_key: 'import-idempotent-12345' };
  const first = await s.owner.post('/api/owner/menu/import/apply', request);
  assert.equal(first.status, 201);
  const replay = await s.owner.post('/api/owner/menu/import/apply', request);
  assert.equal(replay.status, 200);
  assert.equal(replay.json.replayed, true);
  assert.equal((await s.owner.get('/api/owner/menu')).json.items.length, 1);
  assert.equal(
    (
      await s.owner.post('/api/owner/menu/import/apply', {
        ...request,
        rows: [{ ...row, price: '19.00' }],
      })
    ).status,
    409,
  );
  assert.equal((await s.owner.get('/api/owner/menu')).json.items.length, 1);
});

test('paid plan item limits apply to imports and a suspended subscription rejects new public orders', async () => {
  const env = makeEnv(),
    s = await setupOrg(env),
    item = await importItem(s.owner);
  await s.owner.patch('/api/owner/branches/' + s.branchId + '/settings', {
    orders_enabled: true,
  });
  const org = await env.DB.prepare('SELECT org_id FROM branches WHERE id=?')
    .bind(s.branchId)
    .first();
  const time = Date.now();
  await env.DB.prepare(
    "INSERT INTO subscriptions(org_id,plan,status,created_at,updated_at) VALUES(?,'pager','active',?,?)",
  )
    .bind(org.org_id, time, time)
    .run();
  assert.equal(
    (await s.owner.post('/api/owner/menu/import/apply', { rows: [row] }))
      .status,
    409,
  );
  await env.DB.prepare(
    "UPDATE subscriptions SET status='suspended' WHERE org_id=?",
  )
    .bind(org.org_id)
    .run();
  const order = await client(env).post('/api/public/orders/' + s.branchSlug, {
    idem_key: 'suspended-orders-1234',
    items: [{ item_id: item.id, quantity: 1 }],
  });
  assert.equal(order.status, 402);
  assert.equal(
    (await client(env).get('/api/public/profile/' + s.orgSlug)).status,
    200,
  );
  assert.equal(
    (await env.DB.prepare('SELECT COUNT(*) AS n FROM customer_orders').first())
      .n,
    0,
  );
});

test('normalized import preview can be applied without multiplying currency twice', async () => {
  const env = makeEnv(),
    s = await setupOrg(env);
  const preview = await s.owner.post('/api/owner/menu/import/preview', {
    rows: [row],
  });
  assert.equal(preview.json.rows[0].price_halalas, 1850);
  const result = await s.owner.post('/api/owner/menu/import/apply', {
    rows: preview.json.rows,
  });
  assert.equal(result.status, 201);
  assert.equal(
    (await s.owner.get('/api/owner/menu')).json.items[0].price,
    1850,
  );
});
