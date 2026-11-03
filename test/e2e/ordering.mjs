import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
const base=process.argv[2]||'http://127.0.0.1:8787',out=process.argv[3]||'output/ordering';
mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true}),errors=[];
const page=await browser.newPage({viewport:{width:1280,height:900}});page.on('pageerror',e=>errors.push(e.message));
const pass=s=>console.log('PASS',s);
const json=(p,path,method='GET',body)=>p.evaluate(async([path,method,body])=>{const r=await fetch(path,{method,headers:{'content-type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,json:await r.json().catch(()=>null)};},[path,method,body]);
try{
 await page.goto(base+'/demo');
 const room=await page.evaluate(async()=>(await fetch('/api/demo',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).json());
 await page.evaluate(async token=>{await fetch('/api/demo/'+token+'/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({role:'owner'})});},room.token);
 await page.goto(base+'/app');await page.locator('.workspace-welcome').waitFor();
 // Owner sets ways to order from the branch settings screen.
 await page.locator('[data-k=settings]').click();await page.locator('form:has([name=type])').first().waitFor();
 const f=page.locator('form:has([name=type])').first();
 for(const k of ['dine_in','delivery','car'])await f.locator(`[name=type][value=${k}]`).check();
 await f.locator('[name=tables]').fill('6');await f.locator('[name=whatsapp]').fill('0551234567');await f.locator('[name=delivery_fee]').fill('10');await f.locator('[name=delivery_min]').fill('20');
 await f.locator('[type=submit]').click();await f.getByText('تم الحفظ').waitFor();
 assert.equal(await f.locator('[data-tables]').isVisible(),true);pass('owner saves ways to order and gets table QR printing');
 const branch=(await json(page,'/api/owner/branches')).json.branches[0];
 await json(page,'/api/owner/branches/'+branch.id+'/settings','PATCH',{orders_enabled:true});
 // Coupons tab.
 await page.locator('[data-k=coupons]').click();await page.locator('#cp-form').waitFor();
 await page.fill('#cp-form [name=code]','zimara10');await page.fill('#cp-form [name=value]','10');await page.locator('#cp-form [type=submit]').click();
 await page.getByText('ZIMARA10').waitFor();pass('owner creates a coupon');
 await page.screenshot({path:out+'/coupons.png'});
 // Guest arrives from table 3's QR.
 const guest=await browser.newPage({viewport:{width:390,height:844}});guest.on('pageerror',e=>errors.push(e.message));
 await guest.goto(base+'/m/'+branch.slug+'?table=3');await guest.locator('.dish').first().waitFor();
 const plain=guest.locator('.dish:not(:has-text("من ")) [data-add]').first();
 await plain.click();await guest.locator('#cart:not([hidden])').waitFor();
 if(await guest.locator('.options-sheet').count())await guest.locator('#opt-add').click();
 assert.equal(await guest.locator('[data-type=dine_in][aria-checked=true]').count(),1);
 assert.equal(await guest.locator('#co-table').inputValue(),'3');pass('table QR pre-selects dine-in and the table');
 assert.ok(await guest.locator('[data-upsell]').count()>=1);pass('cart suggests add-ons');
 assert.match(await guest.locator('#wa-order').getAttribute('href'),/^https:\/\/wa\.me\/966551234567\?text=/);pass('WhatsApp ordering link is ready');
 await guest.locator('[data-upsell]').first().click();
 await guest.fill('#co-coupon','zimara10');await guest.locator('#apply-coupon').click();await guest.locator('#coupon-msg', {hasText:'تم تطبيق الخصم'}).waitFor();pass('coupon shows the discount before sending');
 await guest.locator('[data-type=delivery]').click();await guest.locator('#co-address').waitFor();
 assert.ok(await guest.getByText('التوصيل').count());
 await guest.locator('#send-order').click();await guest.getByText('كمّل البيانات المطلوبة').waitFor();pass('delivery asks for name, mobile and address');
 await guest.locator('[data-type=dine_in]').click();
 await guest.screenshot({path:out+'/guest-cart.png',fullPage:true});
 await guest.locator('#send-order').click();await guest.locator('#order-status:not([hidden])').waitFor();
 const token=await guest.evaluate(s=>sessionStorage.getItem('zm_order_'+s),branch.slug);
 const o=(await json(guest,'/api/public/order/'+token)).json.order;
 assert.equal(o.order_type,'dine_in');assert.equal(o.details.table,'3');assert.equal(o.coupon_code,'ZIMARA10');assert.ok(o.discount>0);
 pass('order arrives with type, table and coupon priced by the server');
 assert.ok(await guest.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 assert.deepEqual(errors,[]);
}finally{await browser.close();}
