import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
const base=process.argv[2]||'http://127.0.0.1:8787',out=process.argv[3]||'output/loyalty';
mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true}),errors=[];
const pass=s=>console.log('PASS',s);
const open=async(viewport={width:390,height:844})=>{const ctx=await browser.newContext({viewport});const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));return p;};
try{
 const owner=await open({width:1280,height:900});
 await owner.goto(base+'/demo');
 const room=await owner.evaluate(async()=>(await fetch('/api/demo',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).json());
 await owner.evaluate(async token=>{await fetch('/api/demo/'+token+'/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({role:'owner'})});},room.token);
 await owner.goto(base+'/app');await owner.locator('.workspace-welcome').waitFor();
 await owner.locator('[data-k=loyalty]').click();await owner.locator('#lp-form').waitFor();
 await owner.locator('#lp-form [data-kind=points]').click();
 assert.equal(await owner.locator('#lp-form [name=stamps_required]').isVisible(),false);
 await owner.fill('#lp-form [name=points_per_sar]','2');await owner.fill('#lp-form [name=reward_points]','50');
 await owner.locator('#lp-form [type=submit]').click();await owner.locator('#lp-form').getByText('تم الحفظ').waitFor();
 pass('owner switches the programme to points');
 const org=await owner.evaluate(async()=>(await (await fetch('/api/me')).json()).org.slug);

 const guest=await open();
 await guest.goto(base+'/j/'+org);await guest.locator('#go').click();await guest.waitForURL('**/c/**');await guest.locator('#points-balance').waitFor();
 const code=(await guest.locator('strong[style*="letter-spacing"]').textContent()).trim();
 pass('guest gets a points card');

 const cash=await open({width:1280,height:900});
 await cash.goto(base+'/demo#room='+room.token+'&role=cashier');await cash.waitForURL('**/app');
 await cash.locator('[data-k=loyalty]').click();await cash.fill('#code',code);await cash.locator('#f button').click();
 await cash.locator('#bill').waitFor();await cash.locator('#st').click();await cash.getByText('اكتب مبلغ الفاتورة').waitFor();
 await cash.fill('#bill','30');await cash.locator('#st').click();await cash.getByText('60 نقطة من 50').waitFor();
 pass('cashier enters the bill and the server gives 60 points');
 await guest.reload();await guest.locator('#points-balance',{hasText:'60'}).waitFor();
 assert.equal(await guest.locator('.points-bar').getAttribute('aria-valuenow'),'50');
 await guest.getByText('مكافأة جاهزة').waitFor();pass('guest card shows points and a ready reward');

 await owner.reload();await owner.locator('[data-k=loyalty]').click();await owner.locator('.seg-grid').waitFor();
 await owner.locator('[data-seg=new]').click();await owner.locator('#seg-list code',{hasText:code}).waitFor();
 pass('owner sees the guest in the new segment');
 await owner.fill('#msg-form [name=title_ar]','عرض الويكند');await owner.fill('#msg-form [name=body_ar]','خصم 20٪ على البارد');
 assert.equal(await owner.locator('#msg-form [name=segment]').inputValue(),'new');
 await owner.locator('#msg-form [type=submit]').click();await owner.getByText('عرض الويكند').first().waitFor();
 await owner.screenshot({path:out+'/owner-loyalty.png',fullPage:true});
 await guest.reload();await guest.locator('#card-inbox',{hasText:'خصم 20٪'}).waitFor();pass('message reaches the guest card');
 await guest.screenshot({path:out+'/guest-card.png',fullPage:true});
 assert.ok(await guest.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 assert.deepEqual(errors,[]);
}finally{await browser.close();}
