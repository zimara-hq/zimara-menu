import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const base=process.argv[2]||'http://127.0.0.1:8787',out=process.argv[3]||'output/tenant-studio';mkdirSync(out,{recursive:true});
const browser=await chromium.launch(),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));const pass=s=>{checks.push(s);console.log('PASS',s)};
const call=async(method,path,body)=>{const r=await page.request.fetch(base+path,{method,...(body?{data:body}:{})});assert.ok(r.ok(),path+' '+r.status()+' '+await r.text());return r.json();};
try{
 await page.goto(base+'/demo');const room=await call('POST','/api/demo',{});await call('POST','/api/demo/'+room.token+'/session',{role:'owner'});
 await page.goto(base+'/app#design');await page.locator('.design-card').first().waitFor();
 await page.locator('#st-replace-content').check();await page.locator('[data-use=latte-classic]').click();await page.locator('.design-card.current').waitFor();
 await page.locator('[data-tab=home]').click();await page.locator('#wb-add').click();await page.locator('#wb-add-dialog [data-add-block=faq]').click();const faq=page.locator('[data-editor-block]').last();await faq.locator('[data-add-item]').click();await faq.locator('[data-edit$="items.0.title_ar"]').fill('كيف أزوركم؟');await faq.locator('[data-edit$="items.0.body_ar"]').fill('أوقاتنا وموقعنا في هذه الصفحة.');
 const hero=page.locator('[data-editor-block]').first();await page.locator('[data-select-block]').first().click();await hero.scrollIntoViewIfNeeded();if(!await hero.evaluate(el=>el.open))await hero.locator('summary').click();await hero.locator('[data-edit$="title_ar"]').fill('رواق، تجربة تستحق وقتك');await hero.locator('[data-edit$="body_ar"]').fill('رئيسية خاصة وليست نسخة من المنيو.');
 await page.locator('#st-save').click();await page.getByText('حُفظت المسودة.',{exact:true}).waitFor();
 const guest=await browser.newPage({viewport:{width:390,height:844}});guest.on('pageerror',e=>errors.push(e.message));
 await guest.goto(base+'/p/'+room.org_slug);assert.equal(await guest.getByText('رواق، تجربة تستحق وقتك',{exact:true}).count(),0);
 await page.locator('[data-tab=menu]').click();await page.locator('[data-edit="menu.title_ar"]').fill('قائمة رواق المختارة');await page.locator('[data-edit="menu.announcement_ar"]').fill('قهوة اليوم تُحضّر بعناية');await page.locator('[data-edit="menu.search"]').uncheck();await page.locator('#st-publish').click();await page.getByText('نشرنا تصميمك.',{exact:false}).waitFor();
 await guest.reload();await guest.getByRole('heading',{name:'رواق، تجربة تستحق وقتك'}).waitFor();await guest.getByText('كيف أزوركم؟').click();await guest.getByText('أوقاتنا وموقعنا في هذه الصفحة.').waitFor();assert.equal(await guest.locator('.qr').count(),0);await guest.screenshot({path:out+'/home-mobile.png',fullPage:true});
 await guest.goto(base+'/m/'+room.branch_slug);await guest.getByRole('heading',{name:'قائمة رواق المختارة'}).waitFor();await guest.getByText('قهوة اليوم تُحضّر بعناية').waitFor();assert.equal(await guest.locator('#q').isVisible(),false);
 pass('merchant builds homepage content and FAQ, independently edits menu, and publishes both without leaking draft or pager QR');
 await page.locator('[data-tab=home]').click();await page.frameLocator('#st-frame').locator('h1').filter({hasText:'رواق، تجربة تستحق وقتك'}).waitFor();await page.locator('[data-preview-width="1160"]').click();await page.screenshot({path:out+'/builder-desktop.png',fullPage:false});
 const catalog=await call('GET','/api/owner/design');const geometry=[];
 for(const index of [0,12,24,36,48,50,64,72,88,99]){
  const preset=catalog.presets[index];await call('POST','/api/owner/design/presets/'+preset.id+'/apply',{});await call('POST','/api/owner/design/publish',{});
  await guest.setViewportSize({width:1200,height:900});await guest.goto(base+'/m/'+room.branch_slug);await guest.locator('.dish').first().waitFor();assert.equal(await guest.evaluate(()=>document.documentElement.dataset.siteFrame),preset.recipe.composition.frame);
  geometry.push(await guest.locator('.dish').first().evaluate(el=>({width:Math.round(el.getBoundingClientRect().width),height:Math.round(el.getBoundingClientRect().height),direction:getComputedStyle(el).flexDirection})));
  await guest.screenshot({path:out+'/menu-'+preset.recipe.composition.frame+'.png',fullPage:true});
  await guest.setViewportSize({width:390,height:844});await guest.reload();await guest.locator('.dish').first().waitFor();assert.equal(await guest.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'overflow '+preset.id);
 }
 assert.ok(new Set(geometry.map(x=>JSON.stringify(x))).size>=6);pass('ten actual menu frames render distinct geometry and fit mobile');
 await page.goto(base+'/app#branches');await page.locator('.staff-permissions').first().locator('summary').click();const permissions=page.locator('.staff-permissions form').first();await permissions.locator('[name=tickets_cancel]').uncheck();await permissions.locator('[type=submit]').click();await page.getByRole('button',{name:'حفظ الصلاحيات',exact:true}).last().click();await permissions.getByText('حُفظت الصلاحيات.',{exact:false}).waitFor();
 pass('owner changes and persists cashier permissions through the real confirmation flow');
 assert.deepEqual(errors,[]);writeFileSync(out+'/results.json',JSON.stringify({base,checks,geometry,errors},null,2));
}finally{await browser.close();}
