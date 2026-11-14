// Personal-data lifecycle required by the Saudi PDPL and by App Store guideline 5.1.1(v):
// a deletion request really ends in erasure, and customer contact data is not kept forever.
import { requireRole, audit } from './context.js';
import { notFound, now, randomToken, HttpError, conflict } from './util.js';
import { cf, domainsConfigured } from './domains.js';

const DAY = 86400000;
// The owner can cancel during this window; afterwards the scheduled job erases the org.
export const DELETION_GRACE_MS = 14 * DAY;
export const DEFAULT_PII_RETENTION_DAYS = 90;
// Destructive processing requires explicit operator activation, never merely a deployment.
export const privacyErasureEnabled = env => env.PRIVACY_ERASURE_ENABLED === 'true';

export function piiRetentionMs(env) {
  const days = Number(env.PII_RETENTION_DAYS);
  return (Number.isInteger(days) && days >= 1 && days <= 3650 ? days : DEFAULT_PII_RETENTION_DAYS) * DAY;
}

// Rows kept after erasure because another law requires them: subscription invoices and
// payments (commercial books and tax records), billing notices, the security audit log and
// the deletion request itself as proof that the right was honoured. Everything else that
// belongs to the organisation is deleted. Tests assert every table is classified here.
export const RETAINED_TABLES = Object.freeze([
  'orgs', 'subscriptions', 'billing_checkouts', 'subscription_invoices', 'subscription_invoice_jobs',
  'subscription_receipt_jobs', 'billing_notices', 'audit_log', 'data_deletion_requests', 'users',
]);
// Children first so foreign keys hold at every step of the single transaction.
export const ERASED_TABLES = Object.freeze([
  ['org_seasons', 'org_id=?1'],
  ['tenant_asset_blobs', 'asset_id IN (SELECT id FROM tenant_assets WHERE org_id=?1)'],
  ['tenant_assets', 'org_id=?1'],
  ['card_inbox', 'card_id IN (SELECT id FROM loyalty_cards WHERE org_id=?1)'],
  ['card_push', 'card_id IN (SELECT id FROM loyalty_cards WHERE org_id=?1)'],
  ['loyalty_ledger', 'card_id IN (SELECT id FROM loyalty_cards WHERE org_id=?1) OR branch_id IN (SELECT id FROM branches WHERE org_id=?1)'],
  ['revoked_card_tokens', 'org_id=?1'],
  ['loyalty_cards', 'org_id=?1'],
  ['loyalty_messages', 'org_id=?1'],
  ['loyalty_programs', 'org_id=?1'],
  ['push_subscriptions', 'ticket_id IN (SELECT id FROM tickets WHERE org_id=?1)'],
  ['cashier_ticket_requests', 'branch_id IN (SELECT id FROM branches WHERE org_id=?1)'],
  ['pos_orders', 'connection_id IN (SELECT id FROM pos_connections WHERE org_id=?1)'],
  ['pos_events', 'connection_id IN (SELECT id FROM pos_connections WHERE org_id=?1)'],
  ['pos_connections', 'org_id=?1'],
  ['rewaa_invoices', 'connection_id IN (SELECT id FROM rewaa_connections WHERE org_id=?1)'],
  ['rewaa_connections', 'org_id=?1'],
  ['customer_orders', 'org_id=?1'],
  ['tickets', 'org_id=?1'],
  ['waitlist_push', 'entry_id IN (SELECT id FROM waitlist WHERE org_id=?1)'],
  ['waitlist', 'org_id=?1'],
  ['waitlist_settings', 'branch_id IN (SELECT id FROM branches WHERE org_id=?1)'],
  ['branch_unavailable', 'branch_id IN (SELECT id FROM branches WHERE org_id=?1)'],
  ['menu_category_schedules', 'branch_id IN (SELECT id FROM branches WHERE org_id=?1)'],
  ['items', 'org_id=?1'],
  ['categories', 'org_id=?1'],
  ['branch_ordering', 'branch_id IN (SELECT id FROM branches WHERE org_id=?1)'],
  ['branch_permissions', 'branch_id IN (SELECT id FROM branches WHERE org_id=?1)'],
  ['branch_settings', 'branch_id IN (SELECT id FROM branches WHERE org_id=?1)'],
  ['display_devices', 'org_id=?1'],
  ['telegram_codes', 'org_id=?1'],
  ['telegram_links', 'org_id=?1'],
  ['demo_rooms', 'org_id=?1'],
  ['coupons', 'org_id=?1'],
  ['ai_imports', 'org_id=?1'],
  ['menu_imports', 'org_id=?1'],
  ['design_schedules', 'org_id=?1'],
  ['design_versions', 'org_id=?1'],
  ['org_designs', 'org_id=?1'],
  ['org_domains', 'org_id=?1'],
  ['org_profiles', 'org_id=?1'],
  ['org_addons', 'org_id=?1'],
  ['automation_deliveries', 'org_id=?1'],
  // Credentials of every account in the org.
  ['sessions', 'user_id IN (SELECT id FROM users WHERE org_id=?1)'],
  ['passkeys', 'user_id IN (SELECT id FROM users WHERE org_id=?1)'],
  ['mfa_recovery_codes', 'user_id IN (SELECT id FROM users WHERE org_id=?1)'],
  ['email_tokens', 'user_id IN (SELECT id FROM users WHERE org_id=?1)'],
  ['webauthn_challenges', 'user_id IN (SELECT id FROM users WHERE org_id=?1)'],
]);
// Deleted after the accounts that point at them.
export const ERASED_LAST = Object.freeze(['branches']);
// Platform-wide tables with no organisation data.
export const PLATFORM_TABLES = Object.freeze(['platform_settings', 'login_attempts', 'request_limits', 'season_occasions']);

// Irreversibly erases an organisation's personal and operational data. Users are
// anonymised rather than deleted because retained invoices and the audit log point at them.
export async function eraseOrganization(env, orgId, fetcher = fetch) {
  const org = await env.DB.prepare('SELECT id, erased_at FROM orgs WHERE id=?').bind(orgId).first();
  if (!org) throw notFound();
  if (org.erased_at) return { erased: false, already: true };
  if (!privacyErasureEnabled(env)) throw new HttpError(503, 'privacy_erasure_disabled');
  const t=now();
  const request=await env.DB.prepare("SELECT id FROM data_deletion_requests WHERE org_id=? AND status='pending' AND scheduled_for IS NOT NULL AND scheduled_for<=? ORDER BY created_at LIMIT 1").bind(orgId,t).first();
  if(!request)throw conflict('deletion_not_due');
  const [assets,domain]=await Promise.all([
    env.DB.prepare('SELECT object_key FROM tenant_assets WHERE org_id=?').bind(orgId).all(),
    env.DB.prepare('SELECT cf_id FROM org_domains WHERE org_id=?').bind(orgId).first(),
  ]);
  const claim=randomToken(24);
  const guard="EXISTS(SELECT 1 FROM data_deletion_requests WHERE id=?2 AND org_id=?1 AND execution_token=?3 AND status='completed')";
  // The claim and all erasure statements are one transaction. A cancellation winning
  // before this batch makes every write a no-op; a failed write rolls back the claim.
  const statements=[env.DB.prepare("UPDATE data_deletion_requests SET status='completed',completed_at=?,updated_at=?,execution_token=? WHERE id=? AND status='pending' AND scheduled_for IS NOT NULL AND scheduled_for<=?").bind(t,t,claim,request.id,t)];
  for(const [table,where]of ERASED_TABLES)statements.push(env.DB.prepare(`DELETE FROM ${table} WHERE (${where}) AND ${guard}`).bind(orgId,request.id,claim));
  statements.push(
    env.DB.prepare(`DELETE FROM users WHERE org_id=?1 AND role='branch' AND ${guard}`).bind(orgId,request.id,claim),
    env.DB.prepare(`UPDATE users SET email='erased-'||id||'@erased.invalid',name='',password_hash=?4,disabled=1,mfa_secret=NULL,mfa_pending=NULL,email_verified=0 WHERE org_id=?1 AND ${guard}`).bind(orgId,request.id,claim,'erased:'+randomToken(24)),
    env.DB.prepare(`DELETE FROM branches WHERE org_id=?1 AND ${guard}`).bind(orgId,request.id,claim),
    env.DB.prepare(`UPDATE subscriptions SET status='cancelled',cancel_at_period_end=1,updated_at=?4 WHERE org_id=?1 AND ${guard}`).bind(orgId,request.id,claim,t),
    env.DB.prepare(`UPDATE orgs SET slug='erased-'||substr(id,1,8)||'-'||?4,name_ar='منشأة محذوفة',name_en='Erased business',logo_url=NULL,active=0,erased_at=?5 WHERE id=?1 AND ${guard}`).bind(orgId,request.id,claim,randomToken(6).toLowerCase(),t),
  );
  const result=await env.DB.batch(statements);
  if(!result[0].meta.changes)return{erased:false,cancelled:true};
  const leftovers=[],cleanup=[];
  for(const asset of assets.results||[]){
    if(asset.object_key?.startsWith('d1:'))continue;
    try{if(!env.MEDIA)throw new Error('storage_unavailable');await env.MEDIA.delete(asset.object_key);}catch{leftovers.push('media');cleanup.push({kind:'media',object_key:asset.object_key});}
  }
  if(domain?.cf_id){
    try{if(!domainsConfigured(env))throw new Error('domain_unavailable');await cf(env,'DELETE','/'+domain.cf_id,null,fetcher);}catch{leftovers.push('custom_hostname');cleanup.push({kind:'custom_hostname',id:domain.cf_id});}
  }
  // Retain failed-cleanup references for operator remediation, never lose the pointer.
  await audit(env,{org_id:orgId},'data.deletion.completed',{leftovers:[...new Set(leftovers)],cleanup});
  return{erased:true,leftovers:[...new Set(leftovers)],cleanup_pending:cleanup.length>0};
}

// Cron: complete due deletion requests and strip customer contact details after retention.
export async function privacyCron(env, fetcher) {
  if(!privacyErasureEnabled(env))return{erased:0,enabled:false};
  const t = now();
  const { results } = await env.DB.prepare("SELECT org_id FROM data_deletion_requests WHERE status='pending' AND scheduled_for<=? LIMIT 5").bind(t).all();
  let erased = 0;
  for (const r of results) {
    const res = await eraseOrganization(env, r.org_id, fetcher);
    if (res.erased) erased++;
  }
  const cutoff = t - piiRetentionMs(env);
  await env.DB.batch([
    env.DB.prepare("UPDATE waitlist SET name='', phone=NULL, note=NULL WHERE status NOT IN ('waiting','called') AND created_at<? AND (name<>'' OR phone IS NOT NULL OR note IS NOT NULL)").bind(cutoff),
    env.DB.prepare("UPDATE customer_orders SET details_json=json_remove(details_json,'$.name','$.phone','$.address','$.car'), note=NULL WHERE created_at<? AND details_json IS NOT NULL AND json_valid(details_json) AND (json_extract(details_json,'$.name') IS NOT NULL OR json_extract(details_json,'$.phone') IS NOT NULL OR json_extract(details_json,'$.address') IS NOT NULL OR json_extract(details_json,'$.car') IS NOT NULL OR note IS NOT NULL)").bind(cutoff),
    env.DB.prepare('UPDATE tickets SET rating_comment=NULL WHERE created_at<? AND rating_comment IS NOT NULL').bind(cutoff),
    env.DB.prepare('DELETE FROM email_tokens WHERE expires_at<?').bind(t - DAY),
    env.DB.prepare('DELETE FROM request_limits WHERE window_start<?').bind(t - 7 * DAY),
    env.DB.prepare('DELETE FROM login_attempts WHERE window_start<?').bind(t - 7 * DAY),
  ]);
  return { erased };
}

export function registerPrivacy(app) {
  const admin = requireRole('admin');
  app.get('/api/admin/deletion-requests', admin, async (c) => {
    const { results } = await c.env.DB.prepare(
      "SELECT r.id, r.org_id, o.name_ar, o.name_en, r.status, r.created_at, r.scheduled_for, r.completed_at FROM data_deletion_requests r JOIN orgs o ON o.id=r.org_id ORDER BY r.created_at DESC LIMIT 100",
    ).all();
    return c.json({ requests: results });
  });
  // Staff completion also requires explicit activation and the full cancellation period.
  app.post('/api/admin/deletion-requests/:id/complete', admin, async (c) => {
    if(!privacyErasureEnabled(c.env))throw new HttpError(503,'privacy_erasure_disabled');
    const r = await c.env.DB.prepare("SELECT org_id,scheduled_for FROM data_deletion_requests WHERE id=? AND status='pending'").bind(c.req.param('id')).first();
    if (!r) throw notFound();
    if(r.scheduled_for===null||r.scheduled_for>now())throw conflict('deletion_not_due');
    const result = await eraseOrganization(c.env, r.org_id);
    await audit(c.env, c.get('user'), 'data.deletion.admin_complete', { id: c.req.param('id') });
    return c.json(result);
  });
}
