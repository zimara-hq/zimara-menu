import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import app from '../../src/app.js';
import {makeEnv,setupOrg} from '../helpers.js';

// Real browser wizard + application routes + isolated SQLite, with all external traffic blocked.
const browser=await chromium.launch();
try {
 for(const existing of [true,false]) {
  const env=makeEnv(), setup=await setupOrg(env);
  if(existing) {
   await setup.owner.post('/api/owner/design/presets/latte-classic/apply',{});
   const state=(await setup.owner.get('/api/owner/design')).json;
   const {derived,...recipe}=state.draft;
   recipe.home.enabled=true;recipe.home.footer_en='PUBLISHED MERCHANT COPY';recipe.menu.search=false;
   await setup.owner.put('/api/owner/design/draft',{recipe,revision:state.revision});
   await setup.owner.post('/api/owner/design/publish',{});
   recipe.home.footer_en='PRIVATE MERCHANT COPY';
   const published=(await setup.owner.get('/api/owner/design')).json;
   await setup.owner.put('/api/owner/design/draft',{recipe,revision:published.revision});
  }
  env.ASSETS={fetch:async req=>{
   let path=new URL(req.url).pathname;
   if(!path.split('/').at(-1).includes('.')) path+='.html';
   try {const body=await readFile(new URL('../../public'+path,import.meta.url));return new Response(body,{headers:{'content-type':path.endsWith('.js')?'text/javascript':path.endsWith('.html')?'text/html':path.endsWith('.css')?'text/css':'application/octet-stream'}});}
   catch{return new Response('missing',{status:404});}
  }};
  const context=await browser.newContext(),page=await context.newPage(),errors=[],writes=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const r=route.request(),u=new URL(r.url());
   if(u.origin!=='https://menu.test')return route.abort();
   if(u.pathname==='/wizard-test')return route.fulfill({contentType:'text/html',body:'<!doctype html><html><body><script type="module">import {magicStart} from "/magic-start.js";import {api} from "/common.js";window.openWizard=async()=>magicStart(await api("/api/me"));</script></body></html>'});
   if(r.method()!=='GET'&&u.pathname.startsWith('/api/owner/design')) writes.push({path:u.pathname,body:r.postDataJSON()});
   const response=await app.fetch(new Request(r.url(),{method:r.method(),headers:await r.allHeaders(),...(r.postData()?{body:r.postData()}: {})}),env);
   await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});
  });
  await page.goto('https://menu.test/wizard-test');
  await page.waitForFunction(()=>window.openWizard);
  assert.equal(await page.evaluate(async()=>{const r=await fetch('/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'owner@cafe.test',password:'owner-pass-123'})});return r.status;}),200);
  await page.evaluate(()=>window.openWizard());
  const dlg=page.locator('dialog.magic');await dlg.locator('#mg-next').click();await dlg.locator('#mg-color').waitFor();
  const selected='#c0392b';await dlg.locator('#mg-color').fill(selected);await dlg.locator('#mg-next').click();
  await dlg.locator('#mg-frame').waitFor({timeout:3000});
  // A visible iframe can still be replacing its initial document. Wait for the
  // actual root/color rather than throwing during that navigation boundary.
  await page.waitForFunction(color=>document.querySelector('#mg-frame')?.contentDocument?.documentElement?.style.getPropertyValue('--brand')===color,selected,{timeout:3000}).catch(async error=>{console.log(JSON.stringify({errors,frames:await page.locator('#mg-frame').evaluate(f=>({src:f.src,html:f.contentDocument?.body?.innerText,style:f.contentDocument?.documentElement.style.cssText}))}));throw error;});
  const before=(await setup.owner.get('/api/owner/design')).json;
  assert.equal(Boolean(before.published),existing,'preview keeps publication unchanged');
  if(existing) assert.equal(before.published.home.footer_en,'PUBLISHED MERCHANT COPY','private copy stays private before consent');
  await dlg.locator('#mg-next').click();await dlg.locator('#mg-ai').waitFor({timeout:3000});
  const after=(await setup.owner.get('/api/owner/design')).json;
  assert.equal(after.published.colors.primary,selected);
  assert.equal(after.has_unpublished,false);
  assert.equal((await setup.owner.get('/api/public/menu/'+setup.branchSlug)).json.design.colors.primary,selected,'public API serves exactly the selected color');
  assert.equal(writes.filter(w=>w.path.endsWith('/draft')).some(w=>'derived' in w.body.recipe),false,'derived fields never enter draft writes');
  assert.ok(writes.every(w=>Number.isSafeInteger(w.body.revision)),'each design mutation carries a revision');
  if(existing){assert.equal(after.published.home.footer_en,'PRIVATE MERCHANT COPY');assert.equal(after.published.menu.search,false);}
  // Going back after publication must use canonical ownership, even on first setup.
  await dlg.locator('#mg-back').click();await dlg.locator('#mg-back').click();
  await dlg.locator('#mg-color').fill('#185345');await dlg.locator('#mg-next').click();await dlg.locator('#mg-frame').waitFor({timeout:3000});
  assert.equal((await setup.owner.get('/api/owner/design')).json.published.colors.primary,selected,'Back + Next does not publish the second color');
  await dlg.locator('#mg-next').click();await dlg.locator('#mg-ai').waitFor({timeout:3000});
  assert.equal((await setup.owner.get('/api/owner/design')).json.published.colors.primary,'#185345');
  assert.equal((await setup.owner.get('/api/public/menu/'+setup.branchSlug)).json.design.colors.primary,'#185345');
  assert.deepEqual(errors,[]);
  console.log('PASS Magic Start selected-color preview and revisioned publication; '+(existing?'published owner retains content':'first-time owner')+'; Back preserves ownership');
  await context.close();
 }
} finally {await browser.close();}
