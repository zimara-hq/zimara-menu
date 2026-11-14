// Owner's own domain, served through Cloudflare for SaaS custom hostnames.
// The owner adds one CNAME at their registrar; Cloudflare issues and renews the certificate.
import { requireRole, body, audit, subscriptionFor } from './context.js';
import { bad, forbidden, notFound, conflict, now, HttpError } from './util.js';

export const domainsConfigured = (env) => Boolean(env.CF_API_TOKEN && env.CF_ZONE_ID && env.DOMAIN_CNAME_TARGET);
const PLANS_WITH_DOMAIN = new Set(['pro', 'chains']);
const HOST_RE = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export function normalizeHostname(v) {
  const h = String(v ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.$/, '');
  if (!HOST_RE.test(h)) throw bad('invalid_hostname');
  if (/(^|\.)zimara\.co$|\.workers\.dev$|\.pages\.dev$/.test(h)) throw bad('invalid_hostname');
  return h;
}

export async function cf(env, method, path, payload, fetcher = fetch) {
  const res = await fetcher(`https://api.cloudflare.com/client/v4/zones/${env.CF_ZONE_ID}/custom_hostnames${path}`, {
    method,
    headers: { authorization: `Bearer ${env.CF_API_TOKEN}`, 'content-type': 'application/json' },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    const code = data.errors?.[0]?.code;
    if (code === 1406 || code === 1407) throw conflict('hostname_taken');
    throw new HttpError(502, 'domain_provider_error');
  }
  return data.result;
}

// DNS records the owner must add, in plain fields the dashboard shows as a table.
function records(env, hostname, r) {
  const out = [{ type: 'CNAME', name: hostname, value: env.DOMAIN_CNAME_TARGET, purpose: 'route' }];
  const own = r?.ownership_verification;
  if (own?.type === 'txt' && own.name && own.value) out.push({ type: 'TXT', name: own.name, value: own.value, purpose: 'ownership' });
  for (const v of r?.ssl?.validation_records || []) if (v.txt_name && v.txt_value) out.push({ type: 'TXT', name: v.txt_name, value: v.txt_value, purpose: 'certificate' });
  return out;
}

const statusOf = (r) => (r?.status === 'active' && r?.ssl?.status === 'active' ? 'active' : /blocked|moved|deleted/.test(r?.status || '') ? 'failed' : 'pending');

function view(row) {
  if (!row) return null;
  return { hostname: row.hostname, status: row.status, ssl_status: row.ssl_status, records: JSON.parse(row.verify_json || '[]'), checked_at: row.checked_at };
}

async function assertPlan(env, orgId) {
  const s = await subscriptionFor(env, orgId);
  if (s && !PLANS_WITH_DOMAIN.has(s.plan)) throw forbidden('plan_domain');
}

export function registerDomains(app, { fetcher } = {}) {
  const owner = requireRole('owner');

  app.get('/api/owner/domain', owner, async (c) => {
    const row = await c.env.DB.prepare('SELECT * FROM org_domains WHERE org_id=?').bind(c.get('user').org_id).first();
    return c.json({ configured: domainsConfigured(c.env), target: c.env.DOMAIN_CNAME_TARGET || null, domain: view(row) });
  });

  app.put('/api/owner/domain', owner, async (c) => {
    if (!domainsConfigured(c.env)) throw forbidden('domains_not_configured');
    const u = c.get('user');
    await assertPlan(c.env, u.org_id);
    const hostname = normalizeHostname((await body(c)).hostname);
    const existing = await c.env.DB.prepare('SELECT * FROM org_domains WHERE org_id=?').bind(u.org_id).first();
    if (existing?.hostname === hostname) return c.json({ domain: view(existing) });
    const taken = await c.env.DB.prepare('SELECT org_id FROM org_domains WHERE hostname=?').bind(hostname).first();
    if (taken) throw conflict('hostname_taken');
    if (existing?.cf_id) await cf(c.env, 'DELETE', '/' + existing.cf_id, null, fetcher).catch(() => {});
    const r = await cf(c.env, 'POST', '', { hostname, ssl: { method: 'txt', type: 'dv', settings: { min_tls_version: '1.2' } } }, fetcher);
    const t = now();
    await c.env.DB.prepare(
      `INSERT INTO org_domains(org_id,hostname,cf_id,status,ssl_status,verify_json,checked_at,created_at) VALUES(?,?,?,?,?,?,?,?)
       ON CONFLICT(org_id) DO UPDATE SET hostname=excluded.hostname, cf_id=excluded.cf_id, status=excluded.status, ssl_status=excluded.ssl_status, verify_json=excluded.verify_json, checked_at=excluded.checked_at, created_at=excluded.created_at`,
    ).bind(u.org_id, hostname, r.id, statusOf(r), r.ssl?.status || '', JSON.stringify(records(c.env, hostname, r)), t, t).run();
    await audit(c.env, u, 'domain.add', { hostname });
    return c.json({ domain: view(await c.env.DB.prepare('SELECT * FROM org_domains WHERE org_id=?').bind(u.org_id).first()) }, 201);
  });

  app.post('/api/owner/domain/check', owner, async (c) => {
    if (!domainsConfigured(c.env)) throw forbidden('domains_not_configured');
    const u = c.get('user');
    const row = await c.env.DB.prepare('SELECT * FROM org_domains WHERE org_id=?').bind(u.org_id).first();
    if (!row) throw notFound();
    const r = await cf(c.env, 'GET', '/' + row.cf_id, null, fetcher);
    await c.env.DB.prepare('UPDATE org_domains SET status=?, ssl_status=?, verify_json=?, checked_at=? WHERE org_id=?')
      .bind(statusOf(r), r.ssl?.status || '', JSON.stringify(records(c.env, row.hostname, r)), now(), u.org_id).run();
    return c.json({ domain: view(await c.env.DB.prepare('SELECT * FROM org_domains WHERE org_id=?').bind(u.org_id).first()) });
  });

  app.delete('/api/owner/domain', owner, async (c) => {
    const u = c.get('user');
    const row = await c.env.DB.prepare('SELECT * FROM org_domains WHERE org_id=?').bind(u.org_id).first();
    if (!row) throw notFound();
    if (row.cf_id && domainsConfigured(c.env)) await cf(c.env, 'DELETE', '/' + row.cf_id, null, fetcher).catch(() => {});
    await c.env.DB.prepare('DELETE FROM org_domains WHERE org_id=?').bind(u.org_id).run();
    await audit(c.env, u, 'domain.remove', { hostname: row.hostname });
    return c.json({ ok: true });
  });
}

// Requests arriving on an owner's active domain: its root opens the business page.
// Every other path (/m/…, /api/…, assets) is served as usual on that host.
export async function customHostRedirect(c) {
  if (!c.env.DOMAIN_CNAME_TARGET) return null;
  const u = new URL(c.req.url);
  if (u.pathname !== '/' || !['GET', 'HEAD'].includes(c.req.method)) return null;
  const base = c.env.PUBLIC_BASE_URL ? new URL(c.env.PUBLIC_BASE_URL).hostname : null;
  if (u.hostname === base || /localhost|127\.0\.0\.1|\.workers\.dev$/.test(u.hostname)) return null;
  const row = await c.env.DB.prepare(
    "SELECT o.slug FROM org_domains d JOIN orgs o ON o.id=d.org_id WHERE d.hostname=? AND d.status='active' AND o.active=1",
  ).bind(u.hostname).first();
  return row ? c.redirect('/p/' + encodeURIComponent(row.slug), 302) : null;
}
