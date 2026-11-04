import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const base=process.argv[2]||'http://127.0.0.1:8787',out=process.argv[3]||'output/brand-workspace';
mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[],checks=[];
page.on('pageerror',error=>errors.push(error.message));
const pass=message=>{checks.push(message);console.log('PASS',message);};
const screenshot=async name=>{await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:`${out}/${name}.png`,fullPage:true});};
try{
  await page.goto(base+'/?lang=en');
  const journey=page.locator('#journey');
  for(const [index,text] of ['Waiting for a scan','Guest linked','Ready · not acknowledged','Acknowledged · awaiting pickup','Complete · collected'].entries()){
    await journey.getByText(text,{exact:false}).first().waitFor();
    assert.equal(await journey.locator('[aria-current=step]').count(),1);
    if(index<4)await journey.locator('#journey-next').click();
  }
  await journey.locator('#journey-back').click();await journey.getByText('Acknowledged · awaiting pickup',{exact:true}).waitFor();
  await journey.locator('#journey-next').click();await journey.locator('#journey-next').click();
  assert.equal(await journey.locator('#journey-back').isDisabled(),true);
  await page.locator('#lang').click();await journey.getByRole('button',{name:'ربط العميل بمسحة'}).waitFor();
  pass('five-step illustration distinguishes linking, readiness, acknowledgment and collection in Arabic and English');
  for(const width of [360,390,768,1440]){
    await page.setViewportSize({width,height:900});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'landing width '+width);
  }
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await journey.locator('.journey-phone').evaluate(el=>getComputedStyle(el).animationName),'none');
  await page.setViewportSize({width:1440,height:1000});await journey.scrollIntoViewIfNeeded();await journey.screenshot({path:out+'/journey-ar.png'});
  await page.goto(base+'/demo');
  const room=await page.evaluate(async()=>{const r=await fetch('/api/demo',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});if(!r.ok)throw Error('demo '+r.status);return r.json();});
  await page.evaluate(async token=>fetch('/api/demo/'+token+'/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({role:'owner'})}),room.token);
  await page.goto(base+'/app#overview');await page.locator('.workspace-operations').waitFor();
  assert.equal(await page.locator('.branch-pulse article').count(),1);
  assert.match(await page.locator('.branch-pulse-tools a').first().getAttribute('href'),/^\/m\//);
  await page.locator('#workspace-find').click();await page.locator('#workspace-query').fill('الفاتورة');
  assert.equal(await page.locator('.finder-result').count(),1);
  await page.locator('#workspace-query').press('Enter');await page.locator('#panel-subscription').waitFor();
  assert.equal(await page.locator('#workspace-section').innerText(),'باقتي وفواتيري');
  await page.locator('#workspace-find').click();await page.locator('#workspace-query').fill('لايوجدقسمبهذاالاسم');await page.locator('.finder-empty').waitFor();
  await page.locator('#finder-clear').click();assert.equal(await page.locator('.finder-result').count(),18);
  await page.keyboard.press('Escape');assert.equal(await page.locator('#workspace-find').evaluate(el=>el===document.activeElement),true);
  await page.keyboard.press('Control+k');await page.locator('#workspace-query').fill('الوان');await page.locator('#workspace-query').press('ArrowDown');await page.keyboard.press('Enter');await page.locator('#identity-form').waitFor();
  pass('role-scoped finder supports Arabic normalization, task keywords, clear, empty state, keyboard activation and focus restoration');
  await page.locator('#identity-form [name=name_ar]').fill('تعديلات محفوظة في النموذج');
  await page.locator('#workspace-find').click();await page.locator('#workspace-query').fill('اشتراك');await page.locator('#workspace-query').press('Enter');
  await page.getByRole('button',{name:'متابعة التعديل',exact:true}).click();
  assert.equal(await page.locator('#identity-form [name=name_ar]').inputValue(),'تعديلات محفوظة في النموذج');
  await page.locator('[data-k=overview]').click();await page.getByRole('button',{name:'مغادرة دون حفظ',exact:true}).click();await page.locator('.workspace-operations').waitFor();
  pass('finder navigation honors the canonical unsaved-edit guard');
  await page.route('**/api/owner/stats',route=>route.fulfill({status:503,contentType:'application/json',body:'{"error":"unavailable"}'}));
  await page.reload();await page.locator('.workspace-recovery').waitFor();
  await page.unroute('**/api/owner/stats');await page.locator('[data-retry]').click();await page.locator('.workspace-operations').waitFor();
  pass('a failed dashboard API leaves navigation available and retries the actual section');
  await screenshot('workspace-ar-desktop');
  for(const width of [360,390,768,1440]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'workspace width '+width);}
  await page.setViewportSize({width:390,height:844});await screenshot('workspace-ar-mobile');
  await page.goto(base+'/app?lang=en#overview');await page.locator('.workspace-operations').waitFor();
  await page.locator('#workspace-find').click();await page.locator('#workspace-query').fill('fonts');assert.equal(await page.locator('.finder-result').count(),1);await screenshot('finder-en-mobile');await page.keyboard.press('Escape');
  await page.locator('[data-act=theme]').click();await screenshot('workspace-en-other-theme');
  pass('360–1440px, both locales, themes and reduced-motion layout checks pass');
  const cashier=await browser.newPage();cashier.on('pageerror',error=>errors.push(error.message));
  await cashier.goto(base+'/demo#room='+room.token+'&role=cashier');await cashier.waitForURL('**/app');await cashier.locator('#workspace-find').click();
  assert.equal(await cashier.locator('.finder-result').count(),8);
  await cashier.locator('#workspace-query').fill('فاتورة');assert.equal(await cashier.locator('.finder-result').count(),0);
  await cashier.close();pass('cashier navigation search excludes owner billing and branding tools');
  assert.deepEqual(errors,[]);
  writeFileSync(out+'/results.json',JSON.stringify({base,at:new Date().toISOString(),checks,errors},null,2));
}finally{await browser.close();}
