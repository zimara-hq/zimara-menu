import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, setupOrg, client } from './helpers.js';
import { operationsSnapshot, acceptOrder } from '../src/orders.js';
import { waitlistCron } from '../src/waitlist.js';

async function restaurant() {
  const env = makeEnv(), s = await setupOrg(env);
  const orgId = (await s.owner.get('/api/me')).json.org.id;
  const category = (await s.owner.post('/api/owner/categories', {name_ar:'طعام',name_en:'Food'})).json.id;
  const item = (await s.owner.post('/api/owner/items',{category_id:category,name_ar:'طبق',name_en:'Plate',price:2500})).json.id;
  await s.owner.patch(`/api/owner/branches/${s.branchId}/settings`, {orders_enabled:true});
  await s.owner.patch(`/api/owner/branches/${s.branchId}/ordering`, {types:['dine_in'],tables:10});
  const order = async (table = 4) => (await client(env).post('/api/public/orders/'+s.branchSlug,{idem_key:crypto.randomUUID(),order_type:'dine_in',table,items:[{item_id:item,quantity:2}]})).json.order;
  return { env,s,orgId,order };
}

test('kitchen and table demand follow actual pager lifecycle and never mix branches', async () => {
  const {env,s,orgId,order} = await restaurant();
  const q = await order();
  const args={orgId,branchId:s.branchId};
  let d=await operationsSnapshot(env,args);
  assert.equal(d.tables[0].orders[0].status,'pending'); assert.equal(d.tickets.length,0);
  const accepted=await s.cashier.post(`/api/branch/orders/${q.id}/accept`,{version:1});
  assert.equal(accepted.status,201,JSON.stringify(accepted.json));
  d=await operationsSnapshot(env,args);
  assert.equal(d.tables[0].table,'4'); assert.equal(d.tables[0].orders[0].status,'preparing');
  assert.equal(d.tickets[0].items[0].name_en,'Plate'); assert.equal(d.tickets[0].items[0].quantity,2);
  const ticket=d.tickets[0];
  assert.equal((await s.cashier.post(`/api/branch/tickets/${ticket.id}/ready`,{version:ticket.version})).status,200);
  d=await operationsSnapshot(env,args); assert.equal(d.tables[0].orders[0].status,'ready');
  assert.equal((await s.cashier.post(`/api/branch/tickets/${ticket.id}/ready`,{version:ticket.version})).status,409);
  await s.cashier.post(`/api/branch/tickets/${ticket.id}/collect`,{version:d.tickets[0].version});
  d=await operationsSnapshot(env,args); assert.equal(d.tickets.length,0); assert.equal(d.tables.length,0);
  await env.DB.prepare("INSERT INTO branches(id,org_id,slug,name_ar,name_en,created_at) VALUES('second',?,'second','ثاني','Second',?)").bind(orgId,Date.now()).run();
  const other=await operationsSnapshot(env,{orgId,branchId:'second'}); assert.deepEqual(other.tickets,[]);
  await assert.rejects(operationsSnapshot(env,{orgId:'foreign',branchId:s.branchId}), e=>e.status===404);
});

test('accepted order tenant and pager allocation respect still-active old tickets',async()=>{
  const {env,s,orgId,order}=await restaurant();
  const q=await order();
  await assert.rejects(acceptOrder(env,{orgId:'foreign',branchId:s.branchId,orderId:q.id}),e=>e.status===404);
  const old=(await s.cashier.post('/api/branch/tickets',{number:'1'})).json;
  await env.DB.prepare('UPDATE tickets SET created_at=? WHERE id=?').bind(Date.now()-13*3600_000,old.id).run();
  const r=await acceptOrder(env,{orgId,branchId:s.branchId,orderId:q.id});
  assert.equal(r.ticket.number,'2');
  const d=await operationsSnapshot(env,{orgId,branchId:s.branchId}); assert.equal(d.tickets.length,2);
});

test('overlapping waitlist cron runs claim a repeat once and skip expired or suspended entries',async()=>{
  const env=makeEnv(),s=await setupOrg(env);
  const added=(await s.cashier.post('/api/branch/waitlist',{name:'Guest',party:2})).json;
  await s.cashier.post(`/api/branch/waitlist/${added.id}/call`,{version:1});
  await env.DB.prepare('UPDATE waitlist SET last_alert_at=? WHERE id=?').bind(Date.now()-120_000,added.id).run();
  const results=await Promise.all([waitlistCron(env),waitlistCron(env)]);
  assert.equal(results.reduce((n,r)=>n+r.recalled,0),1);
  assert.equal((await env.DB.prepare('SELECT alerts_sent FROM waitlist WHERE id=?').bind(added.id).first()).alerts_sent,2);
  await env.DB.prepare('UPDATE waitlist SET last_alert_at=?,created_at=? WHERE id=?').bind(Date.now()-120_000,Date.now()-13*3600_000,added.id).run();
  assert.equal((await waitlistCron(env)).recalled,0);
  assert.equal((await env.DB.prepare('SELECT status FROM waitlist WHERE id=?').bind(added.id).first()).status,'cancelled');
  await env.DB.prepare('UPDATE branches SET active=0 WHERE id=?').bind(s.branchId).run();
  assert.equal((await client(env).get('/api/w/'+added.token)).status,404);
});


test('operations API enforces pager access while table view returns only order demand',async()=>{
  const {env,s,orgId}=await restaurant();
  await s.cashier.post('/api/branch/tickets',{invoice_number:'internal'});
  await env.DB.prepare('INSERT INTO branch_permissions(branch_id,permissions_json,updated_at) VALUES(?,?,?)').bind(s.branchId,JSON.stringify({tickets_view:false}),Date.now()).run();
  assert.equal((await s.cashier.get('/api/branch/orders/operations')).status,403);
  const tables=await s.cashier.get('/api/branch/orders/operations?view=tables');
  assert.equal(tables.status,200); assert.equal('tickets' in tables.json,false);
  await env.DB.prepare('UPDATE branch_permissions SET permissions_json=? WHERE branch_id=?').bind(JSON.stringify({orders_view:false}),s.branchId).run();
  assert.equal((await s.cashier.get('/api/branch/orders/operations?view=tables')).status,403);
});

test('coupon receipt retries survive exhaustion and menu changes; concurrent final uses are atomic',async()=>{
  const {env,s,order}=await restaurant();
  await s.owner.post('/api/owner/coupons',{code:'LASTONE',kind:'percent',value:20,max_uses:1});
  const first=await order();
  const item=first.items[0].id;
  const payload={idem_key:crypto.randomUUID(),order_type:'dine_in',table:2,coupon:'lastone',items:[{item_id:item,quantity:1}]};
  const guest=client(env,'6.7.8.9');
  const used=await guest.post('/api/public/orders/'+s.branchSlug,payload);
  assert.equal(used.status,201,JSON.stringify(used.json));
  await env.DB.prepare('UPDATE items SET active=0 WHERE id=?').bind(item).run();
  await s.owner.patch(`/api/owner/branches/${s.branchId}/settings`, {orders_enabled:false});
  const retry=await guest.post('/api/public/orders/'+s.branchSlug,payload);
  assert.equal(retry.status,200,JSON.stringify(retry.json));assert.equal(retry.json.order.id,used.json.order.id);
  assert.equal((await guest.post('/api/public/orders/'+s.branchSlug,{...payload,table:3})).status,409);
  await env.DB.prepare('UPDATE items SET active=1 WHERE id=?').bind(item).run();
  await s.owner.patch(`/api/owner/branches/${s.branchId}/settings`, {orders_enabled:true});
  await s.owner.post('/api/owner/coupons',{code:'RACEONE',kind:'amount',value:100,max_uses:1});
  const results=await Promise.all([1,2].map(()=>guest.post('/api/public/orders/'+s.branchSlug,{...payload,idem_key:crypto.randomUUID(),coupon:'RACEONE'})));
  assert.deepEqual(results.map(r=>r.status).sort(),[201,400]);
  assert.equal((await env.DB.prepare("SELECT used FROM coupons WHERE code='RACEONE'").first()).used,1);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM customer_orders WHERE coupon_code='RACEONE'").first()).n,1);
});

test('concurrent loyalty campaigns respect the daily cap and paused tenants reject subscriptions',async()=>{
  const env=makeEnv(),s=await setupOrg(env),guest=client(env);
  const card=(await guest.post('/api/cards',{org:s.orgSlug})).json;
  const send=()=>s.owner.post('/api/owner/loyalty/messages',{segment:'all',title_ar:'أهلاً',body_ar:'ننتظر زيارتك'});
  const responses=await Promise.all([send(),send(),send()]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[201,201,409]);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM loyalty_messages').first()).n,2);
  const orgId=(await s.owner.get('/api/me')).json.org.id;
  await env.DB.prepare('UPDATE orgs SET active=0 WHERE id=?').bind(orgId).run();
  assert.equal((await guest.post(`/api/cards/${card.token}/subscribe`,{endpoint:'https://fcm.googleapis.com/push/test'})).status,404);
});
