import { test } from 'node:test';
import assert from 'node:assert/strict';
import { client, makeEnv, seedAdmin } from './helpers.js';
import { totp } from '../src/mfa.js';
import { hashPassword } from '../src/auth.js';

const signup = (n = 'demo-cafe') => ({ name_ar:'مقهى تجريبي',name_en:'Demo Cafe',slug:n,email:n+'@example.test',password:'test-password-123',sector:'cafe' });

test('self signup is transactional, signs in an owner and starts a real 14-day trial',async()=>{
 const env=makeEnv(),c=client(env),r=await c.post('/api/register',signup());
 assert.equal(r.status,201,JSON.stringify(r.json));
 assert.equal((await c.get('/api/me')).json.user.role,'owner');
 assert.equal(r.json.emailVerification.status,'needs_provider');
 assert.equal(r.json.subscription.status,'trial');
 assert.ok(r.json.subscription.trial_ends_at>Date.now()+13*86400000);
 const s=await c.get('/api/owner/subscription');
 assert.equal(s.json.subscription.plan,'pro');
 assert.equal(s.json.payment.status,'needs_provider');
 const branches=await c.get('/api/owner/branches');
 assert.equal(branches.json.branches.length,1);
 const b=branches.json.branches[0];
 assert.equal(b.account_email,null);
 const created=await c.patch('/api/owner/branches/'+b.id+'/account',{email:'cashier@example.test',password:'cashier-pass-123',name:'Cashier'});
 assert.equal(created.status,201);
 const cashier=client(env);
 assert.equal((await cashier.login('cashier@example.test','cashier-pass-123')).status,200);
 assert.equal((await cashier.get('/api/branch/tickets')).status,200);
 // Duplicate email cannot leave a half-created tenant behind.
 assert.equal((await client(env,'2.2.2.2').post('/api/register',{...signup('other'),email:'demo-cafe@example.test'})).status,409);
 assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM orgs').first()).n,1);
});

test('expired trials are read-only, cancellation is idempotent, and suspended tenants cannot use staff APIs',async()=>{
 const env=makeEnv(),c=client(env);await c.post('/api/register',signup());
 const u=(await c.get('/api/me')).json;
 await env.DB.prepare('UPDATE subscriptions SET trial_ends_at=? WHERE org_id=?').bind(Date.now()-1,u.org.id).run();
 assert.equal((await c.get('/api/owner/menu')).status,200);
 assert.equal((await c.post('/api/owner/categories',{name_ar:'قهوة',name_en:'Coffee'})).status,402);
 assert.equal((await c.post('/api/owner/subscription/cancel',{})).status,200);
 assert.equal((await c.post('/api/owner/subscription/cancel',{})).status,200);
 await env.DB.prepare('UPDATE orgs SET active=0 WHERE id=?').bind(u.org.id).run();
 assert.equal((await c.get('/api/owner/menu')).status,403);
});

test('plan limits apply on the server including atomic database constraints',async()=>{
 const env=makeEnv(),c=client(env);await c.post('/api/register',signup());
 const org=(await c.get('/api/me')).json.org;
 await env.DB.prepare("UPDATE subscriptions SET plan='basic' WHERE org_id=?").bind(org.id).run();
 const r=await c.post('/api/owner/branches',{name_ar:'آخر',name_en:'Other',account:{email:'other@example.test',name:'Other',password:'other-pass-123'}});
 assert.equal(r.status,409);assert.equal(r.json.error,'plan_branches_limit');
 await assert.rejects(()=>env.DB.prepare('INSERT INTO branches(id,org_id,slug,name_ar,name_en,created_at) VALUES(?,?,?,?,?,?)').bind('b2',org.id,'extra','آخر','Extra',Date.now()).run(),/plan_branches_limit/);
 await env.DB.prepare("UPDATE subscriptions SET plan='pager' WHERE org_id=?").bind(org.id).run();
 const cat=await c.post('/api/owner/categories',{name_ar:'قهوة',name_en:'Coffee'});
 const item=await c.post('/api/owner/items',{category_id:cat.json.id,name_ar:'قهوة',name_en:'Coffee',price:1200});
 assert.equal(item.status,409);assert.equal(item.json.error,'plan_items_limit');
});

test('origin checks reject sibling/cross-site JSON and request size is bounded',async()=>{
 const env=makeEnv(),c=client(env);
 assert.equal((await c.post('/api/register',signup(),{origin:'https://evil.example'})).status,403);
 assert.equal((await c.post('/api/register',signup(),{'sec-fetch-site':'cross-site'})).status,403);
 assert.equal((await c.post('/api/register',{...signup(),junk:'x'.repeat(4*1024*1024)})).status,413);
 const r=await c.get('/api/config');
 assert.match(r.headers.get('content-security-policy'),/script-src 'self'/);
 assert.match(r.headers.get('strict-transport-security'),/max-age/);
});

test('privileged MFA gate, encrypted enrollment, TOTP replay rejection and one-time recovery',async()=>{
 const env=makeEnv({REQUIRE_ADMIN_MFA:'true'}),root=await seedAdmin(env),c=client(env);
 assert.equal((await c.login(root.email,root.password)).status,200);
 assert.equal((await c.get('/api/admin/orgs')).json.error,'mfa_enrollment_required');
 const setup=await c.post('/api/me/mfa/setup',{password:root.password});
 assert.equal(setup.status,200);
 const secret=setup.json.secret;
 const db=await env.DB.prepare('SELECT mfa_pending FROM users WHERE email=?').bind(root.email).first();
 assert.ok(!db.mfa_pending.includes(secret));
 const enabled=await c.post('/api/me/mfa/enable',{code:await totp(secret)});
 assert.equal(enabled.status,200,JSON.stringify(enabled.json));
 assert.equal(enabled.json.recoveryCodes.length,8);
 assert.equal((await c.get('/api/admin/orgs')).status,200);
 const other=client(env,'2.2.2.2');
 assert.equal((await other.login(root.email,root.password)).json.error,'mfa_required');
 assert.equal((await other.post('/api/login',{email:root.email,password:root.password,code:await totp(secret)})).json.error,'invalid_mfa_code');
 const code=enabled.json.recoveryCodes[0];
 assert.equal((await other.post('/api/login',{email:root.email,password:root.password,recovery_code:code})).status,200);
 assert.equal((await other.get('/api/admin/orgs')).status,200);
 assert.equal((await client(env,'3.3.3.3').post('/api/login',{email:root.email,password:root.password,recovery_code:code})).status,401);
});
