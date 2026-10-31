import { loadUser, verifyPassword } from './auth.js';
import {
  requireRole,
  body,
  audit,
  assertPlanQuota,
  assertOrgWritable,
  rateLimit,
} from './context.js';
import {
  HttpError,
  bad,
  notFound,
  conflict,
  str,
  int,
  url,
  id,
  now,
  randomToken,
  hmac,
} from './util.js';

const SECTORS = new Set(['cafe', 'restaurant', 'clinic', 'bank', 'service']);
const SECTIONS = new Set(['menu', 'branches', 'hours', 'social', 'loyalty']);
const DEFAULT_PROFILE = {
  sector: 'cafe',
  description_ar: '',
  description_en: '',
  phone: '',
  address: '',
  social_links: [],
  banners: [],
  sections: [...SECTIONS],
  font_url: null,
};
const DEFAULT_SETTINGS = {
  orders_enabled: false,
  address: '',
  maps_url: null,
  hours: [],
  game: 'none',
};
const TTL = 12 * 3600 * 1000;

function profileView(row) {
  if (!row) return { ...DEFAULT_PROFILE };
  return {
    sector: row.sector,
    description_ar: row.description_ar,
    description_en: row.description_en,
    phone: row.phone,
    address: row.address,
    social_links: JSON.parse(row.social_json),
    banners: JSON.parse(row.banners_json),
    sections: JSON.parse(row.sections_json),
    font_url: row.font_url,
  };
}
function settingsView(row) {
  if (!row) return { ...DEFAULT_SETTINGS };
  return {
    orders_enabled: !!row.orders_enabled,
    address: row.address,
    maps_url: row.maps_url,
    hours: JSON.parse(row.hours_json),
    game: row.game,
  };
}
function text(v, field, max = 600) {
  return str(v, field, { max, optional: true }) ?? '';
}
function https(v, field) {
  const value = url(v, field);
  if (!value || value.startsWith('/api/assets/')) return value;
  const parsed = new URL(value);
  if (parsed.username || parsed.password) throw bad('invalid_' + field);
  return value;
}
function list(v, field, max = 12) {
  if (!Array.isArray(v) || v.length > max) throw bad('invalid_' + field);
  return v;
}
function validateProfile(b, current) {
  const p = { ...current };
  if (b.sector !== undefined) {
    if (!SECTORS.has(b.sector)) throw bad('invalid_sector');
    p.sector = b.sector;
  }
  for (const field of ['description_ar', 'description_en', 'address'])
    if (b[field] !== undefined) p[field] = text(b[field], field, 800);
  if (b.phone !== undefined) {
    p.phone = text(b.phone, 'phone', 30);
    if (p.phone && !/^[+0-9 ()-]{5,30}$/.test(p.phone))
      throw bad('invalid_phone');
  }
  if (b.social_links !== undefined)
    p.social_links = list(b.social_links, 'social_links').map((x) => ({
      label: str(x?.label, 'label', { max: 40 }),
      url: https(str(x?.url, 'url', { max: 500 }), 'url'),
    }));
  if (b.banners !== undefined)
    p.banners = list(b.banners, 'banners', 8).map((x) => ({
      image_url: https(
        str(x?.image_url, 'image_url', { max: 500 }),
        'image_url',
      ),
      alt_ar: text(x?.alt_ar, 'alt_ar', 120),
      alt_en: text(x?.alt_en, 'alt_en', 120),
      href: https(x?.href, 'href'),
    }));
  if (b.sections !== undefined) {
    p.sections = list(b.sections, 'sections', 5);
    if (
      p.sections.some((x) => !SECTIONS.has(x)) ||
      new Set(p.sections).size !== p.sections.length
    )
      throw bad('invalid_sections');
  }
  if (b.font_url !== undefined) {
    if (
      b.font_url !== null &&
      (typeof b.font_url !== 'string' ||
        !/^\/api\/assets\/[a-z0-9-]{36}$/.test(b.font_url))
    )
      throw bad('invalid_font_url');
    p.font_url = b.font_url;
  }
  return p;
}
function validateSettings(b, current) {
  const s = { ...current };
  if (b.orders_enabled !== undefined) {
    if (typeof b.orders_enabled !== 'boolean')
      throw bad('invalid_orders_enabled');
    s.orders_enabled = b.orders_enabled;
  }
  if (b.address !== undefined) s.address = text(b.address, 'address', 500);
  if (b.maps_url !== undefined) s.maps_url = https(b.maps_url, 'maps_url');
  if (b.game !== undefined) {
    if (!['none', 'memory', 'beans'].includes(b.game))
      throw bad('invalid_game');
    s.game = b.game;
  }
  if (b.hours !== undefined) {
    const days = new Set();
    s.hours = list(b.hours, 'hours', 7).map((h) => {
      const day = int(h?.day, 'day', { max: 6 });
      if (days.has(day)) throw bad('duplicate_day');
      days.add(day);
      if (typeof h.closed !== 'boolean') throw bad('invalid_closed');
      const open = h.closed ? null : str(h.open, 'open', { max: 5 });
      const close = h.closed ? null : str(h.close, 'close', { max: 5 });
      if (
        !h.closed &&
        (!/^([01]\d|2[0-3]):[0-5]\d$/.test(open) ||
          !/^([01]\d|2[0-3]):[0-5]\d$/.test(close))
      )
        throw bad('invalid_hours');
      return { day, open, close, closed: h.closed };
    });
  }
  return s;
}
async function ownedBranch(c, branchId) {
  const b = await c.env.DB.prepare(
    'SELECT * FROM branches WHERE id = ? AND org_id = ?',
  )
    .bind(branchId, c.get('user').org_id)
    .first();
  if (!b) throw notFound();
  return b;
}
async function activeBranch(env, slug) {
  const b = await env.DB.prepare(
    'SELECT b.*,o.slug AS org_slug,o.name_ar AS org_name_ar,o.name_en AS org_name_en,o.logo_url,o.brand_color FROM branches b JOIN orgs o ON o.id=b.org_id WHERE b.slug=? AND b.active=1 AND o.active=1',
  )
    .bind(slug)
    .first();
  if (!b) throw notFound();
  return b;
}
function branchPublic(b) {
  return {
    id: b.id,
    slug: b.slug,
    name_ar: b.name_ar,
    name_en: b.name_en,
    google_review_url: b.google_review_url,
  };
}
async function menuFor(env, orgId, branchId) {
  const { results: categories } = await env.DB.prepare(
    'SELECT id,name_ar,name_en,sort FROM categories WHERE org_id=? AND active=1 ORDER BY sort,name_ar',
  )
    .bind(orgId)
    .all();
  const { results: items } = await env.DB.prepare(
    `SELECT i.id,i.category_id,i.name_ar,i.name_en,i.desc_ar,i.desc_en,i.price,i.calories,i.image_url,i.sort,CASE WHEN u.item_id IS NULL THEN 1 ELSE 0 END AS available FROM items i JOIN categories c ON c.id=i.category_id LEFT JOIN branch_unavailable u ON u.item_id=i.id AND u.branch_id=? WHERE i.org_id=? AND i.active=1 AND c.active=1 ORDER BY i.sort,i.name_ar`,
  )
    .bind(branchId, orgId)
    .all();
  return { categories, items };
}

// Bounded RFC-4180 parser: quoted fields, embedded line breaks, BOM; no code evaluation.
export function parseCsv(value) {
  if (typeof value !== 'string' || value.length > 500_000)
    throw bad('invalid_csv');
  const input = value.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [],
    cell = '',
    quoted = false,
    afterQuote = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          afterQuote = true;
        }
      } else cell += ch;
    } else if (ch === '"') {
      if (cell || afterQuote) throw bad('invalid_csv');
      quoted = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
      afterQuote = false;
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      cell = '';
      afterQuote = false;
    } else {
      if (afterQuote && ch !== ' ' && ch !== '\t') throw bad('invalid_csv');
      if (!afterQuote) cell += ch;
    }
    if (rows.length > 1001 || cell.length > 10000) throw bad('csv_limit');
  }
  if (quoted) throw bad('invalid_csv');
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  if (rows.length < 2) throw bad('empty_csv');
  const headers = rows.shift().map((x) => x.trim());
  if (
    new Set(headers).size !== headers.length ||
    headers.some(
      (h) =>
        ![
          'category_ar',
          'category_en',
          'name_ar',
          'name_en',
          'price',
          'calories',
          'image_url',
          'desc_ar',
          'desc_en',
        ].includes(h),
    )
  )
    throw bad('invalid_csv_headers');
  return rows.map((values, index) => {
    if (values.length !== headers.length)
      throw bad('csv_column_count_row_' + (index + 2));
    return Object.fromEntries(headers.map((h, i) => [h, values[i]]));
  });
}
function importPreview(b) {
  const input =
    b.csv !== undefined ? parseCsv(b.csv) : list(b.rows, 'rows', 1000);
  if (!input.length) throw bad('empty_import');
  const errors = [],
    rows = [];
  input.forEach((row, index) => {
    const out = {};
    const take = (field, fn) => {
      try {
        out[field] = fn();
      } catch (e) {
        errors.push({ row: index + 2, field, code: e.code || 'invalid_value' });
      }
    };
    for (const f of ['category_ar', 'category_en', 'name_ar', 'name_en'])
      take(f, () =>
        str(row?.[f], f, { max: f.startsWith('category') ? 60 : 80 }),
      );
    take('price', () => {
      if (row?.price_halalas !== undefined)
        return int(row.price_halalas, 'price_halalas', { max: 99_999_999 });
      const p = String(row?.price ?? '').trim();
      if (!/^\d{1,6}(\.\d{1,2})?$/.test(p)) throw bad('invalid_price');
      const [whole, decimal = ''] = p.split('.');
      return Number(whole) * 100 + Number(decimal.padEnd(2, '0'));
    });
    take('calories', () =>
      int(row?.calories, 'calories', { optional: true, max: 10000 }),
    );
    take('image_url', () => https(row?.image_url, 'image_url'));
    for (const f of ['desc_ar', 'desc_en'])
      take(f, () => text(row?.[f], f, 400));
    if (out.price !== undefined) out.price_halalas = out.price;
    rows.push(out);
  });
  return { valid: errors.length === 0, errors, rows, count: rows.length };
}
async function deviceCreate(c, branch) {
  const b = await body(c);
  const label = str(b.label, 'label', { max: 80 });
  const did = id(),
    token = randomToken(32);
  const row = await c.env.DB.prepare(
    'SELECT COUNT(*) AS n FROM display_devices WHERE branch_id=? AND revoked_at IS NULL',
  )
    .bind(branch.id)
    .first();
  if (row.n >= 20) throw conflict('display_limit');
  const inserted = await c.env.DB.prepare(
    'INSERT INTO display_devices(id,org_id,branch_id,token_hash,label,created_at) SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM display_devices WHERE branch_id=? AND revoked_at IS NULL)<20',
  )
    .bind(
      did,
      branch.org_id,
      branch.id,
      await hmac(c.env.AUTH_SECRET, 'display:' + token),
      label,
      now(),
      branch.id,
    )
    .run();
  if (!inserted.meta.changes) throw conflict('display_limit');
  await audit(c.env, c.get('user'), 'display.create', {
    branch: branch.id,
    id: did,
  });
  return c.json({ id: did, token, url: '/display/' + token }, 201);
}
async function deviceList(c, branchId) {
  const { results } = await c.env.DB.prepare(
    'SELECT id,label,created_at,last_seen_at,revoked_at FROM display_devices WHERE branch_id=? ORDER BY created_at DESC LIMIT 100',
  )
    .bind(branchId)
    .all();
  return c.json({ devices: results });
}
async function deviceRevoke(c, branchId) {
  const result = await c.env.DB.prepare(
    'UPDATE display_devices SET revoked_at=? WHERE id=? AND branch_id=? AND revoked_at IS NULL',
  )
    .bind(now(), c.req.param('id'), branchId)
    .run();
  if (!result.meta.changes) throw notFound();
  await audit(c.env, c.get('user'), 'display.revoke', {
    branch: branchId,
    id: c.req.param('id'),
  });
  return c.json({ ok: true });
}
function orderView(row) {
  const { fingerprint, idem_key, org_id, branch_id, items_json, ...rest } = row;
  return { ...rest, items: JSON.parse(items_json) };
}

// Data rights remain available after a subscription expires. This narrow guard
// deliberately does not grant any other operational write to a suspended tenant.
async function privacyOwner(c, next) {
  const user = await loadUser(c.env, c.req.raw);
  if (!user) throw new HttpError(401, 'unauthenticated');
  if (user.role !== 'owner' || !user.org_id)
    throw new HttpError(403, 'forbidden');
  c.set('user', user);
  await next();
}

// Every projection is explicit: export never serialises session material, API
// secrets, encrypted credentials, bearer tokens, short loyalty codes or passwords.
const EXPORT_DATASETS = {
  branches: {
    sql: 'SELECT id,slug,name_ar,name_en,google_review_url,active,created_at FROM branches WHERE org_id=? AND id>? ORDER BY id LIMIT ?',
  },
  categories: {
    sql: 'SELECT id,name_ar,name_en,sort,active FROM categories WHERE org_id=? AND id>? ORDER BY id LIMIT ?',
  },
  items: {
    sql: 'SELECT id,category_id,name_ar,name_en,desc_ar,desc_en,price,calories,image_url,sort,active FROM items WHERE org_id=? AND id>? ORDER BY id LIMIT ?',
  },
  tickets: {
    sql: 'SELECT id,branch_id,number,invoice_number,status,linked_at,ready_at,seen_at,collected_at,rating,rating_comment,created_at,version FROM tickets WHERE org_id=? AND id>? ORDER BY id LIMIT ?',
  },
  orders: {
    sql: 'SELECT id,branch_id,status,total,items_json,ticket_id,version,created_at FROM customer_orders WHERE org_id=? AND id>? ORDER BY id LIMIT ?',
  },
  loyalty_cards: {
    sql: 'SELECT id,created_at,revoked_at FROM loyalty_cards WHERE org_id=? AND id>? ORDER BY id LIMIT ?',
  },
  loyalty_ledger: {
    sql: 'SELECT l.id,l.card_id,l.branch_id,l.kind,l.delta,l.balance_after,l.created_at FROM loyalty_ledger l JOIN loyalty_cards c ON c.id=l.card_id WHERE c.org_id=? AND l.id>? ORDER BY l.id LIMIT ?',
  },
  display_devices: {
    sql: 'SELECT id,branch_id,label,created_at,last_seen_at,revoked_at FROM display_devices WHERE org_id=? AND id>? ORDER BY id LIMIT ?',
  },
  invoices: {
    sql: 'SELECT id,provider,number,state,currency,subtotal,vat,total,issued_at,created_at FROM subscription_invoices WHERE org_id=? AND id>? ORDER BY id LIMIT ?',
  },
  integrations: {
    sql: 'SELECT id,branch_id,provider,label,active,created_at,revoked_at FROM pos_connections WHERE org_id=? AND id>? ORDER BY id LIMIT ?',
  },
  assets: {
    sql: 'SELECT id,mime,size,kind,created_at FROM tenant_assets WHERE org_id=? AND id>? ORDER BY id LIMIT ?',
  },
  audit: {
    sql: "SELECT id,action,created_at FROM audit_log WHERE org_id=? AND action!='data.export' AND id>? ORDER BY id LIMIT ?",
  },
};

export function registerFeatures(app) {
  app.get('/api/owner/data/export', privacyOwner, async (c) => {
    const orgId = c.get('user').org_id;
    const dataset = c.req.query('dataset');
    const size = int(c.req.query('page_size') ?? 200, 'page_size', {
      min: 1,
      max: 1000,
    });
    const after =
      str(c.req.query('after'), 'after', { optional: true, max: 60 }) ?? '';
    if (dataset !== undefined && !Object.hasOwn(EXPORT_DATASETS, dataset))
      throw bad('invalid_dataset');
    if (!dataset && after) throw bad('dataset_required_for_cursor');
    const organization = await c.env.DB.prepare(
      'SELECT id,slug,name_ar,name_en,brand_color,logo_url,active,created_at FROM orgs WHERE id=?',
    )
      .bind(orgId)
      .first();
    if (!organization) throw notFound();
    const data = {},
      pages = {};
    for (const name of dataset ? [dataset] : Object.keys(EXPORT_DATASETS)) {
      const { results } = await c.env.DB.prepare(EXPORT_DATASETS[name].sql)
        .bind(orgId, after, size + 1)
        .all();
      const rows = results.slice(0, size);
      data[name] = rows;
      const next = results.length > size ? rows.at(-1).id : null;
      pages[name] = {
        count: rows.length,
        has_more: next !== null,
        next_after: next,
        next_url: next
          ? '/api/owner/data/export?dataset=' +
            name +
            '&after=' +
            encodeURIComponent(next) +
            '&page_size=' +
            size
          : null,
      };
    }
    const { results: settings } = await c.env.DB.prepare(
      'SELECT s.branch_id,s.orders_enabled,s.address,s.maps_url,s.hours_json,s.game FROM branch_settings s JOIN branches b ON b.id=s.branch_id WHERE b.org_id=?',
    )
      .bind(orgId)
      .all();
    const profile = profileView(
      await c.env.DB.prepare('SELECT * FROM org_profiles WHERE org_id=?')
        .bind(orgId)
        .first(),
    );
    const subscription = await c.env.DB.prepare(
      'SELECT plan,status,trial_ends_at,current_period_end,cancel_at_period_end,created_at,updated_at FROM subscriptions WHERE org_id=?',
    )
      .bind(orgId)
      .first();
    const program = await c.env.DB.prepare(
      'SELECT stamps_required,reward_ar,reward_en,active FROM loyalty_programs WHERE org_id=?',
    )
      .bind(orgId)
      .first();
    const exportData = {
      schema_version: 1,
      exported_at: now(),
      organization,
      profile,
      branch_settings: settings,
      subscription,
      loyalty_program: program,
      data,
      pages,
      complete: Object.values(pages).every((p) => !p.has_more),
      note: 'Follow each next_url until has_more is false. This is a paginated live export, not a transactional point-in-time backup.',
    };
    await audit(c.env, c.get('user'), 'data.export', {
      dataset: dataset ?? 'all',
      counts: Object.fromEntries(
        Object.entries(pages).map(([key, value]) => [key, value.count]),
      ),
    });
    c.header(
      'Content-Disposition',
      'attachment; filename="zimara-organization-export.json"',
    );
    return c.json(exportData);
  });
  app.get('/api/owner/data/deletion-request', privacyOwner, async (c) => {
    const request = await c.env.DB.prepare(
      'SELECT id,status,created_at,updated_at FROM data_deletion_requests WHERE org_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1',
    )
      .bind(c.get('user').org_id)
      .first();
    return c.json({ request });
  });
  app.post('/api/owner/data/deletion-request', privacyOwner, async (c) => {
    await rateLimit(c, 'data-deletion', { limit: 5, window: 900000 });
    const b = await body(c),
      u = c.get('user');
    if (b.confirm !== 'DELETE ORGANIZATION')
      throw bad('explicit_confirmation_required');
    const password = str(b.password, 'password', { max: 200 });
    const user = await c.env.DB.prepare(
      'SELECT password_hash FROM users WHERE id=?',
    )
      .bind(u.id)
      .first();
    if (!user || !(await verifyPassword(password, user.password_hash)))
      throw new HttpError(401, 'wrong_password');
    const stamp = now();
    const result = await c.env.DB.prepare(
      "INSERT INTO data_deletion_requests(id,org_id,requested_by,status,created_at,updated_at) VALUES(?,?,?,'pending',?,?) ON CONFLICT DO NOTHING",
    )
      .bind(id(), u.org_id, u.id, stamp, stamp)
      .run();
    const request = await c.env.DB.prepare(
      "SELECT id,status,created_at,updated_at FROM data_deletion_requests WHERE org_id=? AND status='pending'",
    )
      .bind(u.org_id)
      .first();
    if (result.meta.changes)
      await audit(c.env, u, 'data.deletion.request', { id: request.id });
    return c.json(
      { request, message: 'deletion_request_pending_review', deleted: false },
      result.meta.changes ? 201 : 200,
    );
  });
  app.post(
    '/api/owner/data/deletion-request/:id/cancel',
    privacyOwner,
    async (c) => {
      const u = c.get('user');
      const result = await c.env.DB.prepare(
        "UPDATE data_deletion_requests SET status='cancelled',updated_at=? WHERE id=? AND org_id=? AND requested_by=? AND status='pending'",
      )
        .bind(now(), c.req.param('id'), u.org_id, u.id)
        .run();
      if (!result.meta.changes) throw notFound();
      await audit(c.env, u, 'data.deletion.cancel', { id: c.req.param('id') });
      return c.json({ status: 'cancelled' });
    },
  );
  app.post('/api/cards/:token/delete', async (c) => {
    await rateLimit(c, 'card-deletion', { limit: 10, window: 900000 });
    const b = await body(c);
    if (b.confirm !== 'DELETE CARD')
      throw bad('explicit_confirmation_required');
    const token = c.req.param('token');
    if (!/^[A-Za-z0-9_-]{24,64}$/.test(token)) throw notFound();
    const tokenHash = await hmac(c.env.AUTH_SECRET, 'revoked-card:' + token);
    const card = await c.env.DB.prepare(
      'SELECT id,org_id FROM loyalty_cards WHERE token=? AND revoked_at IS NULL',
    )
      .bind(token)
      .first();
    if (!card) {
      const previous = await c.env.DB.prepare(
        'SELECT card_id FROM revoked_card_tokens WHERE token_hash=?',
      )
        .bind(tokenHash)
        .first();
      if (!previous) throw notFound();
      return c.json({
        status: 'revoked',
        ledger_retained: true,
        replayed: true,
      });
    }
    const replacement = randomToken(32),
      stamp = now();
    await c.env.DB.batch([
      c.env.DB.prepare(
        'UPDATE loyalty_cards SET token=?,code=?,revoked_at=? WHERE id=? AND token=? AND revoked_at IS NULL',
      ).bind(
        replacement,
        'REVOKED-' + randomToken(24).toUpperCase(),
        stamp,
        card.id,
        token,
      ),
      c.env.DB.prepare(
        'INSERT INTO revoked_card_tokens(token_hash,card_id,org_id,revoked_at) SELECT ?,id,org_id,? FROM loyalty_cards WHERE id=? AND token=? AND revoked_at=? ON CONFLICT(token_hash) DO NOTHING',
      ).bind(tokenHash, stamp, card.id, replacement, stamp),
    ]);
    await audit(c.env, { org_id: card.org_id }, 'loyalty.revoke', {
      card: card.id,
    });
    return c.json({
      status: 'revoked',
      ledger_retained: true,
      note: 'The old card link and cashier code no longer work. The historical stamp and redemption ledger is retained; this is credential revocation, not complete erasure.',
    });
  });

  app.get('/api/owner/profile', requireRole('owner'), async (c) =>
    c.json({
      profile: profileView(
        await c.env.DB.prepare('SELECT * FROM org_profiles WHERE org_id=?')
          .bind(c.get('user').org_id)
          .first(),
      ),
    }),
  );
  app.patch('/api/owner/profile', requireRole('owner'), async (c) => {
    const u = c.get('user');
    const current = profileView(
      await c.env.DB.prepare('SELECT * FROM org_profiles WHERE org_id=?')
        .bind(u.org_id)
        .first(),
    );
    const p = validateProfile(await body(c), current);
    if (p.font_url) {
      const asset = await c.env.DB.prepare(
        "SELECT id FROM tenant_assets WHERE id=? AND org_id=? AND kind='font'",
      )
        .bind(p.font_url.split('/').at(-1), u.org_id)
        .first();
      if (!asset) throw bad('invalid_font_url');
    }
    await c.env.DB.prepare(
      `INSERT INTO org_profiles(org_id,sector,description_ar,description_en,phone,address,social_json,banners_json,sections_json,font_url,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11) ON CONFLICT(org_id) DO UPDATE SET sector=?2,description_ar=?3,description_en=?4,phone=?5,address=?6,social_json=?7,banners_json=?8,sections_json=?9,font_url=?10,updated_at=?11`,
    )
      .bind(
        u.org_id,
        p.sector,
        p.description_ar,
        p.description_en,
        p.phone,
        p.address,
        JSON.stringify(p.social_links),
        JSON.stringify(p.banners),
        JSON.stringify(p.sections),
        p.font_url,
        now(),
      )
      .run();
    await audit(c.env, u, 'profile.update');
    return c.json({ profile: p });
  });
  app.get('/api/public/profile/:orgSlug', async (c) => {
    const org = await c.env.DB.prepare(
      'SELECT id,slug,name_ar,name_en,brand_color,logo_url FROM orgs WHERE slug=? AND active=1',
    )
      .bind(c.req.param('orgSlug'))
      .first();
    if (!org) throw notFound();
    const profile = profileView(
      await c.env.DB.prepare('SELECT * FROM org_profiles WHERE org_id=?')
        .bind(org.id)
        .first(),
    );
    const { results: branches } = await c.env.DB.prepare(
      'SELECT b.id,b.slug,b.name_ar,b.name_en,b.google_review_url,s.orders_enabled,s.address,s.maps_url,s.hours_json,s.game FROM branches b LEFT JOIN branch_settings s ON s.branch_id=b.id WHERE b.org_id=? AND b.active=1 ORDER BY b.created_at',
    )
      .bind(org.id)
      .all();
    const program = await c.env.DB.prepare(
      'SELECT stamps_required,reward_ar,reward_en FROM loyalty_programs WHERE org_id=? AND active=1',
    )
      .bind(org.id)
      .first();
    const { id: _id, ...info } = org;
    return c.json({
      org: info,
      profile,
      loyalty: program || null,
      branches: branches.map((b) => ({
        ...branchPublic(b),
        settings:
          b.hours_json === null ? { ...DEFAULT_SETTINGS } : settingsView(b),
      })),
      timezone: 'Asia/Riyadh',
    });
  });
  app.get(
    '/api/owner/branches/:branchId/settings',
    requireRole('owner'),
    async (c) => {
      const branch = await ownedBranch(c, c.req.param('branchId'));
      return c.json({
        settings: settingsView(
          await c.env.DB.prepare(
            'SELECT * FROM branch_settings WHERE branch_id=?',
          )
            .bind(branch.id)
            .first(),
        ),
      });
    },
  );
  app.patch(
    '/api/owner/branches/:branchId/settings',
    requireRole('owner'),
    async (c) => {
      const branch = await ownedBranch(c, c.req.param('branchId'));
      const s = validateSettings(
        await body(c),
        settingsView(
          await c.env.DB.prepare(
            'SELECT * FROM branch_settings WHERE branch_id=?',
          )
            .bind(branch.id)
            .first(),
        ),
      );
      await c.env.DB.prepare(
        `INSERT INTO branch_settings(branch_id,orders_enabled,address,maps_url,hours_json,game,updated_at) VALUES(?1,?2,?3,?4,?5,?6,?7) ON CONFLICT(branch_id) DO UPDATE SET orders_enabled=?2,address=?3,maps_url=?4,hours_json=?5,game=?6,updated_at=?7`,
      )
        .bind(
          branch.id,
          s.orders_enabled ? 1 : 0,
          s.address,
          s.maps_url,
          JSON.stringify(s.hours),
          s.game,
          now(),
        )
        .run();
      await audit(c.env, c.get('user'), 'branch.settings', {
        branch: branch.id,
      });
      return c.json({ settings: s });
    },
  );
  app.get(
    '/api/owner/menu/import/template',
    requireRole('owner'),
    (c) =>
      new Response(
        'category_ar,category_en,name_ar,name_en,price,calories,image_url,desc_ar,desc_en\nقهوة,Coffee,لاتيه,Latte,18.50,120,,,\n',
        {
          headers: {
            'content-type': 'text/csv;charset=utf-8',
            'content-disposition':
              'attachment; filename="zimara-menu-template.csv"',
          },
        },
      ),
  );
  app.post('/api/owner/menu/import/preview', requireRole('owner'), async (c) =>
    c.json(importPreview(await body(c))),
  );
  app.post('/api/owner/menu/import/apply', requireRole('owner'), async (c) => {
    const requestBody = await body(c);
    const result = importPreview(requestBody);
    if (!result.valid)
      return c.json({ ...result, error: 'import_validation' }, 400);
    const u = c.get('user');
    const request = requestBody;
    const idem =
      request.idem_key === undefined
        ? null
        : str(request.idem_key, 'idem_key', { min: 16, max: 100 });
    const fingerprint = idem
      ? await hmac(c.env.AUTH_SECRET, JSON.stringify(result.rows))
      : null;
    if (idem) {
      const prior = await c.env.DB.prepare(
        'SELECT item_count,fingerprint FROM menu_imports WHERE org_id=? AND idem_key=?',
      )
        .bind(u.org_id, idem)
        .first();
      if (prior) {
        if (prior.fingerprint !== fingerprint)
          throw conflict('idem_key_reused');
        return c.json({
          imported: prior.item_count,
          count: prior.item_count,
          replayed: true,
        });
      }
    }
    await assertPlanQuota(c.env, u.org_id, 'items', result.count);
    const { results: existing } = await c.env.DB.prepare(
      'SELECT id,name_ar,name_en FROM categories WHERE org_id=?',
    )
      .bind(u.org_id)
      .all();
    const categories = new Map(
      existing.map((x) => [JSON.stringify([x.name_ar, x.name_en]), x.id]),
    );
    const statements = [];
    for (const row of result.rows) {
      const key = JSON.stringify([row.category_ar, row.category_en]);
      let cid = categories.get(key);
      if (!cid) {
        cid = id();
        categories.set(key, cid);
        statements.push(
          c.env.DB.prepare(
            'INSERT INTO categories(id,org_id,name_ar,name_en) VALUES(?,?,?,?)',
          ).bind(cid, u.org_id, row.category_ar, row.category_en),
        );
      }
      statements.push(
        c.env.DB.prepare(
          'INSERT INTO items(id,org_id,category_id,name_ar,name_en,price,calories,image_url,desc_ar,desc_en) VALUES(?,?,?,?,?,?,?,?,?,?)',
        ).bind(
          id(),
          u.org_id,
          cid,
          row.name_ar,
          row.name_en,
          row.price,
          row.calories,
          row.image_url,
          row.desc_ar,
          row.desc_en,
        ),
      );
    }
    statements.push(
      c.env.DB.prepare(
        'INSERT INTO menu_imports(id,org_id,user_id,item_count,created_at,idem_key,fingerprint) VALUES(?,?,?,?,?,?,?)',
      ).bind(id(), u.org_id, u.id, result.count, now(), idem, fingerprint),
    );
    try {
      await c.env.DB.batch(statements);
    } catch (error) {
      if (idem) {
        const prior = await c.env.DB.prepare(
          'SELECT item_count,fingerprint FROM menu_imports WHERE org_id=? AND idem_key=?',
        )
          .bind(u.org_id, idem)
          .first();
        if (prior) {
          if (prior.fingerprint !== fingerprint)
            throw conflict('idem_key_reused');
          return c.json({
            imported: prior.item_count,
            count: prior.item_count,
            replayed: true,
          });
        }
      }
      throw error;
    }
    await audit(c.env, u, 'menu.import', { count: result.count });
    return c.json({ imported: result.count, count: result.count }, 201);
  });

  app.get('/api/branch/display-devices', requireRole('branch'), (c) =>
    deviceList(c, c.get('user').branch_id),
  );
  app.post('/api/branch/display-devices', requireRole('branch'), async (c) =>
    deviceCreate(c, await ownedBranch(c, c.get('user').branch_id)),
  );
  app.post(
    '/api/branch/display-devices/:id/revoke',
    requireRole('branch'),
    (c) => deviceRevoke(c, c.get('user').branch_id),
  );
  app.get(
    '/api/owner/branches/:branchId/display-devices',
    requireRole('owner'),
    async (c) => {
      const b = await ownedBranch(c, c.req.param('branchId'));
      return deviceList(c, b.id);
    },
  );
  app.post(
    '/api/owner/branches/:branchId/display-devices',
    requireRole('owner'),
    async (c) => deviceCreate(c, await ownedBranch(c, c.req.param('branchId'))),
  );
  app.post(
    '/api/owner/branches/:branchId/display-devices/:id/revoke',
    requireRole('owner'),
    async (c) => {
      const b = await ownedBranch(c, c.req.param('branchId'));
      return deviceRevoke(c, b.id);
    },
  );
  app.get('/api/public/display/:token', async (c) => {
    const token = c.req.param('token');
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw notFound();
    const device = await c.env.DB.prepare(
      'SELECT d.id,d.branch_id,d.org_id,b.slug FROM display_devices d JOIN branches b ON b.id=d.branch_id JOIN orgs o ON o.id=d.org_id WHERE d.token_hash=? AND d.revoked_at IS NULL AND b.active=1 AND o.active=1',
    )
      .bind(await hmac(c.env.AUTH_SECRET, 'display:' + token))
      .first();
    if (!device) throw notFound();
    const b = await activeBranch(c.env, device.slug);
    const t = await c.env.DB.prepare(
      "SELECT number,token,linked_at FROM tickets WHERE branch_id=? AND status IN ('preparing','ready') AND created_at>? ORDER BY created_at DESC,rowid DESC LIMIT 1",
    )
      .bind(b.id, now() - TTL)
      .first();
    const { results: ready } = await c.env.DB.prepare(
      "SELECT number FROM tickets WHERE branch_id=? AND status='ready' AND created_at>? ORDER BY ready_at LIMIT 100",
    )
      .bind(b.id, now() - TTL)
      .all();
    // Linking is performed solely by the ticket page. Loading a display does not consume a QR.
    await c.env.DB.prepare(
      'UPDATE display_devices SET last_seen_at=? WHERE id=?',
    )
      .bind(now(), device.id)
      .run();
    return c.json({
      branch: branchPublic(b),
      org: {
        slug: b.org_slug,
        name_ar: b.org_name_ar,
        name_en: b.org_name_en,
        brand_color: b.brand_color,
        logo_url: b.logo_url,
      },
      menu: await menuFor(c.env, b.org_id, b.id),
      ticket:
        t && !t.linked_at
          ? { number: t.number, token: t.token, url: '/t/' + t.token }
          : null,
      ready,
      settings: settingsView(
        await c.env.DB.prepare(
          'SELECT * FROM branch_settings WHERE branch_id=?',
        )
          .bind(b.id)
          .first(),
      ),
    });
  });

  app.post('/api/public/orders/:branchSlug', async (c) => {
    const branch = await activeBranch(c.env, c.req.param('branchSlug'));
    await assertOrgWritable(c.env, { org_id: branch.org_id });
    await rateLimit(c, 'orders:' + branch.id, { limit: 30, window: 60000 });
    const settings = await c.env.DB.prepare(
      'SELECT orders_enabled FROM branch_settings WHERE branch_id=?',
    )
      .bind(branch.id)
      .first();
    if (!settings?.orders_enabled) throw conflict('ordering_disabled');
    const b = await body(c);
    const key = str(b.idem_key, 'idem_key', { min: 16, max: 100 });
    const requested = list(b.items, 'items', 40);
    if (!requested.length) throw bad('empty_order');
    const ids = new Set();
    const lines = [];
    for (const line of requested) {
      const itemId = str(line?.item_id, 'item_id', { max: 60 });
      if (ids.has(itemId)) throw bad('duplicate_item');
      ids.add(itemId);
      const quantity = int(line.quantity, 'quantity', { min: 1, max: 20 });
      const item = await c.env.DB.prepare(
        'SELECT i.id,i.name_ar,i.name_en,i.price FROM items i JOIN categories c ON c.id=i.category_id WHERE i.id=? AND i.org_id=? AND i.active=1 AND c.active=1 AND NOT EXISTS(SELECT 1 FROM branch_unavailable u WHERE u.branch_id=? AND u.item_id=i.id)',
      )
        .bind(itemId, branch.org_id, branch.id)
        .first();
      if (!item) throw bad('item_unavailable');
      lines.push({ ...item, quantity, total: item.price * quantity });
    }
    const total = lines.reduce((n, l) => n + l.total, 0);
    if (total > 100_000_000) throw bad('order_total_limit');
    const fingerprint = await hmac(
      c.env.AUTH_SECRET,
      JSON.stringify(
        lines
          .map((l) => [l.id, l.quantity])
          .sort((a, b) => a[0].localeCompare(b[0])),
      ),
    );
    await c.env.DB.prepare(
      'INSERT INTO customer_orders(id,org_id,branch_id,token,idem_key,fingerprint,total,items_json,created_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(branch_id,idem_key) DO NOTHING',
    )
      .bind(
        id(),
        branch.org_id,
        branch.id,
        randomToken(24),
        key,
        fingerprint,
        total,
        JSON.stringify(lines),
        now(),
      )
      .run();
    const order = await c.env.DB.prepare(
      'SELECT * FROM customer_orders WHERE branch_id=? AND idem_key=?',
    )
      .bind(branch.id, key)
      .first();
    if (order.fingerprint !== fingerprint) throw conflict('idem_key_reused');
    return c.json({ order: orderView(order) }, 201);
  });
  app.get('/api/public/order/:token', async (c) => {
    const order = await c.env.DB.prepare(
      'SELECT q.* FROM customer_orders q JOIN branches b ON b.id=q.branch_id JOIN orgs o ON o.id=q.org_id WHERE q.token=? AND b.active=1 AND o.active=1 AND q.created_at>?',
    )
      .bind(c.req.param('token'), now() - TTL)
      .first();
    if (!order) throw notFound();
    let ticket = null;
    if (order.ticket_id)
      ticket = await c.env.DB.prepare(
        'SELECT number,token,status FROM tickets WHERE id=?',
      )
        .bind(order.ticket_id)
        .first();
    return c.json({ order: orderView(order), ticket });
  });
  app.get('/api/branch/orders', requireRole('branch'), async (c) => {
    const { results } = await c.env.DB.prepare(
      'SELECT * FROM customer_orders WHERE branch_id=? AND created_at>? ORDER BY created_at DESC LIMIT 200',
    )
      .bind(c.get('user').branch_id, now() - TTL)
      .all();
    return c.json({ orders: results.map(orderView) });
  });
  app.post(
    '/api/branch/orders/:id/reject',
    requireRole('branch'),
    async (c) => {
      const b = await body(c),
        u = c.get('user');
      const version = int(b.version, 'version', { min: 1 });
      const result = await c.env.DB.prepare(
        "UPDATE customer_orders SET status='rejected',version=version+1 WHERE id=? AND branch_id=? AND status='pending' AND version=?",
      )
        .bind(c.req.param('id'), u.branch_id, version)
        .run();
      if (!result.meta.changes) throw conflict('stale_order');
      return c.json({ ok: true });
    },
  );
  app.post(
    '/api/branch/orders/:id/accept',
    requireRole('branch'),
    async (c) => {
      const b = await body(c),
        u = c.get('user');
      const version = int(b.version, 'version', { min: 1 }),
        orderId = c.req.param('id');
      const order = await c.env.DB.prepare(
        'SELECT * FROM customer_orders WHERE id=? AND branch_id=?',
      )
        .bind(orderId, u.branch_id)
        .first();
      if (!order) throw notFound();
      if (order.created_at < now() - TTL) throw conflict('order_expired');
      if (order.status !== 'pending' || order.version !== version)
        throw conflict('stale_order');
      const ticketId = id(),
        token = randomToken(18),
        t = now();
      const invoice = text(b.invoice_number, 'invoice_number', 64);
      const result = await c.env.DB.batch([
        c.env.DB.prepare(
          `INSERT INTO tickets(id,org_id,branch_id,number,token,status,created_at,invoice_number) SELECT ?1,?2,?3,CAST(COALESCE((SELECT MAX(CAST(number AS INTEGER)) FROM tickets WHERE branch_id=?3 AND created_at>?4 AND number GLOB '[0-9]*'),0)+1 AS TEXT),?5,'preparing',?6,?7 WHERE EXISTS(SELECT 1 FROM customer_orders WHERE id=?8 AND branch_id=?3 AND status='pending' AND version=?9)`,
        ).bind(
          ticketId,
          u.org_id,
          u.branch_id,
          t - TTL,
          token,
          t,
          invoice,
          orderId,
          version,
        ),
        c.env.DB.prepare(
          "UPDATE customer_orders SET status='accepted',ticket_id=?,version=version+1 WHERE id=? AND branch_id=? AND status='pending' AND version=? AND EXISTS(SELECT 1 FROM tickets WHERE id=?)",
        ).bind(ticketId, orderId, u.branch_id, version, ticketId),
      ]);
      if (!result[0].meta.changes) throw conflict('stale_order');
      const ticket = await c.env.DB.prepare(
        'SELECT id,number,token FROM tickets WHERE id=?',
      )
        .bind(ticketId)
        .first();
      const updated = await c.env.DB.prepare(
        'SELECT * FROM customer_orders WHERE id=? AND branch_id=?',
      )
        .bind(orderId, u.branch_id)
        .first();
      await audit(c.env, u, 'order.accept', {
        order: orderId,
        ticket: ticketId,
      });
      return c.json({ ticket, order: orderView(updated) }, 201);
    },
  );

  app.post('/api/owner/assets', requireRole('owner'), async (c) => {
    const u = c.get('user');
    const usage = await c.env.DB.prepare(
      'SELECT COUNT(*) AS n,COALESCE(SUM(size),0) AS total FROM tenant_assets WHERE org_id=?',
    )
      .bind(u.org_id)
      .first();
    if (usage.n >= 1000 || usage.total >= 100_000_000)
      throw conflict('asset_storage_limit');
    const b = await body(c);
    const mime = str(b.mime, 'mime', { max: 60 });
    if (
      typeof b.data !== 'string' ||
      b.data.length > 2_800_000 ||
      !/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        b.data,
      )
    )
      throw bad('invalid_asset_data');
    const bytes = Uint8Array.from(atob(b.data), (ch) => ch.charCodeAt(0));
    const head = String.fromCharCode(...bytes.slice(0, 12));
    let kind;
    if (mime === 'font/woff2' && head.startsWith('wOF2')) kind = 'font';
    else if (
      mime === 'font/ttf' &&
      bytes[0] === 0 &&
      bytes[1] === 1 &&
      bytes[2] === 0 &&
      bytes[3] === 0
    )
      kind = 'font';
    else if (
      mime === 'image/png' &&
      bytes[0] === 137 &&
      head.slice(1, 4) === 'PNG' &&
      bytes[4] === 13 &&
      bytes[5] === 10
    )
      kind = 'image';
    else if (
      mime === 'image/jpeg' &&
      bytes[0] === 255 &&
      bytes[1] === 216 &&
      bytes[2] === 255
    )
      kind = 'image';
    else if (
      mime === 'image/webp' &&
      head.startsWith('RIFF') &&
      head.slice(8, 12) === 'WEBP'
    )
      kind = 'image';
    else throw bad('asset_type_mismatch');
    if (
      bytes.length < 16 ||
      bytes.length > (kind === 'font' ? 500_000 : c.env.MEDIA ? 2_000_000 : 1_500_000)
    )
      throw bad('asset_size_limit');
    const aid = id();
    // Without an R2 bucket the bytes live in D1 (rows are capped near 2MB, hence 1.5MB images).
    const key = c.env.MEDIA ? u.org_id + '/' + aid : 'd1:' + aid;
    if (c.env.MEDIA)
      await c.env.MEDIA.put(key, bytes, { httpMetadata: { contentType: mime } });
    try {
      const insert = c.env.DB.prepare(
        'INSERT INTO tenant_assets(id,org_id,object_key,mime,size,kind,created_at) VALUES(?,?,?,?,?,?,?)',
      ).bind(aid, u.org_id, key, mime, bytes.length, kind, now());
      if (c.env.MEDIA) await insert.run();
      else
        await c.env.DB.batch([
          insert,
          c.env.DB.prepare(
            'INSERT INTO tenant_asset_blobs(asset_id,data) VALUES(?,?)',
          ).bind(aid, bytes),
        ]);
    } catch (e) {
      if (c.env.MEDIA) await c.env.MEDIA.delete(key);
      if (String(e.message).includes('asset_storage_limit'))
        throw conflict('asset_storage_limit');
      throw e;
    }
    await audit(c.env, u, 'asset.upload', {
      id: aid,
      kind,
      size: bytes.length,
    });
    return c.json(
      { id: aid, url: '/api/assets/' + aid, kind, mime, size: bytes.length },
      201,
    );
  });
  app.get('/api/assets/:id', async (c) => {
    const asset = await c.env.DB.prepare(
      'SELECT a.* FROM tenant_assets a JOIN orgs o ON o.id=a.org_id WHERE a.id=? AND o.active=1',
    )
      .bind(c.req.param('id'))
      .first();
    if (!asset) throw notFound();
    let payload;
    if (asset.object_key.startsWith('d1:')) {
      const row = await c.env.DB.prepare(
        'SELECT data FROM tenant_asset_blobs WHERE asset_id=?',
      )
        .bind(asset.id)
        .first();
      if (!row) throw notFound();
      payload = new Uint8Array(row.data);
    } else {
      const object = c.env.MEDIA ? await c.env.MEDIA.get(asset.object_key) : null;
      if (!object) throw notFound();
      payload = object.body;
    }
    return new Response(payload, {
      headers: {
        'content-type': asset.mime,
        'content-length': String(asset.size),
        'cache-control': 'public,max-age=86400',
        'access-control-allow-origin': '*',
        'x-content-type-options': 'nosniff',
      },
    });
  });
}
