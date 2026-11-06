import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
const base=process.argv[2]||'http://127.0.0.1:8793',out=process.argv[3]||'output/playwright/next-studio/gallery';
mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const pass=s=>console.log('PASS',s);
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();page.setDefaultTimeout(12000);const errors=[];page.on('pageerror',e=>errors.push(e.message));let creations=0,roomChecks=0;
 page.on('request',r=>{const path=new URL(r.url()).pathname;if(path==='/api/demo'&&r.method()==='POST')creations++;if(/^\/api\/demo\/[^/]+$/.test(path)&&r.method()==='GET')roomChecks++;});
 await page.goto(base+'/designs?lang=en');await page.locator('.design-tile').first().waitFor();assert.equal(await page.locator('.design-tile').count(),20);assert.equal(creations,0);
 await page.waitForFunction(()=>[...document.querySelectorAll('.design-tile img')].filter(i=>!i.loading||i.loading==='eager').every(i=>i.complete&&i.naturalWidth>0));
 const ids=await page.locator('.design-tile').evaluateAll(nodes=>nodes.map(n=>n.dataset.id));assert.equal(new Set(ids).size,20);
 await page.screenshot({path:out+'/desktop.png',fullPage:true});pass('twenty real previews are visible without creating a room');
 const sector=await page.locator('#gallery-sector option').nth(1).getAttribute('value');await page.locator('#gallery-sector').selectOption(sector);assert.ok(await page.locator('.design-tile').count()<20);assert.ok(await page.locator('.design-tile').count()>0);assert.deepEqual(await page.locator('.design-tile').evaluateAll(nodes=>[...new Set(nodes.map(n=>n.dataset.sector))]),[sector]);pass('sector filter shows matching real designs');await page.locator('#gallery-sector').selectOption('all');
 const chosen=ids[0];await page.locator('[data-id="'+chosen+'"] [data-preview]').click();await page.waitForURL('**/p/*?lang=en');await page.locator('h1').first().waitFor();assert.equal(creations,1);
 const saved=await page.evaluate(async()=>JSON.parse(sessionStorage.getItem('zm_design_gallery_room')));assert.ok(saved.token);
 const owner=await page.evaluate(async()=>(await fetch('/api/owner/design')).json());assert.equal(owner.preset_id,chosen);
 const published=await page.evaluate(async slug=>(await fetch('/api/public/profile/'+slug)).json(),saved.org_slug);assert.deepEqual(published.design.home,owner.published.home);
 assert.equal(await page.locator('img[src*="qr"],.pager-qr,.ticket-qr').count(),0);await page.screenshot({path:out+'/customer-preview.png',fullPage:true});pass('explicit preview opens published customer site matching selected preset without pager QR');
 await page.goto(base+'/designs?lang=en');await page.locator('.design-tile').first().waitFor();await page.locator('[data-id="'+ids[1]+'"] [data-preview]').click();await page.waitForURL('**/p/*?lang=en');assert.equal(creations,1);assert.equal(roomChecks,1);assert.equal((await page.evaluate(async()=>(await fetch('/api/owner/design')).json())).preset_id,ids[1]);pass('returning gallery reuses only its isolated room and changes the public design');assert.deepEqual(errors,[]);
 const mobile=await browser.newPage({viewport:{width:360,height:800},colorScheme:'dark',reducedMotion:'reduce'});await mobile.goto(base+'/designs?lang=ar');await mobile.locator('.design-tile').first().waitFor();assert.equal(await mobile.locator('html').getAttribute('dir'),'rtl');assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await mobile.screenshot({path:out+'/mobile-dark.png',fullPage:true});await mobile.close();pass('Arabic gallery fits 360px and respects dark/reduced-motion preferences');
 // Error injection stays at the local API boundary; the gallery remains real.
 const failure=await browser.newPage();failure.setDefaultTimeout(12000);let attempts=0;
 await failure.route('**/api/demo',async route=>{if(route.request().method()!=='POST')return route.continue();attempts++;if(attempts===1)return route.fulfill({status:429,contentType:'application/json',body:'{"error":"demo_capacity"}'});return route.continue();});
 await failure.goto(base+'/designs?lang=en');await failure.locator('[data-preview]').first().click();await failure.locator('#gallery-retry').waitFor({state:'visible'});assert.equal(attempts,1);assert.ok((await failure.locator('#gallery-status').innerText()).length>15);await failure.locator('#gallery-retry').click();await failure.waitForURL('**/p/*?lang=en');pass('capacity error is visible and manual retry opens the selected design');await failure.close();
 const expiry=await context.newPage();let expiredChecks=0,expiredCreates=0;
 await expiry.route('**/api/demo/**',route=>{if(route.request().method()==='GET'){expiredChecks++;return route.fulfill({status:410,contentType:'application/json',body:'{"error":"demo_expired"}'});}return route.continue();});
 // Copy this gallery's previous token; a fresh tab otherwise has separate storage.
 await expiry.goto(base+'/designs?lang=en');await expiry.evaluate(room=>sessionStorage.setItem('zm_design_gallery_room',JSON.stringify(room)),saved);await expiry.reload();
 expiry.on('request',r=>{if(new URL(r.url()).pathname==='/api/demo'&&r.method()==='POST')expiredCreates++;});
 await expiry.locator('[data-preview]').first().click();await expiry.locator('#gallery-retry').waitFor({state:'visible'});assert.equal(expiredChecks,1);assert.equal(expiredCreates,0);assert.match(await expiry.locator('#gallery-status').innerText(),/expired/i);await expiry.locator('#gallery-retry').click();await expiry.waitForURL('**/p/*?lang=en');assert.equal(expiredCreates,1);pass('expired gallery room waits for an explicit retry before creating its replacement');await expiry.close();await context.close();
}finally{await browser.close();}
