import { requireRole, body, audit, assertOrgWritable, subscriptionFor, rateLimit } from '../context.js';
import { HttpError, bad, id, notFound, now, randomToken, str } from '../util.js';
import { encryptionConfigured, encryptSigningSecret, decryptSigningSecret } from './pos-bridge.js';

// Direct Rewaa link by polling (Rewaa documents webhooks only for online orders and products,
// not for POS sales). Every minute, each active connection lists recent sale invoices for its
// mapped stock location and opens one pager ticket per invoice, exactly once.
//
// Facts from Rewaa's public API docs (doc.api.rewaatech.com):
//   POST /authenticate {email, password} with an "Authorization" header issued by Rewaa;
//   returns idToken (valid one hour), which is then sent as the Authorization header.
//   GET /stock-location lists locations (id, name, code).
// Not confirmed publicly: the sale-invoice list path. It defaults to /pos/invoices and can be
// changed with REWAA_SALES_PATH once Rewaa support confirms it. Until a real sale has created a
// ticket, readiness stays "configured_unverified".
const DEFAULT_API = 'https://api.platform.rewaatech.com';
const TOKEN_TTL = 50 * 60000;
const LOOKBACK = 30 * 60000;
const http = (env) => env.HTTP_FETCH || fetch;
const api = (env) => String(env.REWAA_API_BASE || DEFAULT_API).replace(/\/$/, '');

export const rewaaConfigured = (env) => env.REWAA_ENABLED === 'true' && encryptionConfigured(env);

async function call(env, path, { method = 'GET', auth, payload } = {}) {
  const res = await http(env)(api(env) + path, {
    method,
    headers: { ...(auth ? { authorization: auth } : {}), ...(payload ? { 'content-type': 'application/json' } : {}), accept: 'application/json' },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (res.status === 401 || res.status === 403) throw new HttpError(502, 'rewaa_auth_failed');
  if (!res.ok || data === null) throw new HttpError(502, 'rewaa_error_' + res.status);
  return data;
}

async function authenticate(env, creds) {
  const data = await call(env, '/authenticate', { method: 'POST', auth: creds.authorization, payload: { email: creds.email, password: creds.password } });
  const token = data.idToken || data.data?.idToken || data.token;
  if (!token || typeof token !== 'string') throw new HttpError(502, 'rewaa_auth_failed');
  return token;
}

const list = (data) => (Array.isArray(data) ? data : data?.data?.rows || data?.rows || data?.data || data?.result || data?.items || []);
const locationOf = (inv) => String(inv.stockLocationId ?? inv.locationId ?? inv.StockLocation?.id ?? inv.stockLocation?.id ?? '');
const timeOf = (inv) => Date.parse(inv.completeDate || inv.createdAt || inv.created_at || '') || 0;
const cancelled = (inv) => /cancel|void|return|draft/i.test(String(inv.status || '') + String(inv.type || ''));

function readCreds(b) {
  return {
    email: str(b.email, 'email', { max: 200 }).toLowerCase(),
    password: str(b.password, 'password', { max: 200 }),
    authorization: str(b.authorization, 'authorization', { max: 4000 }),
  };
}

async function entitlement(c) {
  if (!rewaaConfigured(c.env)) throw new HttpError(503, 'rewaa_not_configured');
  const user = c.get('user');
  await assertOrgWritable(c.env, user);
  const subscription = await subscriptionFor(c.env, user.org_id);
  if (subscription && !['pro', 'chains'].includes(subscription.plan)) throw new HttpError(403, 'pos_plan_required');
}

const SAFE = 'id, branch_id, label, location_id, active, last_polled_at, last_ok_at, last_error, imported, created_at, revoked_at';

export function registerRewaa(app) {
  // Lets the owner check the credentials and pick the matching Rewaa location. Nothing is stored.
  app.post('/api/owner/rewaa/locations', requireRole('owner'), async (c) => {
    await entitlement(c);
    await rateLimit(c, 'rewaa-test', { limit: 10, window: 3600000 });
    const creds = readCreds(await body(c));
    const token = await authenticate(c.env, creds);
    const rows = list(await call(c.env, '/stock-location', { auth: token }));
    return c.json({ locations: rows.slice(0, 200).map((l) => ({ id: String(l.id), name: l.name || '', code: l.code || '', active: l.isActive !== false })) });
  });

  app.get('/api/owner/rewaa-connections', requireRole('owner'), async (c) => {
    const { results } = await c.env.DB.prepare(`SELECT ${SAFE} FROM rewaa_connections WHERE org_id = ? ORDER BY created_at DESC LIMIT 100`).bind(c.get('user').org_id).all();
    return c.json({ enabled: rewaaConfigured(c.env), connections: results });
  });

  app.post('/api/owner/rewaa-connections', requireRole('owner'), async (c) => {
    await entitlement(c);
    await rateLimit(c, 'rewaa-test', { limit: 10, window: 3600000 });
    const b = await body(c);
    const u = c.get('user');
    const branch = await c.env.DB.prepare('SELECT id FROM branches WHERE id = ? AND org_id = ? AND active = 1').bind(str(b.branch_id, 'branch_id', { max: 100 }), u.org_id).first();
    if (!branch) throw notFound('branch_not_found');
    const creds = readCreds(b);
    const locationId = str(String(b.location_id ?? ''), 'location_id', { max: 100 });
    const label = str(b.label || 'Rewaa', 'label', { max: 80 });
    // Prove the credentials work before saving them.
    const token = await authenticate(c.env, creds);
    const cid = id(), t = now();
    try {
      await c.env.DB.prepare('INSERT INTO rewaa_connections (id, org_id, branch_id, label, location_id, credentials_ciphertext, token_ciphertext, token_expires_at, since, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(cid, u.org_id, branch.id, label, locationId, await encryptSigningSecret(c.env, JSON.stringify(creds), cid), await encryptSigningSecret(c.env, token, cid + ':token'), t + TOKEN_TTL, t, t).run();
    } catch (error) {
      if (/UNIQUE/i.test(String(error))) throw new HttpError(409, 'branch_already_linked');
      throw error;
    }
    await audit(c.env, u, 'rewaa.connection.create', { id: cid, branch_id: branch.id, location_id: locationId });
    return c.json({ id: cid, branch_id: branch.id, location_id: locationId, label }, 201);
  });

  app.post('/api/owner/rewaa-connections/:id/revoke', requireRole('owner'), async (c) => {
    const r = await c.env.DB.prepare("UPDATE rewaa_connections SET active = 0, revoked_at = ?, credentials_ciphertext = '', token_ciphertext = NULL WHERE id = ? AND org_id = ? AND active = 1")
      .bind(now(), c.req.param('id'), c.get('user').org_id).run();
    if (!r.meta?.changes) throw notFound();
    await audit(c.env, c.get('user'), 'rewaa.connection.revoke', { id: c.req.param('id') });
    return c.json({ ok: true });
  });
}

async function tokenFor(env, conn, t) {
  if (conn.token_ciphertext && conn.token_expires_at > t) return decryptSigningSecret(env, conn.token_ciphertext, conn.id + ':token');
  const creds = JSON.parse(await decryptSigningSecret(env, conn.credentials_ciphertext, conn.id));
  const token = await authenticate(env, creds);
  await env.DB.prepare('UPDATE rewaa_connections SET token_ciphertext = ?, token_expires_at = ? WHERE id = ?')
    .bind(await encryptSigningSecret(env, token, conn.id + ':token'), t + TOKEN_TTL, conn.id).run();
  return token;
}

async function openTicket(env, conn, inv, t) {
  const invoiceId = String(inv.id ?? '').slice(0, 120);
  if (!invoiceId) return false;
  const claimed = await env.DB.prepare('INSERT OR IGNORE INTO rewaa_invoices (connection_id, invoice_id, created_at) VALUES (?, ?, ?)').bind(conn.id, invoiceId, t).run();
  if (!claimed.meta?.changes) return false;
  const invoiceNumber = String(inv.invoiceNumber ?? inv.number ?? invoiceId).replace(/[\x00-\x1f\x7f]/g, '').slice(0, 60);
  for (let attempt = 0; attempt < 3; attempt++) {
    const last = await env.DB.prepare("SELECT MAX(CAST(number AS INTEGER)) AS n FROM tickets WHERE branch_id = ? AND (created_at > ? OR status IN ('preparing', 'ready')) AND number GLOB '[0-9]*'")
      .bind(conn.branch_id, t - 86400000).first();
    const tid = id();
    try {
      await env.DB.batch([
        env.DB.prepare("INSERT INTO tickets (id, org_id, branch_id, number, invoice_number, token, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'preparing', ?)")
          .bind(tid, conn.org_id, conn.branch_id, String((last?.n || 0) + 1), invoiceNumber, randomToken(18), t),
        env.DB.prepare('UPDATE rewaa_invoices SET ticket_id = ? WHERE connection_id = ? AND invoice_id = ?').bind(tid, conn.id, invoiceId),
        env.DB.prepare('UPDATE rewaa_connections SET imported = imported + 1 WHERE id = ?').bind(conn.id),
      ]);
      return true;
    } catch (error) {
      if (!/UNIQUE|constraint/i.test(String(error?.message ?? error)) || attempt === 2) {
        await env.DB.prepare('DELETE FROM rewaa_invoices WHERE connection_id = ? AND invoice_id = ? AND ticket_id IS NULL').bind(conn.id, invoiceId).run();
        throw error;
      }
    }
  }
  return false;
}

export async function pollConnection(env, conn, t = now()) {
  await env.DB.prepare('UPDATE rewaa_connections SET last_polled_at = ? WHERE id = ?').bind(t, conn.id).run();
  try {
    const sub = await subscriptionFor(env, conn.org_id);
    if (sub && !['pro', 'chains'].includes(sub.plan)) throw new HttpError(403, 'pos_plan_required');
    if (sub && ['suspended', 'cancelled'].includes(sub.status)) throw new HttpError(402, 'subscription_read_only');
    let token = await tokenFor(env, conn, t);
    const path = String(env.REWAA_SALES_PATH || '/pos/invoices') + '?offset=0&limit=50';
    let data;
    try { data = await call(env, path, { auth: token }); } catch (e) {
      if (e.code !== 'rewaa_auth_failed') throw e;
      token = await tokenFor(env, { ...conn, token_ciphertext: null }, t);
      data = await call(env, path, { auth: token });
    }
    const floor = Math.max(conn.since, t - LOOKBACK);
    let created = 0;
    for (const inv of list(data)) {
      if (locationOf(inv) !== conn.location_id || cancelled(inv) || timeOf(inv) < floor) continue;
      if (await openTicket(env, conn, inv, t)) created++;
    }
    await env.DB.prepare('UPDATE rewaa_connections SET last_ok_at = ?, last_error = NULL WHERE id = ?').bind(t, conn.id).run();
    return { created };
  } catch (error) {
    await env.DB.prepare('UPDATE rewaa_connections SET last_error = ? WHERE id = ?').bind(String(error?.code || error?.message || error).slice(0, 120), conn.id).run();
    return { error: true };
  }
}

export async function pollRewaa(env) {
  if (!rewaaConfigured(env)) return;
  const t = now();
  const { results } = await env.DB.prepare('SELECT * FROM rewaa_connections WHERE active = 1 AND last_polled_at < ? ORDER BY last_polled_at LIMIT 10').bind(t - 50000).all();
  for (const conn of results) await pollConnection(env, conn, t);
}
