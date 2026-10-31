import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require('/workspace/browser-tools/node_modules/playwright'));}
const base=process.argv[2]||'http://127.0.0.1:8787';const out=process.argv[3]||'output/playwright/connected';await fs.mkdir(out,{recursive:true});
const proxyUrl=process.env.HTTPS_PROXY||process.env.HTTP_PROXY;
const launch={};if(proxyUrl&&!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(base)){const u=new URL(proxyUrl);launch.proxy={server:u.origin,...(u.username?{username:decodeURIComponent(u.username),password:decodeURIComponent(u.password)}:{})};}
const browser=await chromium.launch(launch);const errors=[],checks=[];let sequence=0;
async function device(options={}){const context=await browser.newContext({viewport:{width:1280,height:900},...options});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));return {context,page};}
const main=await device(),cash=await device(),display=await device(),guest=await device({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),cash2=await device();
const check=s=>{checks.push(s);console.log('PASS',s)};async function shot(page,name){await page.screenshot({path:`${out}/${String(++sequence).padStart(2,'0')}-${name}.png`,fullPage:true});}
try{
 await main.page.goto(base+'/demo');await main.page.getByRole('button',{name:'أنشئ تجربتي الحية'}).click();await main.page.getByRole('button',{name:'افتح الكاشير',exact:true}).waitFor();
 const token=new URLSearchParams(new URL(main.page.url()).hash.slice(1)).get('room');assert.ok(token);check('UI creates isolated room');await shot(main.page,'demo-room');
 const room=await (await main.page.request.get(base+'/api/demo/'+token)).json();
 await cash.page.goto(base+'/demo#room='+token+'&role=cashier');await cash.page.waitForURL('**/app');await cash.page.locator('#num').waitFor();
 await cash2.page.goto(base+'/demo#room='+token+'&role=cashier');await cash2.page.waitForURL('**/app');check('independent cashier sessions linked without admin access');
 const deviceLink=await (await display.page.request.post(base+'/api/demo/'+token+'/display',{data:{}})).json();await display.page.goto(base+deviceLink.url);await display.page.locator('#connection-status').filter({hasText:'متصل'}).waitFor();
 await cash.page.fill('#num','INV-27');await cash.page.locator('#nt button').click();await cash.page.locator('#issued .ticket-num').waitFor();
 let tickets=(await (await cash.page.request.get(base+'/api/branch/tickets')).json()).tickets;let ticket=tickets[0];assert.equal(ticket.invoice_number,'INV-27');assert.match(ticket.number,/^\d+$/);check('invoice distinct from automatic pager number');await display.page.locator('.qr').waitFor();await shot(display.page,'display-qr');
 const publicBody=await (await guest.page.request.get(base+'/api/public/menu/'+room.branch_slug)).text();assert.ok(!publicBody.includes(ticket.token));await guest.page.goto(base+'/m/'+room.branch_slug);assert.equal(await guest.page.locator('.qr').count(),0);check('public menu contains no ticket token or pager QR');
 await guest.page.goto(base+'/t/'+ticket.token);await guest.page.getByText('طلبك قيد التحضير',{exact:true}).waitFor();await guest.page.locator('#enable').click().catch(()=>{});
 await display.page.locator('.qr').waitFor({state:'detached',timeout:15000});check('customer link hides private display QR');
 await cash.page.locator('.ticket').filter({hasText:ticket.number}).locator('[data-a=ready]').first().click();await guest.page.getByText('طلبك جاهز!',{exact:true}).waitFor({timeout:20000});await shot(guest.page,'ready-mobile');check('cashier ready reaches independent mobile customer');
 const stale=await cash2.page.request.post(base+`/api/branch/tickets/${ticket.id}/cancel`,{data:{version:ticket.version}});assert.equal(stale.status(),409);check('second cashier cannot overwrite stale ticket version');
 await guest.page.locator('#seen').click();await guest.page.getByText('تمام، الموظف يعرف إنك شفت التنبيه.',{exact:true}).waitFor();
 let fresh=(await (await cash.page.request.get(base+'/api/branch/tickets')).json()).tickets.find(t=>t.id===ticket.id);assert.ok(fresh.seen_at);assert.equal(fresh.status,'ready');check('seen acknowledgment does not imply collection');
 await guest.context.setOffline(true);await guest.page.reload().catch(()=>{});await guest.context.setOffline(false);await guest.page.goto(base+'/t/'+ticket.token);await guest.page.getByText('طلبك جاهز!',{exact:true}).waitFor();check('customer state recovers after offline and reload');
 await cash.page.locator('.ticket').filter({hasText:ticket.number}).locator('[data-a=collect]').first().click();await guest.page.getByText('تم الاستلام، بالعافية!',{exact:true}).waitFor({timeout:20000});await guest.page.locator('[data-star="5"]').click();await guest.page.getByText('شكرًا على تقييمك!',{exact:false}).waitFor();check('actual pickup and rating complete persisted journey');await shot(guest.page,'collected-rated');
 await guest.page.goto(base+'/j/'+room.org_slug);await guest.page.locator('#go').click();await guest.page.waitForURL('**/c/**');const cardToken=new URL(guest.page.url()).pathname.split('/')[2];let card=(await (await guest.page.request.get(base+'/api/cards/'+cardToken)).json());const code=card.card?.code||card.code;
 await cash.page.locator('[data-k=loyalty]').click();await cash.page.fill('#code',code);await cash.page.locator('#f button').click();
 for(let i=1;i<=3;i++){await cash.page.locator('#st').click();await cash.page.getByText(new RegExp(`${i} أختام|${i} stamps`)).waitFor();}
 await cash.page.locator('#rd').click();await cash.page.getByText(/0 أختام|0 stamps/).waitFor();await guest.page.reload();card=await (await guest.page.request.get(base+'/api/cards/'+cardToken)).json();assert.equal(card.stamps,0);check('loyalty stamps and redeem update persistent customer balance');await shot(guest.page,'loyalty-redeemed');
 await guest.page.goto(base+'/?lang=en');assert.equal(await guest.page.evaluate(()=>document.documentElement.dir),'ltr');await guest.page.locator('#yearly').click();assert.equal(await guest.page.locator('[data-month="129"]').innerText(),'1290');await guest.page.locator('#tab-pager').click();await guest.page.locator('#sample-call').click();assert.match(await guest.page.locator('#phone-content').innerText(),/ready/);check('English landing pricing and interactive portal work');
 await guest.page.emulateMedia({reducedMotion:'reduce'});assert.equal(await guest.page.locator('.hero-symbol').evaluate(e=>getComputedStyle(e).animationName),'none');assert.equal(await guest.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);check('mobile fits viewport and honors reduced motion');await shot(guest.page,'english-reduced-motion');
 assert.deepEqual(errors,[]);check('no browser JavaScript errors');
 await fs.writeFile(out+'/results.json',JSON.stringify({base,at:new Date().toISOString(),checks,errors},null,2));
}finally{await browser.close();}
