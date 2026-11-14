// Catches dropped merchandising fields, upload variants, schedule persistence and leaked layout drafts.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const base=process.argv[2]||'http://127.0.0.1:8793',out=process.argv[3]||'output/playwright/next-menu';mkdirSync(out,{recursive:true});
const browser=await chromium.launch(),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const call=async(method,path,data)=>{const r=await page.request.fetch(base+path,{method,...(data?{data}:{})});assert.ok(r.ok(),path+' '+r.status()+' '+await r.text());return r.json();};
try{
 await page.goto(base+'/demo');const room=await call('POST','/api/demo',{});await call('POST','/api/demo/'+room.token+'/session',{role:'owner'});
 await page.goto(base+'/app#menu');await page.locator('[data-item-edit]').first().click();
 let form=page.locator('form[data-item]').first();await form.locator('details').filter({has:page.locator('[data-merchandising]')}).locator('summary').click();await form.locator('[data-dietary="gluten_free"]').check({timeout:3000});
 const before=await call('GET','/api/owner/menu'),item=before.items[0],complement=before.items.find(i=>i.id!==item.id);
 // Ordinary editing must preserve seeded relative artwork without forcing a replacement upload.
 assert.ok(item.gallery[0].url.startsWith('/menu-art/'),'sample relative artwork fixture');
 await Promise.all([page.waitForResponse(r=>r.url().includes('/api/owner/items/')&&r.request().method()==='PATCH'),form.locator('button[type=submit]').click()]);
 assert.deepEqual((await call('GET','/api/owner/menu')).items.find(i=>i.id===item.id).gallery,item.gallery,'ordinary save preserves all gallery URLs and variants');
 await page.reload();await page.locator('[data-item-edit]').first().click();form=page.locator('form[data-item]').first();await form.locator('details').filter({has:page.locator('[data-merchandising]')}).locator('summary').click();
 await form.locator('[data-complement]').first().selectOption(complement.id);
 // Generate a real source image; upload must use existing storage and produce real resized files.
 const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=1200;c.height=800;c.getContext('2d').fillRect(0,0,1200,800);return c.toDataURL('image/png').split(',')[1];});
 await form.locator('[data-gallery-upload]').first().setInputFiles({name:'owner-gallery.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
 await form.locator('[data-gallery-status]').first().filter({hasText:'حفظ'}).waitFor();
 await Promise.all([page.waitForResponse(r=>r.url().includes('/api/owner/items/')&&r.request().method()==='PATCH'),form.locator('button[type=submit]').click()]);
 let saved=(await call('GET','/api/owner/menu')).items.find(i=>i.id===item.id);
 assert.deepEqual(saved.dietary,['gluten_free']);assert.deepEqual(saved.complementary_ids,[complement.id]);assert.deepEqual(saved.gallery[0].variants.map(v=>v.width),[320,640,960]);
 for(const variant of saved.gallery[0].variants)assert.equal(await page.evaluate(url=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image.naturalWidth);image.onerror=reject;image.src=url;}),variant.url),variant.width,'actual uploaded width');
 for(const key of ['name_ar','name_en','price','calories','options','active'])assert.deepEqual(saved[key],item[key],key+' preserved');
 await page.reload();await page.locator('[data-item-edit]').first().click();form=page.locator('form[data-item]').first();assert.equal(await form.locator('[data-dietary="gluten_free"]').isChecked(),true);assert.equal(await form.locator('[data-complement]').first().inputValue(),complement.id);
 await form.locator('details').filter({has:page.locator('[data-merchandising]')}).locator('summary').click();assert.ok(saved.gallery[0].url.startsWith('/api/assets/'),'uploaded asset uses existing relative API path');
 await Promise.all([page.waitForResponse(r=>r.url().includes('/api/owner/items/')&&r.request().method()==='PATCH'),form.locator('button[type=submit]').click()]);assert.deepEqual((await call('GET','/api/owner/menu')).items.find(i=>i.id===item.id).gallery,saved.gallery,'ordinary save preserves uploaded API asset and variants');
 await page.locator('details').filter({has:page.locator('[data-schedule-branch]')}).locator('summary').click();const schedule=page.locator('[data-category-schedule]').first();await schedule.locator('[data-schedule-day="5"]').check();await schedule.locator('[name=start]').fill('22:00');await schedule.locator('[name=end]').fill('02:00');await schedule.locator('button[type=submit]').click();await schedule.locator('[role=status]').filter({hasText:'حُفظ'}).waitFor();
 await page.reload();await page.locator('details').filter({has:page.locator('[data-schedule-branch]')}).locator('summary').click();const restored=page.locator('[data-category-schedule]').first();assert.equal(await restored.locator('[name=start]').inputValue(),'22:00');assert.equal(await restored.locator('[name=end]').inputValue(),'02:00');assert.equal(await restored.locator('[data-schedule-day="5"]').isChecked(),true);
 await restored.locator('[data-schedule-clear]').click();await restored.locator('[role=status]').filter({hasText:'أزيل'}).waitFor();
 await page.screenshot({path:out+'/owner-controls.png'});
 const design=await call('GET','/api/owner/design');await call('POST','/api/owner/design/presets/'+design.presets[0].id+'/apply',{});await call('POST','/api/owner/design/publish',{});const oldLayout=(await call('GET','/api/owner/design')).published.layout,target=oldLayout==='text'?'grid':'text';
 await page.goto(base+'/app?studio=menu#design');await page.locator('[data-menu-layout]').selectOption(target);await page.locator('#st-save').click();await page.getByText('حُفظت المسودة.',{exact:true}).waitFor();
 assert.equal((await call('GET','/api/public/menu/'+room.branch_slug)).design.layout,oldLayout,'draft private');
 await page.locator('#st-publish').click();await page.getByText('نشرنا تصميمك.',{exact:false}).waitFor();assert.equal((await call('GET','/api/public/menu/'+room.branch_slug)).design.layout,target);
 const guest=await browser.newPage();await guest.goto(base+'/m/'+room.branch_slug);await guest.locator('.dish').first().waitFor();assert.equal(await guest.evaluate(()=>document.documentElement.dataset.dLayout),target);await guest.close();
 const foreign=await browser.newContext(),foreignRequest=foreign.request;const foreignRoomResponse=await foreignRequest.post(base+'/api/demo',{data:{}}),foreignRoom=await foreignRoomResponse.json();await foreignRequest.post(base+'/api/demo/'+foreignRoom.token+'/session',{data:{role:'owner'}});const foreignMenu=await (await foreignRequest.get(base+'/api/owner/menu')).json(),foreignBranches=await (await foreignRequest.get(base+'/api/owner/branches')).json(),ownBranches=await call('GET','/api/owner/branches');
 for(const [method,path,data] of [['PATCH','/api/owner/items/'+item.id,{complementary_ids:[foreignMenu.items[0].id]}],['PUT','/api/owner/branches/'+foreignBranches.branches[0].id+'/menu-schedules/'+before.categories[0].id,{schedule:{days:[5],start:'22:00',end:'02:00'}}],['PUT','/api/owner/branches/'+ownBranches.branches[0].id+'/menu-schedules/'+foreignMenu.categories[0].id,{schedule:{days:[5],start:'22:00',end:'02:00'}}]]){const denied=await page.request.fetch(base+path,{method,data});assert.ok([400,403,404].includes(denied.status()),'foreign selection rejected '+path);}await foreign.close();
 assert.deepEqual(errors,[]);await page.screenshot({path:out+'/owner-studio-layout.png'});writeFileSync(out+'/owner-results.json',JSON.stringify({checks:['ordinary relative artwork save/reload','ordinary relative API asset save/reload','real gallery upload variants','explicit dietary and complement persistence','existing fields preserved','overnight schedule persistence and clear','private draft and published layout','foreign complement/branch/category rejected'],errors},null,2));console.log('PASS owner phase1 controls');
}finally{await browser.close();}
