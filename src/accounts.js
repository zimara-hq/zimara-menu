import { createSession, sessionCookie, hashPassword, verifyPassword } from './auth.js';
import { body, requireRole, audit, newUser, isSecure, rateLimit, PLANS, subscriptionFor, adminMfaRequired } from './context.js';
import { bad, HttpError, conflict, id, now, randomToken, hmac, slugify, str } from './util.js';
import { newMfaSecret, sealSecret, openSecret, verifyTotp } from './mfa.js';
import { sendVerification } from './mail.js';
import { billingConfigured } from './billing.js';
import { simpleFatooraConfigured } from './providers/simple-fatoora.js';

export function registerAccounts(app) {
  app.post('/api/register', async (c) => {
    await rateLimit(c, 'signup', { limit: 5, window: 3600000 });
    if (c.env.SIGNUP_ENABLED === 'false') throw new HttpError(503, 'signup_unavailable');
    const b = await body(c);
    const nameAr = str(b.name_ar, 'name_ar', { max: 80 });
    const nameEn = str(b.name_en || nameAr, 'name_en', { max: 80 });
    const sector = b.sector || 'cafe';
    const requestedPlan = b.plan || 'basic';
    if (!Object.hasOwn(PLANS, requestedPlan)) throw bad('invalid_plan');
    if (!['restaurant','cafe','clinic','bank','service'].includes(sector)) throw bad('invalid_sector');
    const slug = slugify(b.slug || nameEn);
    if (!/^[a-z][a-z0-9-]{2,39}$/.test(slug) || ['api','app','login','signup','demo','admin','assets','legal','m','t','c','j','display'].includes(slug)) throw bad('invalid_slug');
    const user = await newUser(c, { ...b, name: b.name || nameAr }, 'owner');
    const orgId = id(), branchId = id(), t = now(), trialEnd = t + 14 * 86400000;
    const branchSlug = slug + '-main';
    try {
      await c.env.DB.batch([
        c.env.DB.prepare('INSERT INTO orgs (id,slug,name_ar,name_en,brand_color,created_at) VALUES (?,?,?,?,?,?)').bind(orgId,slug,nameAr,nameEn,'#23003f',t),
        c.env.DB.prepare("INSERT INTO users (id,email,name,role,org_id,password_hash,created_at) VALUES (?,?,?,'owner',?,?,?)").bind(user.id,user.email,user.name,orgId,user.password_hash,t),
        c.env.DB.prepare('INSERT INTO branches (id,org_id,slug,name_ar,name_en,created_at) VALUES (?,?,?,?,?,?)').bind(branchId,orgId,branchSlug,b.branch_name ? str(b.branch_name,'branch_name',{max:80}) : 'الفرع الرئيسي','Main branch',t),
        c.env.DB.prepare('INSERT INTO loyalty_programs (org_id) VALUES (?)').bind(orgId),
        c.env.DB.prepare('INSERT INTO org_profiles (org_id,sector,updated_at) VALUES (?,?,?)').bind(orgId,sector,t),
        c.env.DB.prepare("INSERT INTO subscriptions (org_id,plan,status,trial_ends_at,current_period_end,created_at,updated_at) VALUES (?,'pro','trial',?,?,?,?)").bind(orgId,trialEnd,trialEnd,t,t),
      ]);
    } catch (e) {
      if (/UNIQUE|constraint/i.test(String(e.message))) throw conflict('slug_or_email_taken');
      throw e;
    }
    // Verification is "sent" only when the email provider accepted the message.
    let emailStatus='needs_provider';
    try { emailStatus=await sendVerification(c.env,{id:user.id,email:user.email,name:user.name}); } catch { emailStatus='send_failed'; }
    await audit(c.env,{id:user.id,org_id:orgId},'org.signup',{slug,sector,requested_plan:requestedPlan});
    const token = await createSession(c.env,user.id);
    c.header('Set-Cookie',sessionCookie(token,isSecure(c)));
    return c.json({ok:true,org:{id:orgId,slug},branch:{id:branchId,slug:branchSlug},user:{role:'owner'},subscription:{plan:'pro',status:'trial',trial_ends_at:trialEnd,requested_plan:requestedPlan},emailVerification:{status:emailStatus}},201);
  });

  app.get('/api/owner/subscription', requireRole('owner'), async (c) => {
    const subscription = await subscriptionFor(c.env,c.get('user').org_id);
    return c.json({subscription,plans:Object.values(PLANS),pricesStatus:'proposed',currency:'SAR',pricesIncludeVat:false,payment:{status:billingConfigured(c.env)&&simpleFatooraConfigured(c.env)?'available':'needs_provider'}});
  });
  app.post('/api/owner/subscription/cancel', requireRole('owner'), async (c) => {
    const u=c.get('user'),t=now(),s=await subscriptionFor(c.env,u.org_id);
    if (!s) throw bad('subscription_not_managed');
    await c.env.DB.prepare('UPDATE subscriptions SET cancel_at_period_end = 1, updated_at = ? WHERE org_id = ?').bind(t,u.org_id).run();
    await audit(c.env,u,'subscription.cancel_requested',{effective_at:s.current_period_end || s.trial_ends_at});
    return c.json({ok:true,subscription:await subscriptionFor(c.env,u.org_id)});
  });
  app.get('/api/admin/subscriptions',requireRole('admin'),async c=>{
    const {results}=await c.env.DB.prepare('SELECT s.*,o.name_ar,o.name_en,o.slug FROM subscriptions s JOIN orgs o ON o.id=s.org_id ORDER BY s.created_at DESC LIMIT 200').all();
    return c.json({subscriptions:results,pricesStatus:'proposed'});
  });
  app.get('/api/admin/audit',requireRole('admin'),async c=>{
    const {results}=await c.env.DB.prepare('SELECT id,user_id,org_id,action,detail,created_at FROM audit_log ORDER BY created_at DESC LIMIT 200').all();
    return c.json({events:results});
  });

  app.get('/api/me/mfa',requireRole('admin','owner','branch'),async c=>{
    const u=c.get('user');
    return c.json({enabled:!!u.mfa_enabled,verified:!!u.mfa_verified,required:u.role==='admin' && adminMfaRequired(c.env)});
  });
  app.post('/api/me/mfa/setup',requireRole('admin','owner','branch'),async c=>{
    const u=c.get('user'),b=await body(c);
    await rateLimit(c,'mfa-setup',{limit:8});
    const row=await c.env.DB.prepare('SELECT password_hash,mfa_secret FROM users WHERE id=?').bind(u.id).first();
    if (!await verifyPassword(String(b.password || ''),row.password_hash)) throw new HttpError(401,'invalid_credentials');
    if (row.mfa_secret) throw conflict('mfa_already_enabled');
    const secret=newMfaSecret();
    await c.env.DB.prepare('UPDATE users SET mfa_pending=? WHERE id=?').bind(await sealSecret(c.env,secret),u.id).run();
    return c.json({secret,uri:'otpauth://totp/'+encodeURIComponent('ZIMARA Menu:'+u.email)+'?secret='+secret+'&issuer=ZIMARA%20Menu&algorithm=SHA1&digits=6&period=30'});
  });
  app.post('/api/me/mfa/enable',requireRole('admin','owner','branch'),async c=>{
    const u=c.get('user'),b=await body(c);
    await rateLimit(c,'mfa-enable',{limit:8});
    const row=await c.env.DB.prepare('SELECT mfa_pending,mfa_secret FROM users WHERE id=?').bind(u.id).first();
    if (row.mfa_secret || !row.mfa_pending) throw bad('mfa_setup_required');
    const counter=await verifyTotp(await openSecret(c.env,row.mfa_pending),String(b.code || ''));
    if (counter===null) throw bad('invalid_mfa_code');
    const recoveryCodes=Array.from({length:8},()=>randomToken(10).replace(/[-_]/g,'X').toUpperCase());
    const stmt=[c.env.DB.prepare('UPDATE users SET mfa_secret=mfa_pending,mfa_pending=NULL,mfa_last_counter=? WHERE id=? AND mfa_secret IS NULL').bind(counter,u.id),
      c.env.DB.prepare('DELETE FROM sessions WHERE user_id=? AND id != ?').bind(u.id,u.sid),
      c.env.DB.prepare('UPDATE sessions SET mfa_verified=1 WHERE id=?').bind(u.sid)];
    for(const code of recoveryCodes)stmt.push(c.env.DB.prepare('INSERT INTO mfa_recovery_codes (user_id,code_hash) VALUES (?,?)').bind(u.id,await hmac(c.env.AUTH_SECRET,'mfa-recovery:'+u.id+':'+code)));
    await c.env.DB.batch(stmt);
    await audit(c.env,u,'mfa.enabled');
    return c.json({ok:true,recoveryCodes});
  });
}

export async function expireSubscriptions(env) {
  const t=now();
  await env.DB.batch([
    env.DB.prepare("UPDATE subscriptions SET status='suspended',updated_at=? WHERE status='trial' AND trial_ends_at<=?").bind(t,t),
    env.DB.prepare("UPDATE subscriptions SET status='cancelled',updated_at=? WHERE cancel_at_period_end=1 AND current_period_end<=? AND status!='cancelled'").bind(t,t),
    env.DB.prepare("UPDATE subscriptions SET status='past_due',updated_at=? WHERE status='active' AND current_period_end<=? AND cancel_at_period_end=0").bind(t,t),
    env.DB.prepare("UPDATE subscriptions SET status='suspended',updated_at=? WHERE status='past_due' AND current_period_end<=?").bind(t,t-7*86400000),
    env.DB.prepare('DELETE FROM request_limits WHERE window_start<?').bind(t-86400000),
  ]);
}
