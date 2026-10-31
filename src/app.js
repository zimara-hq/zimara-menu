import { registerDemo, expireDemo } from './demo.js';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { body, requireRole, audit, newUser, isSecure, assertPlanQuota, subscriptionFor, planFor, rateLimit } from './context.js';
import { registerAccounts, expireSubscriptions } from './accounts.js';
import { consumeMfa } from './mfa.js';
import { registerFeatures } from './features.js';
import { registerIntegrations } from './integrations.js';
import {
  checkLoginRate,
  clearCookie,
  clearLoginFailures,
  createSession,
  destroySession,
  hashPassword,
  loadUser,
  recordLoginFailure,
  sessionCookie,
  validPassword,
  verifyPassword,
} from './auth.js';
import { pushConfigured, sendPush, validEndpoint } from './push.js';
import {
  HttpError,
  bad,
  color,
  conflict,
  forbidden,
  hmac,
  id,
  int,
  notFound,
  now,
  randomToken,
  shortCode,
  slugify,
  str,
  url,
} from './util.js';

export const MAX_ADMINS = 4;
export const REALERT_EVERY_MS = 2 * 60 * 1000;
export const MAX_ALERTS = 4; // first call + 3 automatic repeats
const TICKET_TTL_MS = 12 * 60 * 60 * 1000;

const app = new Hono();

app.onError((err, c) => {
  if (/plan_(branches|items)_limit/.test(String(err?.message))) return c.json({ error: String(err.message).includes('plan_branches_limit') ? 'plan_branches_limit' : 'plan_items_limit' }, 409);
  if (err instanceof HttpError) return c.json({ error: err.code }, err.status);
  console.error(err);
  return c.json({ error: 'server_error' }, 500);
});

// Security headers on everything the Worker answers.
app.use('*', async (c, next) => {
  await next();
  if (c.env.ENVIRONMENT === 'preview') c.header('X-Robots-Tag', 'noindex, nofollow');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('X-Frame-Options', 'DENY');
  c.header('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  c.header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
  if (new URL(c.req.url).protocol === 'https:') c.header('Strict-Transport-Security', 'max-age=31536000');
});

app.use('/api/*', bodyLimit({ maxSize: 4 * 1024 * 1024, onError: (c) => c.json({ error: 'request_too_large' }, 413) }));

// Mutating API calls must be JSON: browsers cannot send cross-site JSON without
// a CORS preflight we never grant, which closes CSRF for cookie sessions.
app.use('/api/*', async (c, next) => {
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
    const origin = c.req.header('origin');
    if (origin && origin !== new URL(c.req.url).origin) throw forbidden('invalid_origin');
    if (c.req.header('sec-fetch-site') === 'cross-site') throw forbidden('invalid_origin');
    const ct = c.req.header('content-type') || '';
    if (!/^application\/json(?:\s*;|$)/i.test(ct)) throw bad('json_required');
  }
  c.header('Cache-Control', 'no-store');
  await next();
});

registerAccounts(app);

// ---------- Session ----------

app.post('/api/login', async (c) => {
  const b = await body(c);
  const email = str(b.email, 'email', { max: 200 }).toLowerCase();
  const password = typeof b.password === 'string' ? b.password : '';
  const ip = c.req.header('cf-connecting-ip') || 'local';
  const keys = ['acct:' + email, 'ip:' + (await hmac(c.env.AUTH_SECRET, 'ip:' + ip))];
  await checkLoginRate(c.env, keys);
  const user = await c.env.DB.prepare('SELECT id, password_hash, disabled, mfa_secret, mfa_last_counter FROM users WHERE email = ?').bind(email).first();
  // Verify against a dummy hash when the user is missing to keep timing similar.
  const ok = user
    ? await verifyPassword(password, user.password_hash)
    : (await verifyPassword(password, 'pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'), false);
  if (!ok || user.disabled) {
    await recordLoginFailure(c.env, keys);
    throw new HttpError(401, 'invalid_credentials');
  }
  if (user.mfa_secret && !(await consumeMfa(c.env,user,b))) {
    await recordLoginFailure(c.env, keys);
    throw new HttpError(401, b.code || b.recovery_code ? 'invalid_mfa_code' : 'mfa_required');
  }
  await clearLoginFailures(c.env, keys);
  const token = await createSession(c.env, user.id, !!user.mfa_secret);
  c.header('Set-Cookie', sessionCookie(token, isSecure(c)));
  return c.json({ ok: true });
});

app.post('/api/logout', async (c) => {
  await destroySession(c.env, c.req.raw);
  c.header('Set-Cookie', clearCookie(isSecure(c)));
  return c.json({ ok: true });
});

app.get('/api/me', requireRole('admin', 'owner', 'branch'), async (c) => {
  const u = c.get('user');
  const org = u.org_id ? await c.env.DB.prepare('SELECT id, slug, name_ar, name_en, brand_color, logo_url FROM orgs WHERE id = ?').bind(u.org_id).first() : null;
  const branch = u.branch_id ? await c.env.DB.prepare('SELECT id, slug, name_ar, name_en FROM branches WHERE id = ?').bind(u.branch_id).first() : null;
  return c.json({
    user: { id: u.id, email: u.email, name: u.name, role: u.role, email_verified: !!u.email_verified, mfa_enabled: !!u.mfa_enabled },
    org,
    branch,
    pushConfigured: pushConfigured(c.env),
  });
});

app.post('/api/me/password', requireRole('admin', 'owner', 'branch'), async (c) => {
  const u = c.get('user');
  const b = await body(c);
  const row = await c.env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(u.id).first();
  if (!(await verifyPassword(String(b.current ?? ''), row.password_hash))) throw bad('wrong_password');
  if (!validPassword(b.next)) throw bad('weak_password');
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(await hashPassword(b.next), u.id),
    c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').bind(u.id, u.sid),
  ]);
  await audit(c.env, u, 'password.change');
  return c.json({ ok: true });
});

// ---------- Platform admins (max 4) ----------

const admin = new Hono();
admin.use('*', requireRole('admin'));

admin.get('/admins', async (c) => {
  const { results } = await c.env.DB.prepare("SELECT id, email, name, disabled, created_at FROM users WHERE role = 'admin' ORDER BY created_at").all();
  return c.json({ admins: results, max: MAX_ADMINS });
});

admin.post('/admins', async (c) => {
  const b = await body(c);
  const user = await newUser(c, b, 'admin');
  // Count and insert in one statement so two admins cannot race past the cap.
  const res = await c.env.DB.prepare(
    `INSERT INTO users (id, email, name, role, password_hash, created_at)
     SELECT ?, ?, ?, 'admin', ?, ? WHERE (SELECT COUNT(*) FROM users WHERE role = 'admin') < ?`,
  )
    .bind(user.id, user.email, user.name, user.password_hash, now(), MAX_ADMINS)
    .run()
    .catch(uniqueToConflict('email_taken'));
  if (!res.meta.changes) throw conflict('admin_limit', `Up to ${MAX_ADMINS} admin accounts`);
  await audit(c.env, c.get('user'), 'admin.create', { email: user.email });
  return c.json({ id: user.id }, 201);
});

admin.get('/orgs', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT o.*, (SELECT COUNT(*) FROM branches b WHERE b.org_id = o.id) AS branches,
            (SELECT email FROM users u WHERE u.org_id = o.id AND u.role = 'owner' LIMIT 1) AS owner_email
       FROM orgs o ORDER BY o.created_at DESC`,
  ).all();
  return c.json({ orgs: results });
});

admin.post('/orgs', async (c) => {
  const b = await body(c);
  const nameAr = str(b.name_ar, 'name_ar', { max: 80 });
  const nameEn = str(b.name_en, 'name_en', { max: 80 });
  const slug = slugify(b.slug || nameEn);
  if (slug.length < 2) throw bad('invalid_slug');
  const owner = await newUser(c, b.owner || {}, 'owner');
  const orgId = id();
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO orgs (id, slug, name_ar, name_en, brand_color, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(
      orgId, slug, nameAr, nameEn, color(b.brand_color, 'brand_color'), now(),
    ),
    c.env.DB.prepare("INSERT INTO users (id, email, name, role, org_id, password_hash, created_at) VALUES (?, ?, ?, 'owner', ?, ?, ?)").bind(
      owner.id, owner.email, owner.name, orgId, owner.password_hash, now(),
    ),
    c.env.DB.prepare('INSERT INTO loyalty_programs (org_id) VALUES (?)').bind(orgId),
  ]).catch(uniqueToConflict('slug_or_email_taken'));
  await audit(c.env, c.get('user'), 'org.create', { slug });
  return c.json({ id: orgId, slug }, 201);
});

admin.patch('/orgs/:id', async (c) => {
  const b = await body(c);
  const active = b.active ? 1 : 0;
  const res = await c.env.DB.prepare('UPDATE orgs SET active = ? WHERE id = ?').bind(active, c.req.param('id')).run();
  if (!res.meta.changes) throw notFound();
  await audit(c.env, c.get('user'), 'org.active', { id: c.req.param('id'), active });
  return c.json({ ok: true });
});

admin.patch('/users/:id', async (c) => {
  const b = await body(c);
  const target = c.req.param('id');
  if (target === c.get('user').id && b.disabled) throw bad('cannot_disable_self');
  const stmts = [];
  if (b.disabled !== undefined) stmts.push(c.env.DB.prepare('UPDATE users SET disabled = ? WHERE id = ?').bind(b.disabled ? 1 : 0, target));
  if (b.password !== undefined) {
    if (!validPassword(b.password)) throw bad('weak_password');
    stmts.push(c.env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(await hashPassword(b.password), target));
  }
  if (!stmts.length) throw bad('nothing_to_update');
  stmts.push(c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(target));
  await c.env.DB.batch(stmts);
  await audit(c.env, c.get('user'), 'user.update', { id: target, disabled: b.disabled, password: b.password !== undefined });
  return c.json({ ok: true });
});

app.route('/api/admin', admin);

function uniqueToConflict(code) {
  return (e) => {
    if (/UNIQUE|constraint/i.test(String(e?.message ?? e))) throw conflict(code);
    throw e;
  };
}

// ---------- Org owner ----------

const owner = new Hono();
owner.use('*', requireRole('owner'));

owner.patch('/org', async (c) => {
  const u = c.get('user');
  const b = await body(c);
  await c.env.DB.prepare('UPDATE orgs SET name_ar = ?, name_en = ?, brand_color = ?, logo_url = ? WHERE id = ?')
    .bind(str(b.name_ar, 'name_ar', { max: 80 }), str(b.name_en, 'name_en', { max: 80 }), color(b.brand_color, 'brand_color'), url(b.logo_url, 'logo_url'), u.org_id)
    .run();
  return c.json({ ok: true });
});

owner.get('/branches', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT b.*, u.email AS account_email, u.id AS account_id, u.disabled AS account_disabled
       FROM branches b LEFT JOIN users u ON u.branch_id = b.id
      WHERE b.org_id = ? ORDER BY b.created_at`,
  )
    .bind(c.get('user').org_id)
    .all();
  return c.json({ branches: results });
});

owner.post('/branches', async (c) => {
  const u = c.get('user');
  await assertPlanQuota(c.env, u.org_id, 'branches');
  const b = await body(c);
  const org = await c.env.DB.prepare('SELECT slug FROM orgs WHERE id = ?').bind(u.org_id).first();
  const nameEn = str(b.name_en, 'name_en', { max: 80 });
  const slug = `${org.slug}-${slugify(b.slug || nameEn)}`.slice(0, 60);
  const account = await newUser(c, b.account || {}, 'branch');
  const branchId = id();
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO branches (id, org_id, slug, name_ar, name_en, google_review_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(
      branchId, u.org_id, slug, str(b.name_ar, 'name_ar', { max: 80 }), nameEn, url(b.google_review_url, 'google_review_url'), now(),
    ),
    c.env.DB.prepare("INSERT INTO users (id, email, name, role, org_id, branch_id, password_hash, created_at) VALUES (?, ?, ?, 'branch', ?, ?, ?, ?)").bind(
      account.id, account.email, account.name, u.org_id, branchId, account.password_hash, now(),
    ),
  ]).catch(uniqueToConflict('slug_or_email_taken'));
  await audit(c.env, u, 'branch.create', { slug });
  return c.json({ id: branchId, slug }, 201);
});

owner.patch('/branches/:id', async (c) => {
  const u = c.get('user');
  const b = await body(c);
  const res = await c.env.DB.prepare('UPDATE branches SET name_ar = ?, name_en = ?, google_review_url = ?, active = ? WHERE id = ? AND org_id = ?')
    .bind(str(b.name_ar, 'name_ar', { max: 80 }), str(b.name_en, 'name_en', { max: 80 }), url(b.google_review_url, 'google_review_url'), b.active === false ? 0 : 1, c.req.param('id'), u.org_id)
    .run();
  if (!res.meta.changes) throw notFound();
  return c.json({ ok: true });
});

owner.patch('/branches/:id/account', async (c) => {
  const u = c.get('user');
  const b = await body(c);
  const acct = await c.env.DB.prepare("SELECT id FROM users WHERE branch_id = ? AND org_id = ? AND role = 'branch'").bind(c.req.param('id'), u.org_id).first();
  if (!acct) {
    const branch = await c.env.DB.prepare('SELECT id FROM branches WHERE id = ? AND org_id = ?').bind(c.req.param('id'), u.org_id).first();
    if (!branch) throw notFound();
    const account = await newUser(c, b, 'branch');
    await c.env.DB.prepare("INSERT INTO users (id,email,name,role,org_id,branch_id,password_hash,created_at) VALUES (?,?,?,'branch',?,?,?,?)").bind(account.id,account.email,account.name,u.org_id,branch.id,account.password_hash,now()).run().catch(uniqueToConflict('email_taken'));
    await audit(c.env,u,'branch_account.create',{branch:branch.id});
    return c.json({ok:true,id:account.id},201);
  }
  const stmts = [];
  if (b.disabled !== undefined) stmts.push(c.env.DB.prepare('UPDATE users SET disabled = ? WHERE id = ?').bind(b.disabled ? 1 : 0, acct.id));
  if (b.password !== undefined) {
    if (!validPassword(b.password)) throw bad('weak_password');
    stmts.push(c.env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(await hashPassword(b.password), acct.id));
  }
  if (!stmts.length) throw bad('nothing_to_update');
  stmts.push(c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(acct.id));
  await c.env.DB.batch(stmts);
  await audit(c.env, u, 'branch_account.update', { branch: c.req.param('id') });
  return c.json({ ok: true });
});

owner.get('/menu', async (c) => c.json(await orgMenu(c.env, c.get('user').org_id, { includeHidden: true })));

owner.post('/categories', async (c) => {
  const b = await body(c);
  const cid = id();
  await c.env.DB.prepare('INSERT INTO categories (id, org_id, name_ar, name_en, sort) VALUES (?, ?, ?, ?, ?)')
    .bind(cid, c.get('user').org_id, str(b.name_ar, 'name_ar', { max: 60 }), str(b.name_en, 'name_en', { max: 60 }), int(b.sort ?? 0, 'sort', { max: 10000 }))
    .run();
  return c.json({ id: cid }, 201);
});

owner.patch('/categories/:id', async (c) => {
  const b = await body(c);
  const res = await c.env.DB.prepare('UPDATE categories SET name_ar = ?, name_en = ?, sort = ?, active = ? WHERE id = ? AND org_id = ?')
    .bind(str(b.name_ar, 'name_ar', { max: 60 }), str(b.name_en, 'name_en', { max: 60 }), int(b.sort ?? 0, 'sort', { max: 10000 }), b.active === false ? 0 : 1, c.req.param('id'), c.get('user').org_id)
    .run();
  if (!res.meta.changes) throw notFound();
  return c.json({ ok: true });
});

function itemFields(b) {
  return [
    str(b.name_ar, 'name_ar', { max: 80 }),
    str(b.name_en, 'name_en', { max: 80 }),
    str(b.desc_ar, 'desc_ar', { optional: true, max: 400 }) ?? '',
    str(b.desc_en, 'desc_en', { optional: true, max: 400 }) ?? '',
    int(b.price, 'price', { max: 10_000_000 }),
    int(b.calories, 'calories', { optional: true, max: 10000 }),
    url(b.image_url, 'image_url'),
    int(b.sort ?? 0, 'sort', { max: 10000 }),
  ];
}

owner.post('/items', async (c) => {
  const u = c.get('user');
  await assertPlanQuota(c.env, u.org_id, 'items');
  const b = await body(c);
  const cat = await c.env.DB.prepare('SELECT id FROM categories WHERE id = ? AND org_id = ?').bind(b.category_id, u.org_id).first();
  if (!cat) throw bad('invalid_category_id');
  const iid = id();
  await c.env.DB.prepare(
    'INSERT INTO items (id, org_id, category_id, name_ar, name_en, desc_ar, desc_en, price, calories, image_url, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(iid, u.org_id, cat.id, ...itemFields(b))
    .run();
  return c.json({ id: iid }, 201);
});

owner.patch('/items/:id', async (c) => {
  const u = c.get('user');
  const b = await body(c);
  const cat = await c.env.DB.prepare('SELECT id FROM categories WHERE id = ? AND org_id = ?').bind(b.category_id, u.org_id).first();
  if (!cat) throw bad('invalid_category_id');
  const res = await c.env.DB.prepare(
    'UPDATE items SET category_id = ?, name_ar = ?, name_en = ?, desc_ar = ?, desc_en = ?, price = ?, calories = ?, image_url = ?, sort = ?, active = ? WHERE id = ? AND org_id = ?',
  )
    .bind(cat.id, ...itemFields(b), b.active === false ? 0 : 1, c.req.param('id'), u.org_id)
    .run();
  if (!res.meta.changes) throw notFound();
  return c.json({ ok: true });
});

owner.get('/loyalty', async (c) => {
  const row = await c.env.DB.prepare('SELECT * FROM loyalty_programs WHERE org_id = ?').bind(c.get('user').org_id).first();
  return c.json({ program: row });
});

owner.put('/loyalty', async (c) => {
  const b = await body(c);
  await c.env.DB.prepare(
    `INSERT INTO loyalty_programs (org_id, stamps_required, reward_ar, reward_en, active) VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT(org_id) DO UPDATE SET stamps_required = ?2, reward_ar = ?3, reward_en = ?4, active = ?5`,
  )
    .bind(c.get('user').org_id, int(b.stamps_required, 'stamps_required', { min: 2, max: 50 }), str(b.reward_ar, 'reward_ar', { max: 80 }), str(b.reward_en, 'reward_en', { max: 80 }), b.active === false ? 0 : 1)
    .run();
  return c.json({ ok: true });
});

owner.get('/stats', async (c) => {
  const since = now() - 30 * 24 * 3600 * 1000;
  const { results } = await c.env.DB.prepare(
    `SELECT b.id, b.name_ar, b.name_en,
            COUNT(t.id) AS tickets,
            SUM(CASE WHEN t.status = 'collected' THEN 1 ELSE 0 END) AS collected,
            AVG(CASE WHEN t.ready_at IS NOT NULL THEN t.ready_at - t.created_at END) AS avg_prep_ms,
            MAX(CASE WHEN t.ready_at IS NOT NULL THEN t.ready_at - t.created_at END) AS max_prep_ms,
            AVG(CASE WHEN t.collected_at IS NOT NULL AND t.ready_at IS NOT NULL THEN t.collected_at - t.ready_at END) AS avg_pickup_ms,
            AVG(t.rating) AS avg_rating,
            COUNT(t.rating) AS ratings
       FROM branches b LEFT JOIN tickets t ON t.branch_id = b.id AND t.created_at >= ?
      WHERE b.org_id = ? GROUP BY b.id ORDER BY b.created_at`,
  )
    .bind(since, c.get('user').org_id)
    .all();
  const loyalty = await c.env.DB.prepare(
    `SELECT COUNT(DISTINCT c.id) AS cards,
            COALESCE(SUM(CASE WHEN l.kind = 'stamp' THEN 1 ELSE 0 END), 0) AS stamps,
            COALESCE(SUM(CASE WHEN l.kind = 'redeem' THEN 1 ELSE 0 END), 0) AS redeemed
       FROM loyalty_cards c LEFT JOIN loyalty_ledger l ON l.card_id = c.id AND l.created_at >= ?
      WHERE c.org_id = ?`,
  )
    .bind(since, c.get('user').org_id)
    .first();
  return c.json({ branches: results, loyalty, days: 30 });
});

app.route('/api/owner', owner);

// ---------- Branch (cashier / prep screen) ----------

const branch = new Hono();
branch.use('*', requireRole('branch'));

const TICKET_COLS = 'id, number, invoice_number, token, status, linked_at, ready_at, seen_at, collected_at, alerts_sent, last_alert_at, rating, created_at, version';

branch.get('/tickets', async (c) => {
  const u = c.get('user');
  const { results } = await c.env.DB.prepare(
    `SELECT ${TICKET_COLS} FROM tickets WHERE branch_id = ?
      AND (status IN ('preparing', 'ready') OR created_at > ?) ORDER BY created_at DESC LIMIT 200`,
  )
    .bind(u.branch_id, now() - 3 * 3600 * 1000)
    .all();
  return c.json({ tickets: results, now: now() });
});

branch.post('/tickets', async (c) => {
  const u = c.get('user');
  const b = await body(c);
  // b.number remains a backwards-compatible explicit pager number. New callers
  // supply invoice_number and let the independent pager sequence increment.
  const explicitNumber = str(b.number, 'number', { optional: true, max: 12 });
  if (explicitNumber && !/^[0-9A-Za-z-]+$/.test(explicitNumber)) throw bad('invalid_number');
  const invoiceNumber = str(b.invoice_number, 'invoice_number', { optional: true, max: 80 });
  if (invoiceNumber && /[\x00-\x1f\x7f]/.test(invoiceNumber)) throw bad('invalid_invoice_number');
  const idem = str(b.idem_key, 'idem_key', { optional: true, min: 8, max: 120 });
  const fingerprint = await hmac(c.env.AUTH_SECRET, JSON.stringify({ number: explicitNumber, invoice_number: invoiceNumber }));
  const previous = async () => {
    if (!idem) return null;
    const row = await c.env.DB.prepare(`SELECT r.fingerprint, t.id, t.number, t.invoice_number, t.token
      FROM cashier_ticket_requests r JOIN tickets t ON t.id = r.ticket_id
      WHERE r.branch_id = ? AND r.idem_key = ? AND t.org_id = ? AND t.branch_id = ?`)
      .bind(u.branch_id, idem, u.org_id, u.branch_id).first();
    if (!row) return null;
    if (row.fingerprint !== fingerprint) throw conflict('idempotency_key_reused');
    const { fingerprint: _fingerprint, ...ticket } = row;
    return ticket;
  };
  const prior = await previous();
  if (prior) return c.json({ ...prior, duplicate: true });
  // A distinct simultaneous cashier request can win the same auto number.
  // Retry the allocation instead of silently losing the user's invoice.
  for (let attempt = 0; attempt < 3; attempt++) {
    let number = explicitNumber;
    if (!number) {
      const last = await c.env.DB.prepare(
        "SELECT MAX(CAST(number AS INTEGER)) AS n FROM tickets WHERE branch_id = ? AND (created_at > ? OR status IN ('preparing', 'ready')) AND number GLOB '[0-9]*'",
      ).bind(u.branch_id, now() - TICKET_TTL_MS).first();
      number = String((last?.n || 0) + 1);
    }
    const tid = id(), token = randomToken(18), createdAt = now();
    const stmts = [c.env.DB.prepare(
      "INSERT INTO tickets (id, org_id, branch_id, number, invoice_number, token, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'preparing', ?)",
    ).bind(tid, u.org_id, u.branch_id, number, invoiceNumber, token, createdAt)];
    if (idem) stmts.push(c.env.DB.prepare('INSERT INTO cashier_ticket_requests (branch_id,idem_key,fingerprint,ticket_id,created_at) VALUES (?,?,?,?,?)').bind(u.branch_id,idem,fingerprint,tid,createdAt));
    try {
      await c.env.DB.batch(stmts);
      return c.json({ id: tid, number, invoice_number: invoiceNumber, token }, 201);
    } catch (error) {
      const duplicate = await previous();
      if (duplicate) return c.json({ ...duplicate, duplicate: true });
      if (!/UNIQUE|constraint/i.test(String(error?.message ?? error))) throw error;
      if (explicitNumber || attempt === 2) throw conflict('number_in_use');
    }
  }
});

// action: ready | realert | collect | cancel. `version` gives optimistic concurrency between staff
// screens; only staff transitions bump it, so a customer's "seen" or a cron repeat never makes a
// cashier's click fail.
branch.post('/tickets/:id/:action', async (c) => {
  const u = c.get('user');
  const action = c.req.param('action');
  const b = await body(c);
  const version = int(b.version, 'version', { min: 1 });
  const t = now();
  const q = {
    ready: ["status = 'ready', ready_at = ?2, alerts_sent = 1, last_alert_at = ?2", "status = 'preparing'"],
    realert: ['alerts_sent = alerts_sent + 1, last_alert_at = ?2', "status = 'ready'"],
    collect: ["status = 'collected', collected_at = ?2", "status IN ('preparing', 'ready')"],
    cancel: ["status = 'cancelled'", "status IN ('preparing', 'ready')"],
  }[action];
  if (!q) throw notFound();
  const res = await c.env.DB.prepare(
    `UPDATE tickets SET ${q[0]}, version = version + 1 WHERE id = ?1 AND branch_id = ?3 AND version = ?4 AND ${q[1]}`,
  )
    .bind(c.req.param('id'), t, u.branch_id, version)
    .run();
  const ticket = await c.env.DB.prepare(`SELECT ${TICKET_COLS} FROM tickets WHERE id = ? AND branch_id = ?`).bind(c.req.param('id'), u.branch_id).first();
  if (!ticket) throw notFound();
  if (!res.meta.changes) return c.json({ error: 'stale', ticket }, 409);
  let push = null;
  if (action === 'ready' || action === 'realert') push = await alertTicket(c.env, ticket.id);
  return c.json({ ticket, push });
});

branch.get('/menu', async (c) => {
  const u = c.get('user');
  return c.json(await orgMenu(c.env, u.org_id, { branchId: u.branch_id, includeHidden: true }));
});

branch.put('/availability/:itemId', async (c) => {
  const u = c.get('user');
  const b = await body(c);
  const item = await c.env.DB.prepare('SELECT id FROM items WHERE id = ? AND org_id = ?').bind(c.req.param('itemId'), u.org_id).first();
  if (!item) throw notFound();
  const stmt = b.available
    ? c.env.DB.prepare('DELETE FROM branch_unavailable WHERE branch_id = ? AND item_id = ?')
    : c.env.DB.prepare('INSERT OR IGNORE INTO branch_unavailable (branch_id, item_id) VALUES (?, ?)');
  await stmt.bind(u.branch_id, item.id).run();
  return c.json({ ok: true });
});

branch.get('/loyalty/:code', async (c) => {
  const u = c.get('user');
  const card = await cardByCode(c.env, u.org_id, c.req.param('code'));
  return c.json(await cardView(c.env, card));
});

branch.post('/loyalty/:code/:kind', async (c) => {
  const u = c.get('user');
  const kind = c.req.param('kind');
  if (kind !== 'stamp' && kind !== 'redeem') throw notFound();
  const b = await body(c);
  const idem = str(b.idem_key, 'idem_key', { min: 8, max: 64 });
  const card = await cardByCode(c.env, u.org_id, c.req.param('code'));
  const program = await c.env.DB.prepare('SELECT stamps_required, active FROM loyalty_programs WHERE org_id = ?').bind(u.org_id).first();
  if (!program?.active) throw conflict('loyalty_inactive');
  const delta = kind === 'stamp' ? 1 : -program.stamps_required;
  // One statement: SQLite serialises writes, so the balance read and the insert are atomic.
  // A redeem only lands when the balance covers it; a retried idem_key is a no-op.
  const res = await c.env.DB.prepare(
    `INSERT INTO loyalty_ledger (id, card_id, branch_id, user_id, kind, delta, balance_after, idem_key, created_at)
     SELECT ?1, ?2, ?3, ?4, ?5, ?6, bal + ?6, ?7, ?8
       FROM (SELECT COALESCE(SUM(delta), 0) AS bal FROM loyalty_ledger WHERE card_id = ?2)
      WHERE bal + ?6 >= 0
     ON CONFLICT(idem_key) DO NOTHING`,
  )
    .bind(id(), card.id, u.branch_id, u.id, kind, delta, idem, now())
    .run();
  if (!res.meta.changes) {
    const prior = await c.env.DB.prepare('SELECT card_id, kind FROM loyalty_ledger WHERE idem_key = ?').bind(idem).first();
    if (!prior) throw conflict('not_enough_stamps');
    if (prior.card_id !== card.id || prior.kind !== kind) throw conflict('idem_key_reused');
  }
  return c.json(await cardView(c.env, card));
});

app.route('/api/branch', branch);

// ---------- Public: menu, tickets, loyalty cards ----------

async function orgMenu(env, orgId, { branchId = null, includeHidden = false } = {}) {
  const active = includeHidden ? '' : 'AND active = 1';
  const { results: categories } = await env.DB.prepare(`SELECT id, name_ar, name_en, sort, active FROM categories WHERE org_id = ? ${active} ORDER BY sort, name_en`).bind(orgId).all();
  const { results: items } = await env.DB.prepare(
    `SELECT i.id, i.category_id, i.name_ar, i.name_en, i.desc_ar, i.desc_en, i.price, i.calories, i.image_url, i.sort, i.active,
            CASE WHEN bu.item_id IS NULL THEN 1 ELSE 0 END AS available
       FROM items i JOIN categories category ON category.id = i.category_id AND category.org_id = i.org_id LEFT JOIN branch_unavailable bu ON bu.item_id = i.id AND bu.branch_id = ?
      WHERE i.org_id = ? ${includeHidden ? '' : 'AND i.active = 1 AND category.active = 1'} ORDER BY i.sort, i.name_en`,
  )
    .bind(branchId, orgId)
    .all();
  return { categories, items };
}

app.get('/api/public/menu/:branchSlug', async (c) => {
  const b = await c.env.DB.prepare(
    `SELECT b.id, b.slug, b.name_ar, b.name_en, o.id AS org_id, o.slug AS org_slug, o.name_ar AS org_name_ar, o.name_en AS org_name_en, o.brand_color, o.logo_url
       FROM branches b JOIN orgs o ON o.id = b.org_id WHERE b.slug = ? AND b.active = 1 AND o.active = 1`,
  )
    .bind(c.req.param('branchSlug'))
    .first();
  if (!b) throw notFound();
  const menu = await orgMenu(c.env, b.org_id, { branchId: b.id });
  const { org_id, ...branchInfo } = b;
  return c.json({ branch: branchInfo, ...menu });
});

async function ticketByToken(env, token) {
  const t = await env.DB.prepare(
    `SELECT t.id, t.number, t.status, t.linked_at, t.ready_at, t.seen_at, t.collected_at, t.alerts_sent, t.last_alert_at, t.rating, t.created_at,
            b.name_ar AS branch_ar, b.name_en AS branch_en, b.google_review_url, b.slug AS branch_slug,
            o.name_ar AS org_ar, o.name_en AS org_en, o.brand_color, o.logo_url, o.slug AS org_slug
       FROM tickets t JOIN branches b ON b.id = t.branch_id JOIN orgs o ON o.id = t.org_id WHERE t.token = ? AND b.active = 1 AND o.active = 1`,
  )
    .bind(token)
    .first();
  if (!t) throw notFound();
  return t;
}

function publicTicket(t, env) {
  const { id: _id, ...rest } = t;
  return { ...rest, google_review_url: t.status === 'collected' ? t.google_review_url : null, vapidPublicKey: pushConfigured(env) ? env.VAPID_PUBLIC_KEY : null };
}

app.get('/api/t/:token', async (c) => {
  const t = await ticketByToken(c.env, c.req.param('token'));
  if (!t.linked_at && (t.status === 'preparing' || t.status === 'ready')) {
    await c.env.DB.prepare('UPDATE tickets SET linked_at = ? WHERE id = ? AND linked_at IS NULL').bind(now(), t.id).run();
    t.linked_at = now();
  }
  return c.json(publicTicket(t, c.env));
});

app.post('/api/t/:token/subscribe', async (c) => {
  const t = await ticketByToken(c.env, c.req.param('token'));
  const b = await body(c);
  if (!validEndpoint(b.endpoint)) throw bad('invalid_endpoint');
  if (t.status !== 'preparing' && t.status !== 'ready') throw conflict('ticket_closed');
  const inserted = await c.env.DB.prepare('INSERT OR IGNORE INTO push_subscriptions (id, ticket_id, endpoint, created_at) SELECT ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM push_subscriptions WHERE ticket_id = ?) < 5')
    .bind(id(), t.id, b.endpoint, now(), t.id)
    .run();
  if (!inserted.meta.changes) {
    const existing = await c.env.DB.prepare('SELECT id FROM push_subscriptions WHERE ticket_id = ? AND endpoint = ?').bind(t.id, b.endpoint).first();
    if (!existing) throw new HttpError(429, 'push_device_limit');
  }
  return c.json({ ok: true });
});

app.post('/api/t/:token/seen', async (c) => {
  const t = await ticketByToken(c.env, c.req.param('token'));
  await c.env.DB.prepare("UPDATE tickets SET seen_at = ? WHERE id = ? AND status = 'ready' AND seen_at IS NULL").bind(now(), t.id).run();
  return c.json(publicTicket(await ticketByToken(c.env, c.req.param('token')), c.env));
});

app.post('/api/t/:token/rate', async (c) => {
  const t = await ticketByToken(c.env, c.req.param('token'));
  const b = await body(c);
  const rating = int(b.rating, 'rating', { min: 1, max: 5 });
  const comment = str(b.comment, 'comment', { optional: true, max: 500 });
  const res = await c.env.DB.prepare("UPDATE tickets SET rating = ?, rating_comment = ? WHERE id = ? AND status = 'collected' AND rating IS NULL")
    .bind(rating, comment, t.id)
    .run();
  if (!res.meta.changes) throw conflict('cannot_rate');
  return c.json(publicTicket(await ticketByToken(c.env, c.req.param('token')), c.env));
});

async function cardByCode(env, orgId, code) {
  const card = await env.DB.prepare('SELECT * FROM loyalty_cards WHERE org_id = ? AND code = ?').bind(orgId, String(code).toUpperCase()).first();
  if (!card) throw notFound('card_not_found');
  return card;
}

async function cardView(env, card) {
  const program = await env.DB.prepare('SELECT stamps_required, reward_ar, reward_en, active FROM loyalty_programs WHERE org_id = ?').bind(card.org_id).first();
  const bal = await env.DB.prepare('SELECT COALESCE(SUM(delta), 0) AS b FROM loyalty_ledger WHERE card_id = ?').bind(card.id).first();
  const { results: history } = await env.DB.prepare('SELECT kind, delta, balance_after, created_at FROM loyalty_ledger WHERE card_id = ? ORDER BY created_at DESC LIMIT 20')
    .bind(card.id)
    .all();
  const org = await env.DB.prepare('SELECT slug, name_ar, name_en, brand_color, logo_url FROM orgs WHERE id = ?').bind(card.org_id).first();
  return { code: card.code, token: card.token, stamps: bal.b, program, history, org };
}

app.post('/api/cards', async (c) => {
  await rateLimit(c, 'public-card-create', { limit: 20, window: 3600000 });
  const b = await body(c);
  const org = await c.env.DB.prepare('SELECT o.id FROM orgs o JOIN loyalty_programs p ON p.org_id = o.id WHERE o.slug = ? AND o.active = 1 AND p.active = 1')
    .bind(str(b.org, 'org', { max: 60 }))
    .first();
  if (!org) throw notFound();
  for (let attempt = 0; attempt < 5; attempt++) {
    const card = { id: id(), org_id: org.id, token: randomToken(18), code: shortCode(6) };
    const res = await c.env.DB.prepare('INSERT OR IGNORE INTO loyalty_cards (id, org_id, token, code, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(card.id, card.org_id, card.token, card.code, now())
      .run();
    if (res.meta.changes) return c.json(await cardView(c.env, card), 201);
  }
  throw new HttpError(503, 'try_again');
});

app.get('/api/cards/:token', async (c) => {
  const card = await c.env.DB.prepare('SELECT * FROM loyalty_cards WHERE token = ?').bind(c.req.param('token')).first();
  if (!card) throw notFound();
  return c.json(await cardView(c.env, card));
});

app.get('/api/config', (c) => c.json({ vapidPublicKey: pushConfigured(c.env) ? c.env.VAPID_PUBLIC_KEY : null }));

// ---------- Alerts ----------

export async function alertTicket(env, ticketId, fetcher) {
  const { results } = await env.DB.prepare('SELECT id, endpoint FROM push_subscriptions WHERE ticket_id = ?').bind(ticketId).all();
  const outcome = { sent: 0, failed: 0, subscriptions: results.length };
  for (const s of results) {
    const r = await sendPush(env, s.endpoint, fetcher);
    if (r === 'ok') outcome.sent++;
    else {
      outcome.failed++;
      if (r === 'gone') await env.DB.prepare('DELETE FROM push_subscriptions WHERE id = ?').bind(s.id).run();
    }
  }
  return outcome;
}

// Cron: repeat unseen ready alerts every 2 minutes (max 3 repeats), expire stale tickets and sessions.
export async function scheduled(env, fetcher) {
  await expireDemo(env);
  const t = now();
  await expireSubscriptions(env);
  const { results } = await env.DB.prepare(
    "SELECT id FROM tickets WHERE status = 'ready' AND seen_at IS NULL AND alerts_sent < ? AND last_alert_at <= ?",
  )
    .bind(MAX_ALERTS, t - REALERT_EVERY_MS)
    .all();
  for (const r of results) {
    const res = await env.DB.prepare(
      "UPDATE tickets SET alerts_sent = alerts_sent + 1, last_alert_at = ? WHERE id = ? AND status = 'ready' AND seen_at IS NULL AND alerts_sent < ?",
    )
      .bind(t, r.id, MAX_ALERTS)
      .run();
    if (res.meta.changes) await alertTicket(env, r.id, fetcher);
  }
  await env.DB.batch([
    env.DB.prepare("UPDATE tickets SET status = 'cancelled', version = version + 1 WHERE status IN ('preparing', 'ready') AND created_at < ?").bind(t - TICKET_TTL_MS),
    env.DB.prepare("DELETE FROM push_subscriptions WHERE ticket_id IN (SELECT id FROM tickets WHERE status IN ('collected', 'cancelled'))"),
    env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(t),
  ]);
  return { realerted: results.length };
}

// ---------- Pages ----------

// Asset paths without .html: the assets layer redirects *.html to the clean URL.
registerFeatures(app);
registerIntegrations(app, { onTicketReady: (env, ticketId) => alertTicket(env, ticketId) });

registerDemo(app);

const PAGES = { '/p/': '/profile', '/m/': '/menu', '/t/': '/ticket', '/c/': '/card', '/j/': '/join', '/display/': '/display' };

app.get('*', async (c) => {
  const path = new URL(c.req.url).pathname;
  if (path.startsWith('/api/')) throw notFound();
  for (const [prefix, page] of Object.entries(PAGES)) {
    if (path.startsWith(prefix) && path.length > prefix.length) {
      return c.env.ASSETS.fetch(new Request(new URL(page, c.req.url), c.req.raw));
    }
  }
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
