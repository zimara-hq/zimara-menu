import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv,setupOrg,client } from './helpers.js';

test('cashier invoice stays separate from automatic pager number and legacy explicit numbers still work',async()=>{
 const env=makeEnv(),s=await setupOrg(env);
 const first=await s.cashier.post('/api/branch/tickets',{invoice_number:'فاتورة-9001',idem_key:'invoice-request-one'});
 assert.equal(first.status,201,JSON.stringify(first.json));
 assert.equal(first.json.number,'1');assert.equal(first.json.invoice_number,'فاتورة-9001');
 const second=await s.cashier.post('/api/branch/tickets',{invoice_number:'POS-99999',idem_key:'invoice-request-two'});
 assert.equal(second.json.number,'2');
 const legacy=await s.cashier.post('/api/branch/tickets',{number:'A-77'});
 assert.equal(legacy.json.number,'A-77');
 const tickets=(await s.cashier.get('/api/branch/tickets')).json.tickets;
 assert.equal(tickets.find(t=>t.id===first.json.id).invoice_number,'فاتورة-9001');
 // An invoice reference is internal staff data and not exposed on the bearer page.
 assert.equal('invoice_number' in (await client(env).get('/api/t/'+first.json.token)).json,false);
});

test('cashier ticket retry is atomic and payload-changing reuse is rejected',async()=>{
 const env=makeEnv(),s=await setupOrg(env),payload={invoice_number:'INV-1',idem_key:'retry-this-request'};
 const responses=await Promise.all([s.cashier.post('/api/branch/tickets',payload),s.cashier.post('/api/branch/tickets',payload)]);
 assert.ok(responses.every(r=>[200,201].includes(r.status)),JSON.stringify(responses.map(r=>r.json)));
 assert.equal(responses[0].json.token,responses[1].json.token);
 assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM tickets').first()).n,1);
 assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM cashier_ticket_requests').first()).n,1);
 assert.equal((await s.cashier.post('/api/branch/tickets',{...payload,invoice_number:'CHANGED'})).status,409);
 // Receipt is removed with the ticket; no orphan records block isolated demo cleanup.
 await env.DB.prepare('DELETE FROM tickets WHERE id=?').bind(responses[0].json.id).run();
 assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM cashier_ticket_requests').first()).n,0);
});

test('distinct simultaneous auto allocations remain unique and expired subscriptions block cashier mutation',async()=>{
 const env=makeEnv(),s=await setupOrg(env);
 const out=await Promise.all([s.cashier.post('/api/branch/tickets',{invoice_number:'A',idem_key:'concurrent-order-a'}),s.cashier.post('/api/branch/tickets',{invoice_number:'B',idem_key:'concurrent-order-b'})]);
 assert.ok(out.every(r=>r.status===201),JSON.stringify(out.map(r=>r.json)));
 assert.equal(new Set(out.map(r=>r.json.number)).size,2);
 const me=(await s.owner.get('/api/me')).json;
 await env.DB.prepare("INSERT INTO subscriptions(org_id,plan,status,trial_ends_at,current_period_end,created_at,updated_at) VALUES(?,'pro','trial',0,0,0,0)").bind(me.org.id).run();
 assert.equal((await s.cashier.get('/api/branch/tickets')).status,200);
 assert.equal((await s.cashier.post('/api/branch/tickets',{})).status,402);
 assert.equal((await s.cashier.post('/api/branch/tickets/'+out[0].json.id+'/ready',{version:1})).status,402);
});

test('suspended branch or tenant cannot use existing bearer tickets or staff sessions',async()=>{
 const env=makeEnv(),s=await setupOrg(env);
 const t=(await s.cashier.post('/api/branch/tickets',{})).json;
 await env.DB.prepare('UPDATE branches SET active=0 WHERE id=?').bind(s.branchId).run();
 assert.equal((await client(env).get('/api/t/'+t.token)).status,404);
 assert.equal((await s.cashier.get('/api/branch/tickets')).status,403);
 await env.DB.prepare('UPDATE branches SET active=1 WHERE id=?').bind(s.branchId).run();
 const org=(await s.owner.get('/api/me')).json.org;
 await env.DB.prepare('UPDATE orgs SET active=0 WHERE id=?').bind(org.id).run();
 assert.equal((await client(env).get('/api/t/'+t.token)).status,404);
 assert.equal((await s.cashier.get('/api/branch/tickets')).status,403);
});

test('push destinations cannot carry credentials, arbitrary ports or redirect requests',async()=>{
 const {validEndpoint,sendPush}=await import('../src/push.js');
 assert.equal(validEndpoint('https://fcm.googleapis.com/path'),true);
 for(const u of ['https://a:b@fcm.googleapis.com/path','https://fcm.googleapis.com:8443/path','https://fcm.googleapis.com/path#x','http://fcm.googleapis.com/path','https://localhost/path'])assert.equal(validEndpoint(u),false,u);
 let called=false;
 assert.equal(await sendPush({VAPID_PUBLIC_KEY:'x',VAPID_PRIVATE_KEY:'x',VAPID_SUBJECT:'mailto:a@example.test'},'https://localhost/x',async()=>{called=true;}),'error');
 assert.equal(called,false);
});

test('one ticket cannot create an unbounded push fanout and public card creation is limited',async()=>{
 const env=makeEnv(),s=await setupOrg(env),guest=client(env);
 const t=(await s.cashier.post('/api/branch/tickets',{})).json;
 for(let n=0;n<9;n++)assert.equal((await guest.post('/api/t/'+t.token+'/subscribe',{endpoint:'https://fcm.googleapis.com/push/'+n})).status,n<5?200:429);
 assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM push_subscriptions WHERE ticket_id=?').bind(t.id).first()).n,5);
 for(let n=0;n<20;n++)assert.equal((await guest.post('/api/cards',{org:s.orgSlug})).status,201);
 assert.equal((await guest.post('/api/cards',{org:s.orgSlug})).status,429);
});

test('production admins require MFA enrollment even if no opt-in flag was set',async()=>{
 const env=makeEnv({ENVIRONMENT:'production'});
 const {seedAdmin}=await import('./helpers.js');
 const admin=await seedAdmin(env),c=client(env);
 assert.equal((await c.login(admin.email,admin.password)).status,200);
 assert.equal((await c.get('/api/admin/orgs')).json.error,'mfa_enrollment_required');
 assert.equal((await c.get('/api/me/mfa')).json.required,true);
});

test('derived demo accounts cannot reserve real emails or extend room lifetime through ordinary login',async()=>{
 const env=makeEnv(),guest=client(env),r=await guest.post('/api/demo',{});
 assert.equal(r.status,201,JSON.stringify(r.json));
 const token=r.json.token;
 assert.equal((await guest.post('/api/demo/'+token+'/session',{role:'owner'})).status,200);
 const branch=(await guest.get('/api/owner/branches')).json.branches[0];
 const bad=await guest.post('/api/owner/branches',{name_ar:'فرع',name_en:'Extra',account:{name:'Cashier',email:'reserved@real.example',password:'demo-derived-pass'}});
 assert.equal(bad.status,400);assert.equal(bad.json.error,'demo_email_required');
 const made=await guest.post('/api/owner/branches',{name_ar:'فرع',name_en:'Extra',account:{name:'Cashier',email:'derived@demo.invalid',password:'demo-derived-pass'}});
 assert.equal(made.status,201,JSON.stringify(made.json));
 const derived=client(env,'2.2.2.2');
 assert.equal((await derived.login('derived@demo.invalid','demo-derived-pass')).status,200);
 const session=await env.DB.prepare("SELECT s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE u.email='derived@demo.invalid'").first();
 const room=await env.DB.prepare('SELECT * FROM demo_rooms').first();
 assert.ok(session.expires_at<=room.expires_at);
 await env.DB.prepare('UPDATE demo_rooms SET expires_at=? WHERE id=?').bind(Date.now()-1,room.id).run();
 // Rejected without relying on Cron having disabled the organization.
 assert.equal((await derived.get('/api/branch/tickets')).status,401);
 assert.equal((await guest.get('/api/owner/menu')).status,401);
 assert.equal((await derived.login('derived@demo.invalid','demo-derived-pass')).status,410);
});

test('public menu API does not reveal items inside a hidden category',async()=>{
 const env=makeEnv(),s=await setupOrg(env);
 const cat=(await s.owner.post('/api/owner/categories',{name_ar:'مسودة',name_en:'Draft'})).json;
 const item=await s.owner.post('/api/owner/items',{category_id:cat.id,name_ar:'صنف سري',name_en:'Unpublished item',price:9900});
 assert.equal(item.status,201);
 await s.owner.patch('/api/owner/categories/'+cat.id,{name_ar:'مسودة',name_en:'Draft',active:false});
 const publicMenu=(await client(env).get('/api/public/menu/'+s.branchSlug)).json;
 assert.equal(publicMenu.items.some(i=>i.id===item.json.id),false);
 assert.equal((await s.owner.get('/api/owner/menu')).json.items.some(i=>i.id===item.json.id),true);
});
