import {existsSync} from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.argv[2]||'http://127.0.0.1:8793',out=process.argv[3]||'output/playwright/next-studio/canvas';await mkdir(out,{recursive:true});
const browser=await chromium.launch({...(process.env.CHROMIUM_PATH||existsSync('/usr/bin/chromium')?{executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium'}:{})});const page=await browser.newPage({viewport:{width:1440,height:1000}}),guest=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
const json=(path,method='GET',body)=>page.evaluate(async([path,method,body])=>{const r=await fetch(path,{method,headers:{'content-type':'application/json'},body:body?JSON.stringify(body):undefined});if(!r.ok)throw Error(path+' '+r.status);return r.json();},[path,method,body]);
try{
 await page.goto(base+'/demo');const room=await json('/api/demo','POST',{mode:'studio'});await json('/api/demo/'+room.token+'/session','POST',{role:'owner'});
 await page.goto(base+'/app#design');const frame=page.frameLocator('#st-frame');await frame.locator('h1[contenteditable]').waitFor();
 const original=await frame.locator('h1[contenteditable]').textContent();await frame.locator('h1[contenteditable]').fill('قهوة تليق بلحظتك.');
 const published=page.waitForResponse(r=>r.url().includes('/api/owner/design/publish')&&r.request().method()==='POST');
 // Programmatic activation deliberately leaves the field focused: saving must flush it, not rely on blur timing.
 await page.locator('#st-publish').evaluate(e=>e.click());await published;
 let design=await json('/api/owner/design');assert.equal(design.published.home.blocks.find(b=>b.type==='hero').title_ar,'قهوة تليق بلحظتك.','publish flushes focused text');
 await guest.goto(base+'/p/'+room.org_slug);await guest.locator('.site-home h1').waitFor();assert.equal(await guest.locator('.site-home h1').textContent(),'قهوة تليق بلحظتك.');assert.equal(await guest.locator('[contenteditable]').count(),0);
 const before=(await page.locator('.preview-viewport').boundingBox()).width;await page.locator('#st-focus').click();const after=(await page.locator('.preview-viewport').boundingBox()).width;assert.ok(after>before+200,'expand canvas returns real usable space');await page.locator('#st-focus').click();
 await frame.locator('.site-hero-media [data-inline-image]').click();await page.locator('#st-inline-media').waitFor();
 await page.locator('#st-inline-media input[type=file]').setInputFiles(new URL('../../public/menu-art/espresso-640.webp',import.meta.url).pathname);await page.waitForFunction(()=>{const el=document.querySelector('#st-inline-media input[name=value]');return el&&el.value.startsWith('/api/assets/');});
 const uploaded=await page.locator('#st-inline-media input[name=value]').inputValue();await page.locator('#st-media-apply').click();await page.locator('#st-save').click();await page.waitForFunction(()=>document.querySelector('#st-msg')?.textContent.includes('حُفظت المسودة.'));design=await json('/api/owner/design');assert.equal(design.draft.home.blocks.find(b=>b.type==='hero').image,uploaded);assert.notEqual(design.published.home.blocks.find(b=>b.type==='hero').image,uploaded,'photo draft stays private');
 await page.locator('[data-tab=presets]').click();await page.locator('.design-real-preview').first().waitFor();assert.equal(await page.locator('.design-real-preview').count(),20);assert.equal(await page.locator('#st-replace-content').isChecked(),false);
 const keep=design.draft.home.blocks.map(b=>b.title_ar);const applied=page.waitForResponse(r=>r.url().includes('/presets/')&&r.request().method()==='POST');await page.locator('[data-use]').first().click();await applied;
 design=await json('/api/owner/design');assert.deepEqual(design.draft.home.blocks.map(b=>b.title_ar),keep,'ordinary template apply preserves merchant copy');
 await page.locator('[data-tab=home]').click();await page.setViewportSize({width:390,height:900});assert.equal(await page.locator('#st-save').isVisible(),true,'mobile has a draft-only save/retry action');await page.locator('#st-save').click();await page.waitForFunction(()=>document.querySelector('#st-msg')?.textContent.includes('حُفظت المسودة.'));await page.screenshot({path:out+'/editor-390.png'});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:out+'/editor-1440.png'});assert.deepEqual(errors,[]);await writeFile(out+'/results.json',JSON.stringify({focusedPublish:true,uploadedDraft:true,preservedContent:true,errors}));console.log('PASS actual studio focused publish, private upload draft, canvas expansion,20 real previews and preserved merchant content');
}finally{await browser.close();}
