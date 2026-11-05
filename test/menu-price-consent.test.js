import test from 'node:test';
import assert from 'node:assert/strict';
import {makeEnv,setupOrg,client} from './helpers.js';
async function fixture(){
 const env=makeEnv(), s=await setupOrg(env),guest=client(env);
 const category=(await s.owner.post('/api/owner/categories',{name_ar:'قهوة',name_en:'Coffee'})).json.id;
 const item=(await s.owner.post('/api/owner/items',{category_id:category,name_ar:'قهوة',name_en:'Coffee',price:900})).json.id;
 await s.owner.patch('/api/owner/branches/'+s.branchId+'/settings',{orders_enabled:true});
 return{env,s,guest,item,path:'/api/public/orders/'+s.branchSlug};
}
test('changed server quote is rejected before creating an order; accepted receipts replay original totals',async()=>{
 const f=await fixture(),body={idem_key:crypto.randomUUID(),items:[{item_id:f.item,quantity:1}],expected_total:900};
 assert.equal((await f.guest.post(f.path,body)).status,201);
 await f.s.owner.patch('/api/owner/items/'+f.item,{price:1900});
 const stale={...body,idem_key:crypto.randomUUID()};
 const reject=await f.guest.post(f.path,stale);
 assert.equal(reject.status,409);assert.equal(reject.json.error,'price_changed');
 assert.equal(await f.env.DB.prepare('SELECT id FROM customer_orders WHERE idem_key=?').bind(stale.idem_key).first(),null);
 const retry=await f.guest.post(f.path,body);
 assert.equal(retry.status,200);assert.equal(retry.json.duplicate,true);assert.equal(retry.json.order.total,900);
 const accepted=await f.guest.post(f.path,{...stale,expected_total:1900});
 assert.equal(accepted.status,201);assert.equal(accepted.json.order.total,1900);
});
test('quote validation covers options and quantities while retaining legacy clients',async()=>{
 const f=await fixture();
 await f.s.owner.patch('/api/owner/items/'+f.item,{options:[{id:'extras',name_ar:'إضافات',name_en:'Extras',required:true,multi:false,choices:[{id:'milk',name_ar:'حليب',name_en:'Milk',price:200}]}]});
 const body={idem_key:crypto.randomUUID(),items:[{item_id:f.item,quantity:2,options:['milk']}],expected_total:1800};
 assert.equal((await f.guest.post(f.path,body)).status,409);
 const ok=await f.guest.post(f.path,{...body,expected_total:2200});assert.equal(ok.status,201);assert.equal(ok.json.order.total,2200);
 for(const expected_total of ['2200',true,-1,1.5])assert.equal((await f.guest.post(f.path,{...body,idem_key:crypto.randomUUID(),expected_total})).status,400);
 const legacy={...body,idem_key:crypto.randomUUID()};delete legacy.expected_total;
 assert.equal((await f.guest.post(f.path,legacy)).status,201);
});
