import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
const base=process.argv[2]||'http://127.0.0.1:8793',out=process.argv[3]||'output/playwright/next-studio/entry';
mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const pass=message=>console.log('PASS',message);
async function fresh(){const context=await browser.newContext();const page=await context.newPage();page.setDefaultTimeout(12000);return {context,page};}
async function editor(page){await page.waitForURL('**/app?lang=en#design');await page.locator('#st-frame').waitFor();}
try{
 const {page,context}=await fresh();const creates=[],sessions=[],external=[];let token;
 page.on('request',request=>{const u=new URL(request.url());if(u.origin!==new URL(base).origin)external.push(request.url());if(u.pathname==='/api/demo'&&request.method()==='POST')creates.push(request.postDataJSON());if(u.pathname.endsWith('/session'))sessions.push(request.postDataJSON());});
 page.on('response',async response=>{if(new URL(response.url()).pathname==='/api/demo'&&response.request().method()==='POST'&&response.ok())token=(await response.json()).token;});
 await page.goto(base+'/demo?view=studio&lang=en');await editor(page);
 assert.deepEqual(creates,[{mode:'studio'}]);assert.deepEqual(sessions,[{role:'owner'}]);assert.ok(token);
 assert.ok(external.every(url=>!url.includes(token)),'room bearer never appears in external requests');
 await page.screenshot({path:out+'/direct-editor.png'});pass('fresh studio opens editor automatically in selected language');
 await page.reload();await page.locator('#st-frame').waitFor();assert.equal(creates.length,1);assert.equal(sessions.length,1);pass('editor reload creates no room or session');
 await page.goto(base+'/demo?view=studio&lang=en#room='+token);await editor(page);assert.equal(creates.length,1);assert.equal(sessions.length,2);pass('existing room resumes directly');
 await context.close();
 const ordinary=await fresh();let ordinaryCreates=0;ordinary.page.on('request',r=>{if(new URL(r.url()).pathname==='/api/demo'&&r.method()==='POST')ordinaryCreates++;});
 await ordinary.page.goto(base+'/demo?lang=en');await ordinary.page.locator('#create').waitFor();assert.equal(ordinaryCreates,0);assert.ok(ordinary.page.url().includes('/demo'));await ordinary.page.locator('#create').click();await ordinary.page.locator('[data-role=owner]').waitFor();assert.equal(ordinaryCreates,1);assert.ok(ordinary.page.url().includes('/demo'));pass('ordinary connected demo waits for manual creation and shows connected roles');
 await ordinary.context.close();
 const role=await fresh();let roleBody;
 role.page.on('request',r=>{if(new URL(r.url()).pathname.endsWith('/session'))roleBody=r.postDataJSON();});
 await role.page.goto(base+'/demo?view=studio&lang=en#room='+token+'&role=cashier');await role.page.waitForURL('**/app?lang=en');assert.deepEqual(roleBody,{role:'branch'});assert.equal(new URL(role.page.url()).hash,'');pass('explicit cashier fragment retains branch semantics');await role.context.close();
 const arabic=await fresh();await arabic.context.addInitScript(()=>localStorage.setItem('zm_lang','en'));await arabic.page.goto(base+'/demo?view=studio&lang=ar');await arabic.page.waitForURL('**/app?lang=ar#design');await arabic.page.locator('#st-frame').waitFor();assert.equal(await arabic.page.locator('html').getAttribute('lang'),'ar');pass('explicit Arabic survives a saved English preference');await arabic.context.close();
 for(const failure of ['429','network','410']){
  const {page,context}=await fresh();let failed=false,count=0;
  const expired=failure==='410';
  await page.route('**/api/demo'+(expired?'/*':''),async route=>{const request=route.request();if(!expired&&request.method()!=='POST')return route.continue();count++;if(!failed){failed=true;if(failure==='network')return route.abort('failed');return route.fulfill({status:Number(failure),contentType:'application/json',body:JSON.stringify({error:expired?'demo_expired':'rate_limited'})});}return route.continue();});
  await page.goto(base+'/demo?view=studio&lang=en'+(expired?'#room='+token:''));
  await page.locator('#studio-retry').waitFor({state:'visible'});assert.ok((await page.locator('#status').innerText()).length>10);assert.equal(count,1,'no automatic retry loop');
  assert.equal(await page.locator('#studio-connected').getAttribute('href'),'/demo?lang=en');
  await page.screenshot({path:out+'/error-'+failure+'.png'});
  await page.locator('#studio-retry').click();await editor(page);pass(failure+' has visible status and successful manual retry');await context.close();
 }
 const sessionRetry=await fresh();let sessionCreates=0,sessionAttempts=0;
 sessionRetry.page.on('request',r=>{if(new URL(r.url()).pathname==='/api/demo'&&r.method()==='POST')sessionCreates++;});
 await sessionRetry.page.route('**/api/demo/*/session',async route=>{sessionAttempts++;if(sessionAttempts===1)return route.abort('failed');return route.continue();});
 await sessionRetry.page.goto(base+'/demo?view=studio&lang=en');await sessionRetry.page.locator('#studio-retry').waitFor({state:'visible'});assert.equal(sessionCreates,1);assert.ok(new URL(sessionRetry.page.url()).hash.startsWith('#room='));await sessionRetry.page.locator('#studio-retry').click();await editor(sessionRetry.page);assert.equal(sessionCreates,1);assert.equal(sessionAttempts,2);pass('session network retry preserves room without duplicate creation');await sessionRetry.context.close();
 const display=await fresh();await display.page.goto(base+'/demo?view=studio&lang=en#room='+token+'&role=display');await display.page.waitForURL('**/display/*?lang=en');pass('explicit display fragment retains display semantics');await display.context.close();
 // A session failure must discard the revoked room only after explicit retry.
 const recovery=await fresh();let created=0,attempts=0;
 recovery.page.on('request',r=>{if(new URL(r.url()).pathname==='/api/demo'&&r.method()==='POST')created++;});
 await recovery.page.route('**/api/demo/*/session',async route=>{attempts++;if(attempts===1)return route.fulfill({status:410,contentType:'application/json',body:'{"error":"demo_expired"}'});return route.continue();});
 await recovery.page.goto(base+'/demo?view=studio&lang=en');await recovery.page.locator('#studio-retry').waitFor({state:'visible'});assert.equal(created,1);await recovery.page.locator('#studio-retry').click();await editor(recovery.page);assert.equal(created,2);pass('revoked session retries with one replacement room');await recovery.context.close();
}finally{await browser.close();}
