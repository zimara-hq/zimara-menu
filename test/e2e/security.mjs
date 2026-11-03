import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
// Passkeys need a real hostname, so this suite uses localhost rather than 127.0.0.1.
const base=(process.argv[2]||'http://localhost:8787').replace('127.0.0.1','localhost'),out=process.argv[3]||'output/security';
mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true}),errors=[];
const pass=s=>console.log('PASS',s);
const open=async(viewport={width:1280,height:900})=>{const ctx=await browser.newContext({viewport});const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));return p;};
try{
 const owner=await open();
 // A virtual Face ID / fingerprint authenticator for this browser.
 const cdp=await owner.context().newCDPSession(owner);await cdp.send('WebAuthn.enable');
 await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}});
 await owner.goto(base+'/demo');
 const room=await owner.evaluate(async()=>(await fetch('/api/demo',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).json());
 await owner.evaluate(async token=>{await fetch('/api/demo/'+token+'/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({role:'owner'})});},room.token);
 await owner.goto(base+'/app');await owner.locator('.workspace-welcome').waitFor();
 await owner.locator('[data-k=account]').click();await owner.locator('#account-devices #pk-add').waitFor();
 assert.ok(await owner.locator('#dev-list li').count()>=1);
 await owner.locator('#pk-add').click();await owner.locator('#pk-list li').waitFor();
 pass('owner adds a passkey from the account screen');
 await owner.screenshot({path:out+'/account-security.png',fullPage:true});
 await owner.locator('#out').click();await owner.waitForURL('**/login');
 await owner.locator('#passkey-login').click();await owner.waitForURL(/\/app/);await owner.locator('[data-k=account]').waitFor();
 pass('owner signs in with the passkey, no password');
 await owner.locator('[data-k=account]').click();await owner.locator('#dev-list').waitFor();
 assert.ok(await owner.locator('#dev-list li',{hasText:'🔑'}).count()>=1);pass('the device list shows the passkey sign-in');

 // Live updates: a guest joins the waitlist and the cashier screen shows it at once.
 const cash=await open();
 await cash.goto(base+'/demo#room='+room.token+'&role=cashier');await cash.waitForURL('**/app');
 await cash.locator('[data-k=waitlist]').click();await cash.locator('#wl-board').waitFor();
 const branch=await owner.evaluate(async()=>(await (await fetch('/api/owner/branches')).json()).branches[0]);
 await owner.evaluate(async id=>fetch('/api/owner/branches/'+id+'/waitlist',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({active:true})}),branch.id);
 await cash.waitForTimeout(1500);
 const t0=Date.now();
 await owner.evaluate(async slug=>fetch('/api/public/waitlist/'+slug,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'لحظي',party:2})}),branch.slug);
 await cash.locator('.wl-row',{hasText:'لحظي'}).waitFor({timeout:4000});
 const ms=Date.now()-t0;assert.ok(ms<3000,'arrived in '+ms+'ms (polling alone takes up to 5s)');
 pass('cashier screen updates live ('+ms+' ms)');
 assert.deepEqual(errors,[]);
}finally{await browser.close();}
