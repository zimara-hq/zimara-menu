import { loadUser, hashPassword, validPassword } from './auth.js';
import { HttpError, bad, forbidden, hmac, id, now, str } from './util.js';

export const PLANS = Object.freeze({
  pager: { id: 'pager', monthly: 4900, annual: 49000, limits: { branches: 1, items: 0 } },
  basic: { id: 'basic', monthly: 12900, annual: 129000, limits: { branches: 1, items: 500 } },
  pro: { id: 'pro', monthly: 24900, annual: 249000, limits: { branches: 3, items: 5000 } },
  chains: { id: 'chains', monthly: null, annual: null, limits: { branches: 100, items: 50000 } },
});
export const adminMfaRequired = (env) => env.ENVIRONMENT === 'production' || env.REQUIRE_ADMIN_MFA === 'true';
export const isSecure = (c) => new URL(c.req.url).protocol === 'https:';
export async function body(c) {
  try {
    const b = await c.req.json();
    if (!b || typeof b !== 'object' || Array.isArray(b)) throw 0;
    return b;
  } catch { throw bad('invalid_json'); }
}
export async function subscriptionFor(env, orgId) {
  const s = await env.DB.prepare('SELECT * FROM subscriptions WHERE org_id = ?').bind(orgId).first();
  if (!s) return null;
  if (s.status === 'trial' && s.trial_ends_at <= now()) return { ...s, status: 'suspended', expired: true };
  if (s.cancel_at_period_end && s.current_period_end && s.current_period_end <= now()) return { ...s, status: 'cancelled' };
  if (['active','past_due'].includes(s.status) && s.current_period_end && s.current_period_end + 7 * 86400000 <= now()) return { ...s, status: 'suspended' };
  return s;
}
export const planFor = (s) => PLANS[s?.plan] || PLANS.pro;
export async function assertOrgWritable(env, user) {
  if (!user.org_id) return;
  const org = await env.DB.prepare('SELECT active FROM orgs WHERE id = ?').bind(user.org_id).first();
  if (!org?.active) throw forbidden('organization_suspended');
  const s = await subscriptionFor(env, user.org_id);
  if (s && ['suspended', 'cancelled'].includes(s.status)) throw new HttpError(402, 'subscription_read_only');
}
export async function assertPlanQuota(env, orgId, resource, increment = 1) {
  if (!['branches', 'items'].includes(resource)) throw new Error('Unknown quota resource');
  const s = await subscriptionFor(env, orgId);
  if (!s) return; // Existing accounts are preserved until explicitly migrated to billing.
  const limit = planFor(s).limits[resource];
  const count = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${resource} WHERE org_id = ?`).bind(orgId).first();
  if (count.n + increment > limit) throw new HttpError(409, 'plan_' + resource + '_limit');
}
export function requireRole(...roles) {
  return async (c, next) => {
    const user = await loadUser(c.env, c.req.raw);
    if (!user) throw new HttpError(401, 'unauthenticated');
    if (!roles.includes(user.role)) throw forbidden();
    // A subscription or organization suspension must not block the owner's
    // narrow data-rights workflow. Authentication, role and fixed org scope stay
    // mandatory; no operational route inherits this exception.
    const dataRight = user.role === 'owner' && (
      (c.req.method === 'GET' && ['/api/owner/data/export', '/api/owner/data/deletion-request'].includes(c.req.path)) ||
      (c.req.method === 'POST' && (c.req.path === '/api/owner/data/deletion-request' || /^\/api\/owner\/data\/deletion-request\/[0-9a-f-]{36}\/cancel$/.test(c.req.path)))
    );
    if (user.org_id && !dataRight) {
      const org = await c.env.DB.prepare('SELECT active FROM orgs WHERE id = ?').bind(user.org_id).first();
      if (!org?.active) throw forbidden('organization_suspended');
      if (user.branch_id) {
        const branch = await c.env.DB.prepare('SELECT active FROM branches WHERE id = ? AND org_id = ?').bind(user.branch_id, user.org_id).first();
        if (!branch?.active) throw forbidden('branch_suspended');
      }
      if (!['GET', 'HEAD'].includes(c.req.method) && !c.req.path.endsWith('/subscription/cancel') && !c.req.path.startsWith('/api/me/')) await assertOrgWritable(c.env, user);
    }
    if (user.role === 'admin' && adminMfaRequired(c.env) && !c.req.path.startsWith('/api/me')) {
      if (!user.mfa_enabled) throw forbidden('mfa_enrollment_required');
      if (!user.mfa_verified) throw forbidden('mfa_required');
    }
    c.set('user', user);
    await next();
  };
}
export async function audit(env, user, action, detail) {
  await env.DB.prepare('INSERT INTO audit_log (id,user_id,org_id,action,detail,created_at) VALUES (?,?,?,?,?,?)')
    .bind(id(), user?.id ?? null, user?.org_id ?? null, action, detail ? JSON.stringify(detail) : null, now()).run();
}
export async function newUser(c, b, role) {
  const email = str(b.email, 'email', { max: 200 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad('invalid_email');
  if (!validPassword(b.password)) throw bad('weak_password');
  const caller = c.get('user');
  if (caller?.org_id) {
    const demo = await c.env.DB.prepare('SELECT id FROM demo_rooms WHERE org_id = ?').bind(caller.org_id).first();
    if (demo && !email.endsWith('@demo.invalid')) throw bad('demo_email_required');
  }
  return { id: id(), email, name: str(b.name, 'name', { max: 80 }), role, password_hash: await hashPassword(b.password) };
}
export async function rateLimit(c, scope, { limit = 10, window = 900000 } = {}) {
  const key = scope + ':' + await hmac(c.env.AUTH_SECRET, c.req.header('cf-connecting-ip') || 'local');
  const t = now();
  await c.env.DB.prepare(`INSERT INTO request_limits (key,count,window_start) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count = CASE WHEN ? - window_start >= ? THEN 1 ELSE count + 1 END, window_start = CASE WHEN ? - window_start >= ? THEN ? ELSE window_start END`).bind(key,t,t,window,t,window,t).run();
  const row = await c.env.DB.prepare('SELECT count FROM request_limits WHERE key = ?').bind(key).first();
  if (row.count > limit) throw new HttpError(429, 'too_many_attempts');
}
