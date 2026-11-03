import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
const base=process.argv[2]||'http://127.0.0.1:8787',out=process.argv[3]||'output/waitlist';
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
 await owner.locator('[data-k=settings]').click();
 const f=owner.locator('form:has([name=minutes])').first();await f.waitFor();
 await f.locator('[name=active]').check();await f.locator('[name=minutes]').fill('6');await f.locator('[type=submit]').click();await f.getByText('تم الحفظ').waitFor();
 pass('owner opens the waitlist for a branch');
 const slug=await owner.evaluate(async()=>(await (await fetch('/api/owner/branches')).json()).branches[0].slug);

 // Guest 1 finds the waitlist from the menu.
 const g1=await open();
 await g1.goto(base+'/m/'+slug);await g1.locator('#wl-join-link').click();await g1.locator('#wl-form').waitFor();
 await g1.fill('#wl-name','نورة');await g1.locator('[data-party="3"]').click();await g1.locator('#wl-join').click();
 await g1.waitForURL('**/w/**');await g1.locator('#wl-number').waitFor();
 assert.equal(await g1.locator('#wl-number').textContent(),'1');assert.match(await g1.locator('#wl-position').textContent(),/أنت التالي/);
 pass('guest joins from the menu and sees number 1, next in line');
 const g2=await open();
 await g2.goto(base+'/q/'+slug);await g2.fill('#wl-name','خالد');await g2.locator('#wl-join').click();await g2.locator('#wl-number').waitFor();
 assert.match(await g2.locator('#wl-position').textContent(),/ترتيبك 2/);assert.match(await g2.locator('.hero-status').textContent(),/12 دقيقة/);
 pass('second guest sees place 2 and the expected wait');
 await g2.screenshot({path:out+'/guest-waiting.png',fullPage:true});
 assert.ok(await g2.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));

 // Cashier runs the list.
 const cash=await open({width:1280,height:900});
 await cash.goto(base+'/demo#room='+room.token+'&role=cashier');await cash.waitForURL('**/app');
 await cash.locator('[data-k=waitlist]').click();await cash.locator('#wl-board .wl-row').nth(1).waitFor();
 assert.equal(await cash.locator('#wl-board .wl-row').count(),2);
 await cash.locator('.wl-row',{hasText:'نورة'}).locator('[data-act=call]').click();
 await g1.locator('#wl-called').waitFor({timeout:15000});pass('cashier calls and the guest page shows it is their turn');
 await g1.locator('#wl-seen').click();await g1.getByText('الموظف يعرف').waitFor();
 await cash.locator('.wl-row',{hasText:'نورة'}).getByText('شاف التنبيه').waitFor({timeout:10000});pass('guest confirms and the cashier sees it');
 await cash.locator('.wl-row',{hasText:'نورة'}).locator('[data-act=seat]').click();
 await cash.locator('#wl-done',{hasText:'نورة'}).waitFor();
 await g2.locator('#wl-position',{hasText:'أنت التالي'}).waitFor({timeout:15000});pass('seating moves the next guest up');
 await cash.fill('#wl-add [name=name]','عائلة سعد');await cash.fill('#wl-add [name=party]','9');await cash.locator('#wl-add [type=submit]').click();
 await cash.locator('.wl-row',{hasText:'عائلة سعد'}).waitFor();pass('cashier adds a walk-in');
 await cash.screenshot({path:out+'/cashier-board.png',fullPage:true});
 await g2.locator('#wl-leave').click().catch(()=>{});
 assert.deepEqual(errors,[]);
}finally{await browser.close();}
