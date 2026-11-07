import test from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { createD1 } from './d1.js';
import { createSession } from '../src/auth.js';

// Real isolated router: a missing seasonal registration cannot hide behind app changes.
const backend = await import('../src/seasons.js');
async function fixture() {
  const env={DB:createD1(),AUTH_SECRET:'season-test-secret',ADMIN_MFA_REQUIRED:'false'};
  for (const id of ['one','two']) {
    await env.DB.prepare('INSERT INTO orgs(id,slug,name_ar,name_en,created_at) VALUES(?,?,?,?,0)').bind(id,id,id,id).run();
    await env.DB.prepare('INSERT INTO branches(id,org_id,slug,name_ar,name_en,created_at) VALUES(?,?,?,?,?,0)').bind('branch-'+id,id,id,id,id).run();
    await env.DB.prepare('INSERT INTO categories(id,org_id,name_ar,name_en) VALUES(?,?,?,?)').bind('cat-'+id,id,id,id).run();
  }
  const tokens={};
  for(const [id,role,org,branch] of [['owner','owner','one',null],['other','owner','two',null],['cashier','branch','one','branch-one'],['admin','admin',null,null]]) {
    await env.DB.prepare("INSERT INTO users(id,email,name,role,org_id,branch_id,password_hash,created_at) VALUES(?,?,?,?,?,?,'unused',0)").bind(id,id+'@test.local',id,role,org,branch).run();
    tokens[id]=await createSession(env,id,true);
  }
  const app=new Hono(); app.onError((e,c)=>c.json({error:e.code||e.message},e.status||500));
  backend.registerSeasons(app);
  async function call(path,method='GET',data,who='owner') {
    const res=await app.request('https://test.local'+path,{method,headers:{'content-type':'application/json',...(who?{cookie:'zm_session='+tokens[who]}:{})},...(data===undefined?{}:{body:JSON.stringify(data)})},env);
    let json;try {json=await res.json();}catch{} return {status:res.status,json};
  }
  return {env,call};
}
const config=(extra={})=>({mode:'manual',manual_id:'ramadan',enabled_ids:['ramadan'],overrides:{},branches:[{branch_id:'branch-one',city:'riyadh',periods:[{kind:'iftar',start:'18:00',end:'23:00',category_ids:['cat-one']}]}],...extra});
const at=s=>Date.parse(s+'+03:00');

test('owner config is opt-in, scoped, revisioned and only explicit saves mutate it',async()=>{
  const {env,call}=await fixture();
  const initial=await call('/api/owner/seasons');assert.equal(initial.status,200);assert.equal(initial.json.revision,0);assert.equal(initial.json.config.mode,'off');
  assert.deepEqual(initial.json.branches.map(b=>b.id),['branch-one']);assert.deepEqual(initial.json.categories.map(b=>b.id),['cat-one']);
  assert.equal(await backend.publicSeason(env,'one','branch-one'),null);
  const saved=await call('/api/owner/seasons','PUT',{revision:0,config:config()});assert.equal(saved.status,200);assert.equal(saved.json.revision,1);
  assert.equal((await call('/api/owner/seasons','PUT',{revision:0,config:config({mode:'off'})})).status,409);
  assert.equal((await call('/api/owner/seasons','PUT',{revision:1,config:config({mode:'off'})})).status,200);
  assert.equal(await backend.publicSeason(env,'one','branch-one'),null);
  assert.equal((await call('/api/owner/seasons','GET',undefined,'other')).json.revision,0);
  assert.equal((await call('/api/owner/seasons','GET',undefined,'cashier')).status,403);
  assert.equal((await call('/api/owner/seasons','GET',undefined,null)).status,401);
});

test('manual, auto, protected preview and return-to-base use distinct semantics',async()=>{
  const {env,call}=await fixture();
  await call('/api/owner/seasons','PUT',{revision:0,config:config()});
  const manual=await backend.publicSeason(env,'one','branch-one',at('2026-07-01T19:00:00'));
  assert.equal(manual.id,'ramadan');assert.equal(manual.mode,'manual');assert.equal(manual.calendar_active,false);assert.equal(manual.preview,false);
  assert.equal(manual.periods[0].active_now,true);assert.equal(manual.periods[0].source,'merchant');
  assert.equal(await backend.publicSeason(env,'one','branch-two',at('2026-07-01T19:00:00')),null);
  await call('/api/owner/seasons','PUT',{revision:1,config:config({mode:'auto'})});
  assert.equal(await backend.publicSeason(env,'one','branch-one',at('2026-07-01T19:00:00')),null);
  const ramadan=await backend.publicSeason(env,'one','branch-one',at('2026-02-20T19:00:00'));assert.equal(ramadan.id,'ramadan');
  await call('/api/owner/seasons','PUT',{revision:2,config:config({mode:'off'})});
  const preview=await call('/api/owner/seasons/preview?occasion=ramadan&branch_id=branch-one');assert.equal(preview.status,200);assert.equal(preview.json.season.preview,true);
  assert.equal((await call('/api/owner/seasons/preview?occasion=ramadan&branch_id=branch-two')).status,404);
  assert.equal(await backend.publicSeason(env,'one','branch-one'),null);
});

test('season category windows union matching periods and carry overnight service to the next day',async()=>{
  const {env,call}=await fixture();
  const c=config();c.branches[0].periods=[{kind:'iftar',start:'22:00',end:'02:00',category_ids:['cat-one']},{kind:'suhoor',start:'03:00',end:'05:00',category_ids:['cat-one']}];
  assert.equal((await call('/api/owner/seasons','PUT',{revision:0,config:c})).status,200);
  for(const [time,expected] of [['23:00',true],['01:00',true],['02:00',false],['04:00',true],['12:00',false]]) assert.equal(await backend.seasonCategoryAvailable(env,'one','branch-one','cat-one',at('2026-02-20T'+time+':00')),expected,time);
  assert.equal(await backend.seasonCategoryAvailable(env,'one','branch-one','unattached',at('2026-02-20T12:00:00')),true);
  await call('/api/owner/seasons','PUT',{revision:1,config:config({mode:'off'})});
  assert.equal(await backend.seasonCategoryAvailable(env,'one','branch-one','cat-one',at('2026-02-20T12:00:00')),true);
});

test('default Ramadan windows use the selected city and calculated labels',async()=>{
  const {env,call}=await fixture(); const c=config();c.branches[0].periods=[{kind:'iftar',start:null,end:null,category_ids:[]},{kind:'suhoor',start:null,end:null,category_ids:[]}];
  assert.equal((await call('/api/owner/seasons','PUT',{revision:0,config:c})).status,200);
  const s=await backend.publicSeason(env,'one','branch-one',at('2026-02-20T20:00:00'));
  assert.equal(s.city,'riyadh');assert.equal(s.periods[0].end,'23:59');assert.equal(s.periods[1].start,'00:00');assert.equal(s.periods[0].source,'calculated');assert.match(s.periods[1].end,/^\d\d:\d\d$/);
});

test('strict validation rejects foreign and disabled references, unbounded inputs and free markup',async()=>{
  const {env,call}=await fixture();
  const invalid=[config({mode:'bad'}),config({enabled_ids:['unknown']}),config({overrides:{ramadan:{banner_ar:'<svg>'}}}),config({css:'red'}),config({branches:[{branch_id:'branch-two',city:'riyadh',periods:[]}]}),config({branches:[{branch_id:'branch-one',city:'unknown',periods:[]}]}),config({branches:[{branch_id:'branch-one',city:'riyadh',periods:[{kind:'iftar',start:'99:00',end:null,category_ids:[]}]}]}),config({branches:[{branch_id:'branch-one',city:'riyadh',periods:[{kind:'iftar',start:null,end:null,category_ids:['cat-two']}]}]})];
  for(const c of invalid) assert.equal((await call('/api/owner/seasons','PUT',{revision:0,config:c})).status,400,JSON.stringify(c));
  await env.DB.prepare("UPDATE categories SET active=0 WHERE id='cat-one'").run();assert.equal((await call('/api/owner/seasons','PUT',{revision:0,config:config()})).status,400);
});

test('HQ bounded custom catalogue is audited, disabled by archive and owner cannot mutate it',async()=>{
  const {env,call}=await fixture();const occasion={id:'coffee-week',name_ar:'أسبوع القهوة',name_en:'Coffee week',motif:'winter',accent:'#123456',rule:{calendar:'gregorian',month:7,day:1,duration:7},enabled:true};
  assert.equal((await call('/api/admin/seasons','POST',occasion,'owner')).status,403);
  assert.equal((await call('/api/admin/seasons','POST',{...occasion,motif:'<svg>'},'admin')).status,400);
  assert.equal((await call('/api/admin/seasons','POST',{...occasion,rule:{calendar:'gregorian',month:2,day:31,duration:1}},'admin')).status,400);
  assert.equal((await call('/api/admin/seasons','POST',occasion,'admin')).status,201);
  await call('/api/owner/seasons','PUT',{revision:0,config:config({manual_id:'coffee-week',enabled_ids:['coffee-week']})});
  assert.equal((await backend.publicSeason(env,'one','branch-one',at('2026-07-01T20:00:00'))).id,'coffee-week');
  assert.equal((await call('/api/admin/seasons/coffee-week','DELETE',undefined,'admin')).status,200);
  assert.equal(await backend.publicSeason(env,'one','branch-one',at('2026-07-01T20:00:00')),null);
  assert.ok((await env.DB.prepare("SELECT user_id FROM audit_log WHERE action='season_occasion_archived'").first()).user_id==='admin');
});

test('unsaved preview projects validated draft without persisting and dates its prayer estimates',async()=>{
  const {env,call}=await fixture();
  const c=config();c.overrides={ramadan:{banner_ar:'رسالة المسودة',banner_en:'Unsaved'}};c.branches[0].periods[0].start=null;c.branches[0].periods[0].end=null;
  const p=await call('/api/owner/seasons/preview','POST',{config:c,occasion_id:'ramadan',branch_id:'branch-one'});
  assert.equal(p.status,200);assert.equal(p.json.season.banner_en,'Unsaved');assert.equal(p.json.season.preview,true);assert.match(p.json.season.times_date,/^\d{4}-\d\d-\d\d$/);assert.equal(p.json.season.timezone,'Asia/Riyadh');
  assert.equal((await call('/api/owner/seasons')).json.revision,0);assert.equal(await backend.publicSeason(env,'one','branch-one'),null);
  assert.equal((await call('/api/owner/seasons/preview','POST',{config:c,occasion_id:'ramadan',branch_id:'branch-two'})).status,404);
});

test('periods only restrict their occasion and default seasonal service covers every minute',async()=>{
  const {env,call}=await fixture();const c=config({manual_id:'winter',enabled_ids:['winter']});
  c.branches[0].periods=[{occasion_id:'ramadan',kind:'iftar',start:'18:00',end:'23:00',category_ids:['cat-one']},{occasion_id:'winter',kind:'seasonal',start:null,end:null,category_ids:['cat-one']}];
  assert.equal((await call('/api/owner/seasons','PUT',{revision:0,config:c})).status,200);
  const s=await backend.publicSeason(env,'one','branch-one',at('2026-12-20T23:59:00'));assert.equal(s.periods.length,1);assert.equal(s.periods[0].full_day,true);
  assert.equal(await backend.seasonCategoryAvailable(env,'one','branch-one','cat-one',at('2026-12-20T23:59:00')),true);
});

test('HQ keeps existing production MFA gate and permits bounded edits and disable',async()=>{
  const {env,call}=await fixture();env.ENVIRONMENT='production';
  assert.equal((await call('/api/admin/seasons','GET',undefined,'admin')).status,403);
  await env.DB.prepare("UPDATE users SET mfa_secret='fixture-enrolled' WHERE id='admin'").run();
  assert.equal((await call('/api/admin/seasons','GET',undefined,'admin')).status,200);
  const occasion={id:'winter-coffee',name_ar:'قهوة الشتاء',name_en:'Winter coffee',motif:'winter',accent:'#DDAA22',rule:{calendar:'gregorian',month:12,day:1,duration:90},enabled:true};
  assert.equal((await call('/api/admin/seasons','POST',occasion,'admin')).status,201);
  assert.equal((await call('/api/admin/seasons/winter-coffee','PUT',{...occasion,enabled:false},'admin')).status,200);
  assert.equal((await call('/api/admin/seasons/winter-coffee','PUT',{...occasion,accent:'url(https://evil.test)'},'admin')).status,400);
  assert.equal((await call('/api/admin/seasons/ramadan','DELETE',undefined,'admin')).status,404);
});

test('concurrent first saves have one winner and public reads do not write settings or audit rows',async()=>{
  const {env,call}=await fixture();
  const responses=await Promise.all([call('/api/owner/seasons','PUT',{revision:0,config:config()}),call('/api/owner/seasons','PUT',{revision:0,config:config({mode:'off'})})]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
  const row=await env.DB.prepare("SELECT revision,config_json,updated_at FROM org_seasons WHERE org_id='one'").first();
  const auditCount=await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action='seasons_saved'").first();assert.equal(auditCount.n,1);
  await backend.publicSeason(env,'one','branch-one',at('2026-02-20T20:00:00'));
  await backend.publicSeason(env,'one','branch-two',at('2026-02-20T20:00:00'));
  assert.deepEqual(await env.DB.prepare("SELECT revision,config_json,updated_at FROM org_seasons WHERE org_id='one'").first(),row);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action='seasons_saved'").first()).n,1);
});
