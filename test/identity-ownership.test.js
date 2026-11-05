import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, setupOrg, client } from './helpers.js';

test('a saved recipe owns presentation; legacy profile edits cannot silently lose settings', async () => {
  const env=makeEnv(), {owner,orgSlug,branchSlug}=await setupOrg(env);
  assert.equal((await owner.patch('/api/owner/profile',{theme:{layout:'cards',font:'system'}})).status,200);
  await owner.post('/api/owner/design/presets/latte-classic/apply',{});
  await owner.post('/api/owner/design/publish',{});
  const before=(await owner.get('/api/owner/design')).json;
  const current=(await owner.get('/api/owner/profile')).json.profile;
  const changed=await owner.patch('/api/owner/profile',{theme:{layout:'list',font:'tajawal'},description_en:'must not partially save'});
  assert.equal(changed.status,409);
  assert.equal(changed.json.error,'design_owned_appearance');
  assert.equal((await owner.get('/api/owner/profile')).json.profile.description_en,current.description_en);
  assert.equal((await owner.patch('/api/owner/profile',{theme:current.theme,description_en:'Unchanged presentation accepted'})).status,200);
  assert.equal((await owner.patch('/api/owner/profile',{phone:'+966500000000'})).status,200);
  assert.deepEqual((await owner.get('/api/owner/design')).json,before,'legacy requests do not overwrite draft, published recipe, versions or revision');
  assert.equal((await client(env).get('/api/public/profile/'+orgSlug)).json.design.colors.primary,'#5b3a29');
  assert.equal((await client(env).get('/api/public/menu/'+branchSlug)).json.design.layout,before.published.layout);
});

test('draft ownership begins before first publication and preserves draft privacy', async()=>{
  const env=makeEnv(),{owner,orgSlug}=await setupOrg(env);
  await owner.post('/api/owner/design/presets/latte-classic/apply',{});
  const legacy=(await owner.get('/api/owner/profile')).json.profile;
  const res=await owner.patch('/api/owner/profile',{theme:{layout:legacy.theme.layout==='cards'?'list':'cards'}});
  assert.equal(res.status,409);
  assert.equal((await client(env).get('/api/public/profile/'+orgSlug)).json.design,null);
});


test('legacy saved recipes retain canonical ownership even with migration revision zero',async()=>{
 const env=makeEnv(),{owner}=await setupOrg(env);await owner.post('/api/owner/design/presets/latte-classic/apply',{});await owner.post('/api/owner/design/publish',{});await env.DB.prepare('UPDATE org_designs SET revision=0').run();
 const design=(await owner.get('/api/owner/design')).json;assert.equal(design.revision,0);assert.equal(design.owns_appearance,true);const org=(await owner.get('/api/me')).json.org;
 assert.equal((await owner.patch('/api/owner/org',{name_ar:org.name_ar,name_en:org.name_en,logo_url:org.logo_url,brand_color:'#ff0000'})).status,409);
});
