import test from 'node:test';
import assert from 'node:assert/strict';
import {makeEnv, client, setupOrg} from './helpers.js';

const signup = slug => ({name_ar:'مقهى',name_en:'Cafe',slug,name:'Owner',email:slug+'@example.test',password:'owner-pass-123',plan:'basic',sector:'cafe',accept_terms:true});
const profile = {billing_legal_name:'Cafe',billing_address:'Hail'};
const category = {name_ar:'قهوة',name_en:'Coffee'};
function providers() {
  const invoices = new Map();
  return {invoices, env:{MOYASAR_SECRET_KEY:'sk_test_fake',MOYASAR_WEBHOOK_SECRET:'fake-secret',PUBLIC_BASE_URL:'https://menu.test',SIMPLE_FATOORA_API_KEY:'sf_sandbox_fake',SIMPLE_FATOORA_ENABLED:'true',SIMPLE_FATOORA_SELLER_PROFILE_APPROVED:'true',SIMPLE_FATOORA_ENV:'sandbox',HTTP_FETCH:async (url, init={}) => {
    const u = new URL(url);
    if(u.host==='api.simplefatoora.com') return Response.json({status:true,response:{sandbox_api_key:'sf_sandbox_fake'}});
    assert.equal(u.host,'api.moyasar.com');
    if(init.method==='POST') {const b=JSON.parse(init.body),id='inv_'+invoices.size; const inv={id,status:'initiated',amount:b.amount,currency:b.currency,url:'https://checkout.moyasar.com/'+id};invoices.set(id,inv);return Response.json(inv,{status:201});}
    return Response.json(invoices.get(u.pathname.split('/').at(-1)));
  }}};
}
for (const state of ['expired_trial','suspended','cancelled','expired_active']) test('owner can recover '+state+' with verified payment while menu stays read only', async () => {
  const p=providers(), env=makeEnv(p.env), owner=client(env);
  assert.equal((await owner.post('/api/register',signup('recovery-cafe'))).status,201);
  const org=(await env.DB.prepare('SELECT id FROM orgs').first()).id;
  await env.DB.prepare('UPDATE subscriptions SET status=?,trial_ends_at=?,current_period_end=?,cancel_at_period_end=? WHERE org_id=?').bind(state==='expired_trial'?'trial':state==='expired_active'?'active':state,Date.now()-1000,Date.now()-9*86400000,state==='cancelled'?1:0,org).run();
  assert.equal((await owner.post('/api/owner/categories',category)).status,402);
  assert.equal((await owner.put('/api/owner/billing-profile',profile)).status,200);
  const co=await owner.post('/api/owner/billing/checkout',{plan:'basic',cycle:'monthly'});
  assert.equal(co.status,201,JSON.stringify(co.json));
  const pending=await owner.post('/api/owner/billing/sync',{checkout_id:co.json.checkout_id});
  assert.equal(pending.status,200);assert.equal(pending.json.status,'pending');
  assert.equal((await owner.post('/api/owner/categories',category)).status,402);
  const stranger=client(env,'2.2.2.2');await stranger.post('/api/register',signup('stranger-cafe'));
  assert.equal((await stranger.post('/api/owner/billing/sync',{checkout_id:co.json.checkout_id})).status,404);
  const inv=[...p.invoices.values()][0];inv.status='paid';
  const paid=await owner.post('/api/owner/billing/sync',{checkout_id:co.json.checkout_id});
  assert.equal(paid.status,200);assert.equal(paid.json.subscription.status,'active');
  assert.equal((await owner.post('/api/owner/categories',category)).status,201);
});

test('recovery preserves configuration, auth, role and organization checks',async()=>{
  const env=makeEnv(), {owner,cashier}=await setupOrg(env);
  const org=(await env.DB.prepare('SELECT id FROM orgs').first()).id;
  await env.DB.prepare("INSERT INTO subscriptions (org_id,plan,status,created_at,updated_at) VALUES (?,'basic','suspended',0,0)").bind(org).run();
  assert.equal((await owner.post('/api/owner/billing/checkout',{plan:'basic',cycle:'monthly'})).status,503);
  assert.equal((await owner.post('/api/owner/billing/sync',{checkout_id:'fake'})).status,503);
  assert.equal((await client(env).post('/api/owner/billing/checkout')).status,401);
  assert.equal((await cashier.post('/api/owner/billing/checkout')).status,403);
  assert.equal((await owner.patch('/api/owner/categories/fake',category)).status,402);
  await env.DB.prepare('UPDATE orgs SET active=0 WHERE id=?').bind(org).run();
  for(const path of ['/api/owner/billing/checkout','/api/owner/billing/sync']) assert.equal((await owner.post(path)).json.error,'organization_suspended');
  assert.equal((await owner.put('/api/owner/billing-profile',profile)).json.error,'organization_suspended');
});

test('creating a hidden item persists visibility and excludes it from the public menu',async()=>{
  const env=makeEnv(),{owner,branchSlug}=await setupOrg(env);
  const cat=await owner.post('/api/owner/categories',category);
  const data={category_id:cat.json.id,name_ar:'لاتيه',name_en:'Latte',price:1600};
  const hidden=await owner.post('/api/owner/items',{...data,active:false});assert.equal(hidden.status,201);
  const visible=await owner.post('/api/owner/items',data);assert.equal(visible.status,201);
  const own=(await owner.get('/api/owner/menu')).json.items;
  assert.equal(Boolean(own.find(i=>i.id===hidden.json.id).active),false);
  assert.equal(Boolean(own.find(i=>i.id===visible.json.id).active),true);
  const pub=(await client(env).get('/api/public/menu/'+branchSlug)).json.items;
  assert.equal(pub.some(i=>i.id===hidden.json.id),false);assert.equal(pub.some(i=>i.id===visible.json.id),true);
});

test('legacy org appearance writes reject changed color once a studio revision owns appearance',async()=>{
  const env=makeEnv(),{owner}=await setupOrg(env);
  const org=await env.DB.prepare('SELECT id,brand_color FROM orgs').first();
  const fields={name_ar:'مقهى',name_en:'Updated Cafe',brand_color:'#112233',logo_url:null};
  assert.equal((await owner.patch('/api/owner/org',fields)).status,200,'legacy color works before studio takes ownership');
  await env.DB.prepare('INSERT INTO org_designs(org_id,draft_json,updated_at,revision) VALUES (?,\'{}\',0,1)').bind(org.id).run();
  const rejected=await owner.patch('/api/owner/org',{...fields,brand_color:'#334455'});
  assert.equal(rejected.status,409);assert.equal(rejected.json.error,'design_owned_appearance');
  assert.equal((await owner.patch('/api/owner/org',{...fields,logo_url:'https://example.test/logo.png'})).status,200,'same-color name/logo updates remain available');
  const namesOnly = await owner.patch('/api/owner/org', {name_ar:'مقهى جديد',name_en:'New Cafe',logo_url:'https://example.test/new-logo.png'});
  assert.equal(namesOnly.status,200,'omitting color preserves the Studio-owned color while updating name/logo');
  assert.equal((await env.DB.prepare('SELECT brand_color FROM orgs WHERE id=?').bind(org.id).first()).brand_color,'#112233');
  const updated = await env.DB.prepare('SELECT name_en,logo_url FROM orgs WHERE id=?').bind(org.id).first();
  assert.equal(updated.name_en,'New Cafe');
  assert.equal(updated.logo_url,'https://example.test/new-logo.png');
});
