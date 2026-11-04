import test from 'node:test';
import assert from 'node:assert/strict';
import {makeEnv,setupOrg,client} from './helpers.js';
import {PRESETS,validateRecipe} from '../src/design.js';
test('catalog has 100 structural combinations independent of colours',()=>{
 assert.equal(new Set(PRESETS.map(p=>JSON.stringify(p.recipe.composition))).size,100);
 assert.equal(new Set(PRESETS.map(p=>p.recipe.composition.frame)).size,10);
 assert.throws(()=>validateRecipe({home:{enabled:true,blocks:[{id:'x',type:'html',body_ar:'<script>'}]}}));
 assert.throws(()=>validateRecipe({home:{blocks:[{id:'x',type:'cta',url:'javascript:alert(1)'}]}}));
 assert.throws(()=>validateRecipe({composition:{frame:'custom-css'}}));
});
test('page content stays private until publish, survives theme changes and detects stale writes',async()=>{
 const env=makeEnv(),s=await setupOrg(env);const first=(await s.owner.get('/api/owner/design')).json;
 const recipe=first.draft;delete recipe.derived;
 recipe.home={enabled:true,blocks:[{id:'intro',type:'hero',title_ar:'موقعي الجديد',body_ar:'هوية خاصة'}]};
 const saved=await s.owner.put('/api/owner/design/draft',{recipe,revision:first.revision});assert.equal(saved.status,200);
 assert.equal((await client(env).get('/api/public/profile/'+s.orgSlug)).json.design,null);
 assert.equal((await s.owner.put('/api/owner/design/draft',{recipe,revision:first.revision})).status,409);
 const applied=await s.owner.post('/api/owner/design/presets/latte-classic/apply',{revision:saved.json.revision});assert.equal(applied.status,200);assert.equal(applied.json.draft.home.blocks[0].title_ar,'موقعي الجديد');
 assert.equal((await s.owner.post('/api/owner/design/publish',{revision:saved.json.revision})).status,409);
 assert.equal((await s.owner.post('/api/owner/design/publish',{revision:applied.json.revision})).status,200);
 assert.equal((await client(env).get('/api/public/profile/'+s.orgSlug)).json.design.home.blocks[0].title_ar,'موقعي الجديد');
});
test('cashier restrictions are enforced immediately and scoped to the owner organization',async()=>{
 const env=makeEnv(),s=await setupOrg(env);const result=await s.owner.get('/api/owner/branches/'+s.branchId+'/permissions');
 assert.equal(result.status,200);const permissions=result.json.permissions;permissions.tickets_cancel=false;permissions.loyalty_redeem=false;permissions.display=false;
 assert.equal((await s.owner.put('/api/owner/branches/'+s.branchId+'/permissions',{permissions})).status,200);
 const ticket=await s.cashier.post('/api/branch/tickets',{invoice_number:'T1',idem_key:crypto.randomUUID()});assert.equal(ticket.status,201);
 assert.equal((await s.cashier.post('/api/branch/tickets/'+ticket.json.id+'/cancel',{version:1})).status,403);
 assert.equal((await s.cashier.post('/api/branch/loyalty/ABC123/redeem',{idem_key:crypto.randomUUID()})).status,403);
 assert.equal((await s.cashier.get('/api/branch/display-devices')).status,403);
 assert.equal((await s.cashier.get('/api/me')).json.permissions.tickets_cancel,false);
 assert.equal((await s.cashier.put('/api/owner/branches/'+s.branchId+'/permissions',{permissions})).status,403);
 assert.equal((await s.owner.put('/api/owner/branches/'+crypto.randomUUID()+'/permissions',{permissions})).status,404);
});
