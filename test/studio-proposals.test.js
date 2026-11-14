import test from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import main from '../src/app.js';
import { makeEnv, setupOrg, client } from './helpers.js';
import { registerStudioProposals } from '../src/studio-proposals.js';
import { contrast, derived, validateRecipe } from '../src/design.js';

const api = new Hono();
registerStudioProposals(api);
api.onError((error,c)=>c.json({error:error.code||'internal_error'},error.status||500));
async function fixture(extra={}) {
  const env=makeEnv(extra),s=await setupOrg(env);
  const login=await main.request('https://menu.test/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'owner@cafe.test',password:'owner-pass-123'})},env);
  const cookie=login.headers.get('set-cookie').split(';')[0];
  const call=async (path='/api/owner/design/proposals',body={description:'مقهى هادئ قهوة',palette:[],revision:0},auth=cookie,ip='1.2.3.4')=>{
    const response=await api.request('https://menu.test'+path,{method:body===null?'GET':'POST',headers:{cookie:auth,'content-type':'application/json','cf-connecting-ip':ip},...(body===null?{}:{body:JSON.stringify(body)})},env);
    return {status:response.status,json:await response.json()};
  };
  return {env,s,call};
}
function verifyProposals(result) {
  assert.equal(result.proposals.length,3);
  assert.equal(new Set(result.proposals.map(p=>p.recipe.layout)).size,3);
  assert.equal(new Set(result.proposals.map(p=>p.recipe.composition.frame)).size,3);
  for(const p of result.proposals){
    assert.deepEqual(validateRecipe(p.recipe),p.recipe);
    const c=p.recipe.colors,d=derived(p.recipe);
    for(const bg of [c.bg,c.surface])assert.ok(contrast(c.text,bg)>=4.5);
    assert.ok(contrast(d.on_primary,c.primary)>=4.5);
    assert.ok(contrast(d.price,c.surface)>=4.5);
    for(const k of ['id','name_ar','name_en','description_ar','description_en','preset_id'])assert.equal(typeof p[k],'string');
  }
}
test('owner gets three distinct local proposals without creating a draft or publication',async()=>{
  const {env,s,call}=await fixture();
  const before=(await s.owner.get('/api/owner/design')).json;
  const response=await call();
  assert.equal(response.status,200);assert.equal(response.json.mode,'local');assert.equal(response.json.reason,'disabled');
  verifyProposals(response.json);
  const after=(await s.owner.get('/api/owner/design')).json;
  assert.deepEqual(after,before);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM org_designs').first()).n,0);
});

test('auth, revision and strict input validation reject untrusted tenant or recipe fields',async()=>{
  const {call}=await fixture();
  assert.equal((await call(undefined,undefined,'')).status,401);
  // Main app may not have the new routes registered yet; use the test router with a real cashier session.
  const {env}=await fixture();
  const login=await main.request('https://menu.test/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'hail@cafe.test',password:'branch-pass-123'})},env);
  const r=await api.request('https://menu.test/api/owner/design/proposals',{method:'POST',headers:{cookie:login.headers.get('set-cookie').split(';')[0],'content-type':'application/json'},body:JSON.stringify({description:'x',palette:[],revision:0})},env);
  assert.equal(r.status,403);
  for(const body of [{description:'x',palette:[],revision:1},{description:'x',palette:[],revision:0,org_id:'foreign'},{description:'x',palette:[],revision:0,css:'body{}'},{description:'x'.repeat(401),palette:[],revision:0},{description:'x',palette:['red;}'],revision:0},{description:'x',palette:Array(6).fill('#ffffff'),revision:0},{description:'x',palette:[],revision:0.5}]){
    assert.equal((await call(undefined,body)).status,body.revision===1?409:400);
  }
});

test('local bilingual keyword and palette matching preserve disabled HOME content and menu choices',async()=>{
  const {s,call}=await fixture();
  const studio=(await s.owner.get('/api/owner/design')).json;
  const {derived:_,...draft}=studio.draft;
  draft.home={enabled:false,footer_ar:'خاص',footer_en:'Private',blocks:[{id:'story',type:'text',title_ar:'حكايتي',body_en:'Our real story'}]};
  draft.menu={...draft.menu,title_en:'Our menu',prices:false,search:false,cart:'bottom'};
  assert.equal((await s.owner.put('/api/owner/design/draft',{recipe:draft,revision:0})).status,200);
  const before=(await s.owner.get('/api/owner/design')).json;
  for(const description of ['برجر سماش أحمر','red smash burger']){
    const result=await call(undefined,{description,palette:['#777777','#e8b54c','#000000','#ffffff','#777777'],revision:before.revision});
    assert.equal(result.status,200);assert.equal(result.json.proposals[0].preset_id,'smash-classic');
    verifyProposals(result.json);
    for(const p of result.json.proposals){assert.deepEqual(p.recipe.home,before.draft.home);assert.deepEqual(p.recipe.menu,before.draft.menu);}
  }
  const paletteOnly=await call(undefined,{description:'',palette:['#943d59'],revision:before.revision});
  assert.equal(paletteOnly.json.proposals[0].preset_id,'rose-grid');
  assert.deepEqual((await s.owner.get('/api/owner/design')).json,before);
  assert.equal((await call(undefined,{description:'x',palette:[],revision:0})).status,409);
});

const validAI={proposals:[{preset_id:'charcoal-grid',palette:['#777777']},{preset_id:'latte-classic',palette:['#004411']},{preset_id:'croissant-photo',palette:[]}]};
function provider(reply,calls){return async(url,init)=>{
  calls.push({url:String(url),body:JSON.parse(init.body),signal:init.signal});
  return new Response(JSON.stringify({id:'msg_test',type:'message',role:'assistant',model:'claude-opus-5-5',stop_reason:'end_turn',content:[{type:'text',text:typeof reply==='string'?reply:JSON.stringify(reply)}],usage:{input_tokens:1,output_tokens:1}}),{headers:{'content-type':'application/json'}});
};}
test('AI requires an explicit flag and key, reports readiness honestly, and never calls for demo rooms',async()=>{
  for(const extra of [{ANTHROPIC_API_KEY:'test-key'},{STUDIO_AI_ENABLED:'false',ANTHROPIC_API_KEY:'test-key'},{STUDIO_AI_ENABLED:'true'}]){
    let calls=0;
    const {call}=await fixture({...extra,ANTHROPIC_FETCH:()=>{calls++;throw new Error('must not call');}});
    const config=await call('/api/owner/design/proposals/config',null);
    assert.equal(config.status,200);assert.equal(config.json.ready,false);
    assert.equal(config.json.reason,extra.STUDIO_AI_ENABLED==='true'?'missing_api_key':'disabled');
    const r=await call();assert.equal(r.json.mode,'local');assert.equal(r.json.reason,config.json.reason);assert.equal(calls,0);
  }
  const {env,s,call}=await fixture({STUDIO_AI_ENABLED:'1',ANTHROPIC_API_KEY:'test-key',ANTHROPIC_FETCH:()=>{throw new Error('must not call');}});
  const owner=await env.DB.prepare("SELECT id,org_id FROM users WHERE role='owner'").first();
  const cashier=await env.DB.prepare("SELECT id FROM users WHERE role='branch'").first();
  await env.DB.prepare('INSERT INTO demo_rooms(id,token_hash,org_id,branch_id,owner_id,cashier_id,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)').bind('demo','hash',owner.org_id,s.branchId,owner.id,cashier.id,Date.now(),Date.now()+60000).run();
  assert.equal((await call('/api/owner/design/proposals/config',null)).json.reason,'demo_room');
  const result=await call();assert.equal(result.json.mode,'local');assert.equal(result.json.reason,'demo_room');verifyProposals(result.json);
});

test('mocked AI chooses only bounded preset IDs and colors, preserving draft and making no tenant disclosure',async()=>{
  const calls=[],{call,s}=await fixture({STUDIO_AI_ENABLED:'true',ANTHROPIC_API_KEY:'test-key',ANTHROPIC_FETCH:provider(validAI,calls)});
  const before=(await s.owner.get('/api/owner/design')).json;
  const config=await call('/api/owner/design/proposals/config',null);assert.equal(config.json.ready,true);
  const result=await call();assert.equal(result.json.mode,'ai');verifyProposals(result.json);
  assert.equal(result.json.proposals[0].preset_id,'charcoal-grid');
  assert.equal(calls.length,1);assert.match(calls[0].url,/^https:\/\/api.anthropic.com\//);
  assert.ok(calls[0].signal instanceof AbortSignal);
  const sent=calls[0].body;assert.equal(sent.output_config.format.type,'json_schema');
  assert.ok(sent.max_tokens<=2000);assert.ok(!JSON.stringify(sent).includes('owner@cafe.test'));
  assert.deepEqual((await s.owner.get('/api/owner/design')).json,before);
});

test('malformed, malicious or failed provider responses fall back locally with redacted reasons',async()=>{
  for(const reply of ['not JSON',{proposals:[]},{proposals:[...validAI.proposals.slice(0,2),{preset_id:'foreign',palette:[]}]},{proposals:validAI.proposals.map(p=>({...p,css:'body{display:none}'}))},{proposals:validAI.proposals.map(p=>({...p,palette:['red;'] }))},{proposals:Array(3).fill(validAI.proposals[0])}]){
    const calls=[],{call}=await fixture({STUDIO_AI_ENABLED:'true',ANTHROPIC_API_KEY:'test-key',ANTHROPIC_FETCH:provider(reply,calls)});
    const result=await call();assert.equal(result.status,200);assert.equal(result.json.mode,'local-fallback');assert.equal(result.json.reason,'invalid_ai_result');verifyProposals(result.json);assert.equal(calls.length,1);
  }
  let attempts=0;
  const {call}=await fixture({STUDIO_AI_ENABLED:'true',ANTHROPIC_API_KEY:'test-key',ANTHROPIC_FETCH:()=>{attempts++;throw new Error('secret provider failure test-key');}});
  const result=await call();assert.equal(result.json.mode,'local-fallback');assert.equal(result.json.reason,'ai_unavailable');assert.ok(!JSON.stringify(result.json).includes('test-key'));assert.equal(attempts,1);
});

test('a tenant receives only its own draft and cannot select another organization',async()=>{
  const {env,s,call}=await fixture();
  const created=await s.admin.post('/api/admin/orgs',{name_ar:'المنشأة الأخرى',name_en:'Other business',owner:{email:'other@cafe.test',name:'Other',password:'other-owner-pass'}});
  assert.equal(created.status,201);
  const other=client(env,'8.8.8.8');await other.login('other@cafe.test','other-owner-pass');
  const studio=(await other.get('/api/owner/design')).json;
  const {derived:_,...recipe}=studio.draft;
  recipe.home={enabled:true,footer_en:'OTHER TENANT PRIVATE FOOTER',blocks:[{id:'secret',type:'text',body_en:'Other tenant secret content'}]};
  await other.put('/api/owner/design/draft',{recipe,revision:0});
  await other.post('/api/owner/design/publish',{});
  const otherBefore=(await other.get('/api/owner/design')).json;
  const result=await call();verifyProposals(result.json);
  assert.ok(!JSON.stringify(result.json).includes('Other tenant'));
  const request=await call(undefined,{description:'x',palette:[],revision:otherBefore.revision,org_id:created.json.id});assert.equal(request.status,400);
  assert.deepEqual((await other.get('/api/owner/design')).json,otherBefore);
  assert.equal((await s.owner.get('/api/owner/design')).json.revision,0);
});

test('AI allowance is per org across IPs, failed attempts count, and local proposals remain available',async()=>{
  let calls=0;
  const {call}=await fixture({STUDIO_AI_ENABLED:'true',ANTHROPIC_API_KEY:'test-key',ANTHROPIC_FETCH:()=>{calls++;throw new Error('offline');}});
  for(let i=0;i<10;i++)assert.equal((await call(undefined,undefined,undefined,`10.0.0.${i}`)).json.reason,'ai_unavailable');
  const limited=await call(undefined,undefined,undefined,'9.9.9.9');assert.equal(limited.status,200);assert.equal(limited.json.mode,'local-fallback');assert.equal(limited.json.reason,'ai_rate_limited');verifyProposals(limited.json);assert.equal(calls,10);
});

test('proposal generation rate limit is per org across IPs and never modifies published design',async()=>{
  const {s,call}=await fixture();
  await s.owner.post('/api/owner/design/presets/mocha-luxe/apply',{});
  await s.owner.post('/api/owner/design/publish',{});
  const before=(await s.owner.get('/api/owner/design')).json;
  for(let i=0;i<30;i++)assert.equal((await call(undefined,{description:'coffee',palette:[],revision:before.revision},undefined,`10.0.0.${i}`)).status,200);
  const response=await call(undefined,{description:'coffee',palette:[],revision:before.revision},undefined,'8.8.4.4');assert.equal(response.status,429);
  assert.deepEqual((await s.owner.get('/api/owner/design')).json,before);
});

test('a draft changed while AI is running yields a revision conflict without overwriting the newer content',async()=>{
  let onProvider;
  const entered=new Promise(resolve=>onProvider=resolve);
  let release;
  const wait=new Promise(resolve=>release=resolve);
  const {s,call}=await fixture({STUDIO_AI_ENABLED:'true',ANTHROPIC_API_KEY:'test-key',ANTHROPIC_FETCH:async(...args)=>{onProvider();await wait;return provider(validAI,[])(...args);}});
  const pending=call();await entered;
  const {derived:_,...recipe}=(await s.owner.get('/api/owner/design')).json.draft;
  recipe.menu.title_en='Newer merchant edit';
  await s.owner.put('/api/owner/design/draft',{recipe,revision:0});
  const before=(await s.owner.get('/api/owner/design')).json;
  release();const result=await pending;assert.equal(result.status,409);assert.equal(result.json.error,'design_conflict');
  assert.deepEqual((await s.owner.get('/api/owner/design')).json,before);
});

test('Arabic and English calm earth requests use warm colors and calmer authored compositions',async()=>{
  const {call}=await fixture();
  for(const description of ['كافيه هادي بألوان ترابية','a calm cafe in earthy brown colors']){
    const response=await call(undefined,{description,palette:[],revision:0});
    assert.equal(response.status,200);assert.equal(response.json.mode,'local');verifyProposals(response.json);
    const first=response.json.proposals[0].recipe;
    assert.equal(first.colors.primary,'#6b4f36');assert.equal(first.colors.bg,'#f5efe4');
    assert.equal(first.composition.frame,'atelier');assert.equal(first.layout,'list');
    assert.equal(first.composition.density,'airy');assert.ok(first.typography.heading_scale<=140);
  }
});

test('bilingual bold and luxury preferences change the actual composition and menu layout',async()=>{
  const {call}=await fixture();
  for(const description of ['كافيه جريء','bold cafe']){
    const response=await call(undefined,{description,palette:[],revision:0});verifyProposals(response.json);
    const recipe=response.json.proposals[0].recipe;
    assert.equal(recipe.composition.frame,'split');assert.equal(recipe.layout,'cards');
    assert.ok(recipe.typography.heading_scale>135);
  }
  for(const description of ['كافيه فاخر','luxury cafe']){
    const response=await call(undefined,{description,palette:[],revision:0});verifyProposals(response.json);
    const recipe=response.json.proposals[0].recipe;
    assert.equal(recipe.composition.frame,'boutique');assert.equal(recipe.layout,'elegant');
    assert.equal(recipe.composition.media,'portrait');
  }
  for(const description of ['تصميم بسيط باللون الأخضر','minimal design in green']){
    const response=await call(undefined,{description,palette:[],revision:0});verifyProposals(response.json);
    assert.equal(response.json.proposals[0].recipe.colors.primary,'#315c3b');
  }
});

test('explicit logo colors override inferred prose colors and each proposal describes its real frame and layout',async()=>{
  const {call}=await fixture();
  for(const description of ['كافيه هادي بألوان ترابية','calm earthy brown cafe']){
    const response=await call(undefined,{description,palette:['#27577a','#729a9b','#eef4f3','#ffffff','#18333f'],revision:0});
    verifyProposals(response.json);
    for(const proposal of response.json.proposals){assert.equal(proposal.recipe.colors.primary,'#27577a');assert.equal(proposal.recipe.colors.bg,'#eef4f3');}
    assert.equal(new Set(response.json.proposals.map(p=>p.description_ar)).size,3);
    assert.equal(new Set(response.json.proposals.map(p=>p.description_en)).size,3);
    const first=response.json.proposals[0];
    assert.equal(first.recipe.composition.frame,'atelier');assert.equal(first.recipe.layout,'list');
    assert.equal(first.description_en,'Atelier frame with a list menu.');
    assert.equal(first.description_ar,'إطار مشغل مع قائمة صفوف.');
  }
});

test('an explicit logo palette also takes precedence over provider color suggestions',async()=>{
  const calls=[],{call}=await fixture({STUDIO_AI_ENABLED:'true',ANTHROPIC_API_KEY:'test-key',ANTHROPIC_FETCH:provider(validAI,calls)});
  const response=await call(undefined,{description:'calm green cafe',palette:['#27577a','#729a9b','#eef4f3','#ffffff','#18333f'],revision:0});
  assert.equal(response.json.mode,'ai');verifyProposals(response.json);
  for(const proposal of response.json.proposals){assert.equal(proposal.recipe.colors.primary,'#27577a');assert.equal(proposal.recipe.colors.bg,'#eef4f3');}
  assert.equal(calls.length,1);
});
