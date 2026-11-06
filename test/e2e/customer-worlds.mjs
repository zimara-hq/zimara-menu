import {existsSync} from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.argv[2]||'http://127.0.0.1:8793',out=process.argv[3]||'output/playwright/next-studio/worlds';await mkdir(out,{recursive:true});
const browser=await chromium.launch({...(process.env.CHROMIUM_PATH||existsSync('/usr/bin/chromium')?{executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium'}:{})});const page=await browser.newPage(),errors=[],results=[];page.on('pageerror',e=>errors.push(e.message));
const json=(path,method='GET',body)=>page.evaluate(async([path,method,body])=>{const r=await fetch(path,{method,headers:{'content-type':'application/json'},body:body?JSON.stringify(body):undefined});if(!r.ok)throw Error(path+' '+r.status);return r.json();},[path,method,body]);
try{
 await page.goto(base+'/demo');const room=await json('/api/demo','POST',{mode:'studio'});await json('/api/demo/'+room.token+'/session','POST',{role:'owner'});
 const catalog=await json('/api/owner/design');assert.equal(catalog.presets.filter(p=>p.curated).length,20);const {derived,...recipe}=catalog.draft;
 const worlds=[['market','grid'],['gallery','tiles'],['ledger','text'],['editorial','magazine']];
 for(const [frame,layout]of worlds){recipe.composition.frame=frame;recipe.layout=layout;recipe.show.images=true;await json('/api/owner/design/draft','PUT',{recipe});await json('/api/owner/design/publish','POST',{});
  for(const width of[390,1440]){await page.setViewportSize({width,height:900});await page.goto(base+'/m/'+room.branch_slug);await page.locator('.dish').first().waitFor();await page.evaluate(()=>document.fonts.ready);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),frame+' no overflow '+width);assert.equal(await page.locator('[data-qr],.qr,canvas').count(),0);
   const shape=await page.locator('.dish').first().evaluate(e=>({frame:document.documentElement.dataset.siteFrame,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height,textPosition:getComputedStyle(e.querySelector('.dish-text')).position,imageVisible:!!e.querySelector('img')&&getComputedStyle(e.querySelector('img')).display!=='none'}));
   if(frame==='gallery'){assert.equal(shape.textPosition,'absolute');assert.ok(shape.height>shape.width,'gallery portrait photo tiles');}
   if(frame==='ledger'){assert.equal(shape.imageVisible,false,'typographic menu has no image');assert.ok(shape.width>shape.height);}
   if(frame==='market')assert.equal(shape.textPosition,'static');
   await page.screenshot({path:`${out}/${frame}-menu-${width}.png`});results.push({frame,width,shape});
  }
  await page.goto(base+'/p/'+room.org_slug);await page.locator('.site-home').waitFor();assert.equal(await page.locator('[contenteditable]').count(),0);await page.locator('.site-hero a[href^="/m/"]').first().click();await page.locator('.dish').first().waitFor();
 }
 await page.goto(base+'/m/'+room.branch_slug+'?lang=en');await page.locator('.dish').first().waitFor();assert.equal(await page.locator('html').getAttribute('dir'),'ltr');await page.emulateMedia({reducedMotion:'reduce'});assert.deepEqual(errors,[]);
 await writeFile(out+'/results.json',JSON.stringify({results,errors},null,2));console.log('PASS four distinct public menu structures at390/1440; homepage-to-menu, LTR, public isolation');
}finally{await browser.close();}
