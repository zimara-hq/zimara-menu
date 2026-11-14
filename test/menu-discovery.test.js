import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, setupOrg, client } from './helpers.js';

async function fixture() {
  const env = makeEnv(), s = await setupOrg(env), guest = client(env);
  const category = (await s.owner.post('/api/owner/categories', {name_ar:'قهوة',name_en:'Coffee'})).json.id;
  const create = async (extra={}) => s.owner.post('/api/owner/items', {category_id:category,name_ar:'لاتيه',name_en:'Latte',price:1600,...extra});
  return {env,s,guest,category,create,menu:async()=> (await guest.get('/api/public/menu/'+s.branchSlug)).json};
}

test('discovery preserves unknown nutrition, validates media and explicitly stores dietary/complements',async()=>{
 const f=await fixture(), other=(await f.create()).json.id;
 const gallery=[{url:'https://images.example/latte.webp',variants:[{url:'/menu-art/latte-320.webp',width:320}]}];
 const r=await f.create({gallery,dietary:['gluten_free'],complementary_ids:[other]});
 assert.equal(r.status,201);
 let item=(await f.menu()).items.find(x=>x.id===r.json.id);
 assert.deepEqual(item.gallery,gallery); assert.deepEqual(item.dietary,['gluten_free']); assert.equal(item.calories,null);
 assert.deepEqual(item.complementary_ids,[other]); assert.equal(item.orders_today,0);
 assert.equal((await f.s.owner.patch('/api/owner/items/'+r.json.id,{name_en:'Updated'})).status,200);
 item=(await f.menu()).items.find(x=>x.id===r.json.id); assert.deepEqual(item.gallery,gallery); assert.equal(item.name_en,'Updated');
 for(const extra of [{gallery:[{url:'javascript:alert(1)',variants:[]}]},{gallery:[{url:'/ok',variants:[{url:'/ok',width:500}]}]},{dietary:['healthy']},{complementary_ids:['foreign']}]) assert.equal((await f.create(extra)).status,400,JSON.stringify(extra));
});

test('recommendations use merchant fallback then three accepted co-occurrences; counts exclude pending and cancelled',async()=>{
 const f=await fixture(), b=(await f.create()).json.id,a=(await f.create({complementary_ids:[b]})).json.id;
 const path='/api/public/menu/'+f.s.branchSlug+'/recommendations/'+a;
 assert.deepEqual((await f.guest.get(path)).json.source,'merchant');
 await f.s.owner.patch('/api/owner/branches/'+f.s.branchId+'/settings',{orders_enabled:true});
 for(let n=0;n<5;n++){
  const r=await f.guest.post('/api/public/orders/'+f.s.branchSlug,{idem_key:crypto.randomUUID(),items:[{item_id:a,quantity:1},{item_id:b,quantity:2}]});
  assert.equal(r.status,201,JSON.stringify(r.json));
  if (n < 4) {
   const accepted=await f.s.cashier.post('/api/branch/orders/'+r.json.order.id+'/accept',{version:1});
   assert.equal(accepted.status,201,JSON.stringify(accepted.json));
   if(n===3) await f.env.DB.prepare("UPDATE tickets SET status='cancelled' WHERE id=(SELECT ticket_id FROM customer_orders WHERE id=?)").bind(r.json.order.id).run();
  }
  if(n===1) assert.equal((await f.guest.get(path)).json.source,'merchant');
 }
 const rec=(await f.guest.get(path)).json; assert.equal(rec.source,'orders');assert.equal(rec.sample_size,3);assert.equal(rec.items[0].id,b);
 const menu=await f.menu(); assert.equal(menu.discovery.order_count_today,3);assert.equal(menu.items.find(x=>x.id===b).orders_today,3);
 assert.equal((await f.guest.get('/api/public/menu/'+f.s.branchSlug+'/recommendations/foreign')).status,404);
});

test('branch category schedules reject fresh checkout while replay returns original receipt',async()=>{
 const f=await fixture(), item=(await f.create()).json.id;
 await f.s.owner.patch('/api/owner/branches/'+f.s.branchId+'/settings',{orders_enabled:true});
 const payload={idem_key:crypto.randomUUID(),items:[{item_id:item,quantity:1}]};
 const first=await f.guest.post('/api/public/orders/'+f.s.branchSlug,payload); assert.equal(first.status,201);
 const path='/api/owner/branches/'+f.s.branchId+'/menu-schedules';
 assert.equal((await f.s.owner.put(path+'/'+f.category,{schedule:{days:[],start:'00:00',end:'01:00'}})).status,200);
 const menu=await f.menu();assert.equal(menu.categories.find(x=>x.id===f.category).scheduled_available,false);assert.equal(menu.items.find(x=>x.id===item).available,0);
 assert.equal((await f.guest.post('/api/public/orders/'+f.s.branchSlug,{...payload,idem_key:crypto.randomUUID()})).json.error,'item_unavailable');
 const replay=await f.guest.post('/api/public/orders/'+f.s.branchSlug,payload); assert.equal(replay.status,200);assert.equal(replay.json.order.id,first.json.order.id);
 assert.equal((await f.s.owner.put(path+'/foreign',{schedule:null})).status,404);
 assert.equal((await f.s.owner.put(path+'/'+f.category,{schedule:{days:[7],start:'25:00',end:'12:00'}})).status,400);
 assert.equal((await f.s.owner.get(path)).json.schedules.length,1);
});

test('Riyadh overnight schedules belong to starting weekday and end is exclusive',async()=>{
 const {scheduleAvailable}=await import('../src/menu-discovery.js').catch(()=>({}));
 assert.equal(typeof scheduleAvailable,'function');
 const schedule={days:[4],start:'22:00',end:'02:00'};
 assert.equal(scheduleAvailable(schedule,Date.parse('2026-11-05T19:00:00Z')),true);
 assert.equal(scheduleAvailable(schedule,Date.parse('2026-11-05T22:59:00Z')),true);
 assert.equal(scheduleAvailable(schedule,Date.parse('2026-11-05T23:00:00Z')),false);
 assert.equal(scheduleAvailable(schedule,Date.parse('2026-11-04T23:00:00Z')),false);
});

test('partial merchandising edits preserve inactive items and existing sample artwork',async()=>{
 const f=await fixture(), item=(await f.create({active:false})).json.id;
 await f.env.DB.prepare("UPDATE items SET image_url='/menu-art/coffee-640.webp' WHERE id=?").bind(item).run();
 const r=await f.s.owner.patch('/api/owner/items/'+item,{dietary:['vegan']}); assert.equal(r.status,200,JSON.stringify(r.json));
 const stored=(await f.s.owner.get('/api/owner/menu')).json.items.find(i=>i.id===item);
 assert.equal(stored.active,0);assert.equal(stored.image_url,'/menu-art/coffee-640.webp');
});

test('foreign tenant complements, branches and categories cannot escape owner or public scope',async()=>{
 const f=await fixture();
 await f.env.DB.prepare("INSERT INTO orgs(id,slug,name_ar,name_en,brand_color,created_at) VALUES('foreign-org','foreign','آخر','Other','#23003f',0)").run();
 await f.env.DB.prepare("INSERT INTO categories(id,org_id,name_ar,name_en,sort) VALUES('foreign-cat','foreign-org','آخر','Other',0)").run();
 await f.env.DB.prepare("INSERT INTO items(id,org_id,category_id,name_ar,name_en,price) VALUES('foreign-item','foreign-org','foreign-cat','آخر','Other',100)").run();
 assert.equal((await f.create({complementary_ids:['foreign-item']})).status,400);
 assert.equal((await f.s.owner.put('/api/owner/branches/'+f.s.branchId+'/menu-schedules/foreign-cat',{schedule:null})).status,404);
 assert.equal((await f.s.owner.get('/api/owner/branches/foreign/menu-schedules')).status,404);
 assert.equal((await f.guest.get('/api/public/menu/'+f.s.branchSlug+'/recommendations/foreign-item')).status,404);
 const item=(await f.create()).json.id;
 const rec=(await f.guest.get('/api/public/menu/'+f.s.branchSlug+'/recommendations/'+item)).json;
 assert.deepEqual(rec,{source:'none',sample_size:0,items:[]});
});

test('deleting a complement prunes references and keeps unrelated item edits valid',async()=>{
 const f=await fixture(), b=(await f.create()).json.id, c=(await f.create()).json.id;
 const a=(await f.create({complementary_ids:[b,c]})).json.id;
 assert.equal((await f.s.owner.del('/api/owner/items/'+b)).json.deleted,true);
 const edit=await f.s.owner.patch('/api/owner/items/'+a,{name_en:'Updated'});
 assert.equal(edit.status,200,JSON.stringify(edit.json));
 const item=(await f.s.owner.get('/api/owner/menu')).json.items.find(i=>i.id===a);
 assert.deepEqual(item.complementary_ids,[c]);assert.equal(item.name_en,'Updated');
 assert.equal((await f.s.owner.patch('/api/owner/items/'+a,{complementary_ids:[b]})).json.error,'invalid_complementary_ids');
});

test('schedule times reject coerced arrays without changing the saved schedule',async()=>{
 const f=await fixture(), path='/api/owner/branches/'+f.s.branchId+'/menu-schedules';
 const schedule={days:[0,1],start:'10:00',end:'12:00'};
 assert.equal((await f.s.owner.put(path+'/'+f.category,{schedule})).status,200);
 for(const malformed of [{...schedule,start:['10:00']},{...schedule,end:['12:00']}]) {
  const result=await f.s.owner.put(path+'/'+f.category,{schedule:malformed});
  assert.equal(result.status,400,JSON.stringify(result.json));assert.equal(result.json.error,'invalid_schedule');
  assert.deepEqual((await f.s.owner.get(path)).json.schedules,[{category_id:f.category,...schedule}]);
 }
});

test('recommendations filter unavailable historical candidates before the three-item limit',async()=>{
 const f=await fixture(), origin=(await f.create()).json.id;
 const {org_id}=await f.env.DB.prepare('SELECT org_id FROM branches WHERE id=?').bind(f.s.branchId).first();
 const statements=[];
 const candidates=[...Array.from({length:100},(_,n)=>'aaa-hidden-'+String(n).padStart(3,'0')),'zzz-4','zzz-3','zzz-2','zzz-1'];
 for(const id of candidates) {
  statements.push(f.env.DB.prepare('INSERT INTO items(id,org_id,category_id,name_ar,name_en,price) VALUES(?,?,?,?,?,100)').bind(id,org_id,f.category,id,id));
  if(id.startsWith('aaa-')) statements.push(f.env.DB.prepare('INSERT INTO branch_unavailable(branch_id,item_id) VALUES(?,?)').bind(f.s.branchId,id));
  for(let n=0;n<3;n++) statements.push(f.env.DB.prepare("INSERT INTO customer_orders(id,org_id,branch_id,token,idem_key,fingerprint,status,total,items_json,created_at) VALUES(?,?,?,?,?,?,'accepted',200,?,?)").bind(id+'-'+n,org_id,f.s.branchId,'token-'+id+'-'+n,'idem-'+id+'-'+n,'synthetic',JSON.stringify([{id:origin,quantity:1,price:100},{id,quantity:1,price:100}]),Date.now()));
 }
 await f.env.DB.batch(statements);
 const rec=await f.guest.get('/api/public/menu/'+f.s.branchSlug+'/recommendations/'+origin);
 assert.equal(rec.status,200);assert.equal(rec.json.source,'orders');assert.equal(rec.json.sample_size,3);
 assert.deepEqual(rec.json.items.map(i=>i.id),['zzz-1','zzz-2','zzz-3']);
});
