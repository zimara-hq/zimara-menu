import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';

// Actual dashboard modules and DOM; API fixtures keep this regression isolated and offline.
const browser=await chromium.launch();
try {
  const page=await browser.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const category={id:'category-1',name_ar:'قهوة',name_en:'Coffee',sort:0,active:1};
  const item={id:'item-1',category_id:category.id,name_ar:'لاتيه',name_en:'Latte',price:1600,active:1};
  let menuReads=0;
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin!=='http://subscriber.test') return route.abort();
    if(url.pathname.startsWith('/api/')) {
      let json={};
      if(url.pathname==='/api/me') json={user:{id:'owner-1',role:'owner'},org:{name_ar:'مقهى',name_en:'Cafe',slug:'cafe'}};
      if(url.pathname==='/api/owner/menu') {menuReads++;json={categories:[category],items:[item]};}
      if(url.pathname==='/api/owner/branches') json={branches:[]};
      if(url.pathname==='/api/owner/categories/'+category.id) {category.active=route.request().postDataJSON().active?1:0;json={ok:true};}
      return route.fulfill({json});
    }
    const path=url.pathname==='/app'?'/app.html':url.pathname;
    try {const body=await readFile(new URL('../../public'+path,import.meta.url));return route.fulfill({body,contentType:path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':path.endsWith('.html')?'text/html':'application/octet-stream'});}
    catch {return route.fulfill({status:404,body:''});}
  });
  await page.goto('http://subscriber.test/app#menu');
  for(let round=0;round<4;round++) {
    await page.locator('[data-item-edit]').click();
    const form=page.locator('form[data-item]');
    await form.locator('details.item-more').filter({has:page.locator('[data-add-group]')}).evaluate(el=>el.open=true);
    await form.locator('[data-add-group]').click();
    assert.equal(await form.locator('.option-group-editor').count(),1,'one click adds exactly one group after '+round+' rerenders');
    await form.locator('[data-del-group]').click();
    assert.equal(await form.locator('.option-group-editor').count(),0);
    await form.locator('[data-item-cancel]').click();
    const before=menuReads;
    const oldButton=await page.locator('[data-cat-toggle]').elementHandle();
    await page.locator('[data-cat-toggle]').click();
    await page.waitForFunction(button=>!button.isConnected,oldButton);
    // Wait for replacement of the category button, which proves the rerender completed.
    await page.waitForFunction(()=>!document.querySelector('[data-cat-toggle]')?.disabled);
    assert.ok(menuReads>before);
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: add/remove option group stays single across four owner-menu rerenders; no browser errors');
} finally {await browser.close();}
