// Operator-configured outbound events. No customer content or browser-supplied URLs.
import { requireRole, body, audit } from './context.js';
import { bad, hmac, id, now, HttpError, int, notFound, str } from './util.js';

const MAX_ATTEMPTS = 5;
const LEASE_MS = 60_000;
const STATUSES = ['ready', 'collected', 'cancelled'];

// Put immediately after the conditional ticket UPDATE in one D1.batch. The
// version predicate suppresses events when that UPDATE lost a concurrent race.
export function ticketAutomationStatement(env, event) {
  if (!automationReadiness(env).configured) return null;
  if (!STATUSES.includes(event.status)) throw bad('invalid_automation_status');
  const orgId = str(event.org_id, 'org_id', { max: 100 });
  const ticketId = str(event.ticket_id, 'ticket_id', { max: 100 });
  const branchId = str(event.branch_id, 'branch_id', { max: 100 });
  const version = int(event.version, 'version', { min: 1 });
  const timestamp = int(event.timestamp ?? now(), 'timestamp', { min: 0, max: Number.MAX_SAFE_INTEGER });
  const eventId = id();
  const payload = JSON.stringify({ id: eventId, type: 'ticket.status_changed', version: 1, occurred_at: timestamp,
    org_id: orgId, data: { branch_id: branchId, ticket_id: ticketId, status: event.status, version } });
  return env.DB.prepare(`INSERT OR IGNORE INTO automation_deliveries(id,org_id,dedupe_key,payload,next_attempt_at,created_at)
    SELECT ?,?,?,?,?,? FROM tickets WHERE id=? AND org_id=? AND branch_id=? AND status=? AND version=? AND changes()=1`)
    .bind(eventId, orgId, `${ticketId}:${version}`, payload, timestamp, timestamp, ticketId, orgId, branchId, event.status, version);
}

export function automationReadiness(env) {
  const enabled = env.AUTOMATION_ENABLED === 'true';
  let endpoint;
  try {
    const u = new URL(env.AUTOMATION_WEBHOOK_URL);
    // DNS names only, operator-owned HTTPS endpoint. Redirects are never followed.
    // Runtime DNS resolution/egress policy must also keep private networks unreachable.
    const host = u.hostname.toLowerCase();
    if (u.protocol === 'https:' && !u.username && !u.password && !u.hash && (!u.port || u.port === '443') &&
      host.includes('.') && !/^[\d.]+$/.test(host) && !host.includes(':') &&
      !/(^|\.)(localhost|local|internal|test|invalid|example|onion)$/.test(host)) endpoint = u.href;
  } catch {}
  const signed = typeof env.AUTOMATION_SIGNING_SECRET === 'string' && env.AUTOMATION_SIGNING_SECRET.length >= 32;
  return { enabled, configured: enabled && Boolean(endpoint) && signed, endpoint, state: !enabled ? 'disabled' : endpoint && signed ? 'configured_unverified' : 'needs_configuration', verified: false };
}

export async function automationCron(env, fetcher = fetch) {
  const config = automationReadiness(env);
  if (!config.configured) return { automation: 0, state: config.state };
  const t = now();
  const { results } = await env.DB.prepare(`SELECT d.id FROM automation_deliveries d JOIN orgs o ON o.id=d.org_id WHERE o.active=1 AND d.attempts<? AND ((d.status='pending' AND d.next_attempt_at<=?) OR (d.status='delivering' AND d.lease_expires_at<=?)) ORDER BY d.next_attempt_at LIMIT 10`)
    .bind(MAX_ATTEMPTS, t, t).all();
  let delivered = 0;
  for (const candidate of results) {
    const lease = id();
    const claimed = await env.DB.prepare(`UPDATE automation_deliveries SET status='delivering',attempts=attempts+1,lease_token=?,lease_expires_at=? WHERE id=? AND attempts<? AND ((status='pending' AND next_attempt_at<=?) OR (status='delivering' AND lease_expires_at<=?))`)
      .bind(lease, now() + LEASE_MS, candidate.id, MAX_ATTEMPTS, t, t).run();
    if (!claimed.meta.changes) continue;
    const row = await env.DB.prepare('SELECT payload,attempts FROM automation_deliveries WHERE id=? AND lease_token=?').bind(candidate.id, lease).first();
    const timestamp = String(Math.floor(now() / 1000));
    let status = null, ok = false;
    try {
      const signature = await hmac(env.AUTOMATION_SIGNING_SECRET, `${timestamp}.${row.payload}`);
      const response = await fetcher(config.endpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000),
        headers: { 'content-type': 'application/json', 'x-zimara-event-id': candidate.id, 'x-zimara-timestamp': timestamp, 'x-zimara-signature': signature }, body: row.payload });
      status = response.status;
      ok = status >= 200 && status < 300;
      // Do not retain or expose receiver responses (they may contain secrets).
      try { await response.body?.cancel(); } catch {}
    } catch { /* Network errors use the same bounded retry policy. */ }
    const state = ok ? 'delivered' : row.attempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
    await env.DB.prepare(`UPDATE automation_deliveries SET status=?,last_status=?,next_attempt_at=?,delivered_at=?,lease_token=NULL,lease_expires_at=NULL WHERE id=? AND lease_token=?`)
      .bind(state, status, now() + Math.min(3600000, 60000 * 2 ** (row.attempts - 1)), ok ? now() : null, candidate.id, lease).run();
    if (ok) delivered++;
  }
  // A crash on the last attempt leaves an expired lease; make that terminal and visible.
  await env.DB.prepare(`UPDATE automation_deliveries SET status='failed',lease_token=NULL,lease_expires_at=NULL WHERE status='delivering' AND attempts>=? AND lease_expires_at<=?`).bind(MAX_ATTEMPTS, now()).run();
  // Minimal event metadata has a bounded retention window.
  await env.DB.prepare(`DELETE FROM automation_deliveries WHERE created_at<? AND status IN ('delivered','failed')`).bind(now() - 30 * 86400000).run();
  return { automation: delivered, state: config.state };
}

export function registerAutomation(app) {
  const admin = requireRole('admin');
  app.get('/api/admin/automation', admin, async (c) => {
    const { endpoint: _endpoint, ...readiness } = automationReadiness(c.env);
    const { results: counts } = await c.env.DB.prepare('SELECT status,COUNT(*) AS count FROM automation_deliveries GROUP BY status').all();
    const { results: deliveries } = await c.env.DB.prepare('SELECT id,org_id,status,attempts,last_status,created_at,delivered_at,next_attempt_at FROM automation_deliveries ORDER BY created_at DESC LIMIT 50').all();
    return c.json({ ...readiness, max_attempts: MAX_ATTEMPTS, counts, deliveries });
  });
  app.post('/api/admin/automation/:id/retry', admin, async (c) => {
    await body(c);
    if (!automationReadiness(c.env).configured) throw new HttpError(503, 'automation_not_configured');
    const deliveryId = c.req.param('id');
    const result = await c.env.DB.prepare(`UPDATE automation_deliveries SET status='pending',attempts=0,next_attempt_at=?,last_status=NULL WHERE id=? AND status='failed'`).bind(now(), deliveryId).run();
    if (!result.meta.changes) throw notFound('failed_delivery_not_found');
    await audit(c.env, c.get('user'), 'automation.retry', { id: deliveryId });
    return c.json({ ok: true, queued: true });
  });
}
