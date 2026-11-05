import { requireRole, adminMfaRequired } from './context.js';
import { integrationReadiness } from './integrations.js';
import { legalInfo, legalReadiness } from './legal.js';
import { now } from './util.js';

// Configuration is evidence of setup, never evidence of successful delivery.
export function registerLaunch(app) {
  app.get('/api/health', async c => {
    c.header('Cache-Control', 'no-store');
    try {
      const row = await c.env.DB.prepare('SELECT 1 AS ok').first();
      if (row?.ok !== 1) throw new Error('unavailable');
      return c.json({ status: 'ok' });
    } catch {
      return c.json({ status: 'degraded' }, 503);
    }
  });
  app.get('/api/admin/launch', requireRole('admin'), async c => {
    const legal = legalReadiness(await legalInfo(c.env));
    const heartbeat = await c.env.DB.prepare("SELECT value, updated_at FROM platform_settings WHERE key='cron_health'").first();
    let cron = null;
    try { if (heartbeat) cron = { ...JSON.parse(heartbeat.value), updated_at: heartbeat.updated_at, stale: now() - heartbeat.updated_at > 5 * 60_000 }; } catch { /* a missing heartbeat is reported as unknown */ }
    return c.json({
      environment: c.env.ENVIRONMENT || 'development',
      production: c.env.ENVIRONMENT === 'production',
      legal,
      infrastructure: {
        database: 'reachable',
        assets: c.env.MEDIA ? 'r2_bound_unverified' : 'd1_fallback',
        realtime: c.env.HUB ? 'bound_unverified' : 'polling_fallback',
        admin_mfa_required: adminMfaRequired(c.env),
        backup_restore: 'requires_separate_evidence',
      },
      cron,
      integrations: integrationReadiness(c.env),
      assessed_at: now(),
    });
  });
  app.get('/api/owner/launch', requireRole('owner'), async c => {
    const org = c.get('user').org_id;
    const q = sql => c.env.DB.prepare(sql).bind(org).first();
    const [design, items, branches, devices] = await Promise.all([
      q('SELECT published_json IS NOT NULL AS published FROM org_designs WHERE org_id=?'),
      q('SELECT COUNT(*) AS n FROM items WHERE org_id=? AND active=1 AND is_sample=0'),
      q('SELECT COUNT(*) AS n FROM branches WHERE org_id=? AND active=1'),
      q('SELECT COUNT(*) AS n FROM display_devices d JOIN branches b ON b.id=d.branch_id WHERE b.org_id=? AND d.revoked_at IS NULL'),
    ]);
    return c.json({
      environment: c.env.ENVIRONMENT || 'development',
      checks: [
        { id:'design', ready: Boolean(design?.published), count: Boolean(design?.published) ? 1 : 0, action:'design' },
        { id:'items', ready: items.n > 0, count: items.n, action:'menu' },
        { id:'branches', ready: branches.n > 0, count: branches.n, action:'branches' },
        { id:'devices', ready: devices.n > 0, count: devices.n, action:'devices' },
      ],
      integrations: integrationReadiness(c.env),
      assessed_at: now(),
    });
  });
}
