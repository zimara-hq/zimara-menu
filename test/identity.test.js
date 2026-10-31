import test from 'node:test';
import assert from 'node:assert/strict';
import {makeEnv,setupOrg,client} from './helpers.js';
import {DEFAULT_THEME,validateTheme} from '../src/identity.js';

test('identity accepts only finite presentation options and boolean switches',()=>{
 assert.deepEqual(validateTheme({layout:'cards',font:'system'}),{...DEFAULT_THEME,layout:'cards',font:'system'});
 for(const input of [null,[],{css:'body{display:none}'},{layout:'<script>'},{corners:'url(https://evil.test)'},{show_images:'false'},{font:'https://evil.test/font'}])assert.throws(()=>validateTheme(input));
});

test('tenant identity round trips publicly, merges partial updates and stays isolated',async()=>{
 const env=makeEnv(),s=await setupOrg(env);
 const other=client(env,'2.2.2.2');
 assert.equal((await other.post('/api/register',{name_ar:'منشأة أخرى',name_en:'Other',slug:'other-identity',name:'Other Owner',email:'other-identity@test.example',password:'owner-pass-123',sector:'cafe',accept_terms:true})).status,201);
 const original=(await s.owner.get('/api/owner/profile')).json.profile;
 assert.deepEqual(original.theme,DEFAULT_THEME);
 const theme={layout:'cards',corners:'square',cover:'compact',font:'system',show_images:false,show_calories:false};
 const banners=[{image_url:'https://example.org/one.webp',alt_ar:'الغلاف',alt_en:'Cover',href:null},{image_url:'https://example.org/two.webp',alt_ar:'الصورة الثانية',alt_en:'Second photo',href:'https://example.org/shop'}];
 const sections=['loyalty','social','hours','branches','menu'];
 assert.equal((await s.owner.patch('/api/owner/profile',{theme,banners,sections,social_links:[{label:'الموقع',url:'https://example.org'},{label:'الصور',url:'https://example.org/photos'}]})).status,200);
 assert.equal((await s.owner.patch('/api/owner/profile',{description_ar:'وصف محفوظ'})).status,200);
 let publicProfile=(await client(env).get('/api/public/profile/'+s.orgSlug)).json.profile;
 assert.deepEqual(publicProfile.theme,theme);assert.deepEqual(publicProfile.sections,sections);assert.deepEqual(publicProfile.banners,banners);assert.equal(publicProfile.social_links.length,2);
 assert.deepEqual((await other.get('/api/owner/profile')).json.profile.theme,DEFAULT_THEME);
 assert.equal((await s.cashier.patch('/api/owner/profile',{theme:{layout:'list'}})).status,403);
 for(const bad of [{theme:{layout:'javascript:alert(1)'}},{theme:{show_calories:0}},{theme:{raw_css:'x'}},{sections:['menu','menu']},{banners:[{image_url:'javascript:alert(1)'}]}])assert.equal((await s.owner.patch('/api/owner/profile',bad)).status,400);
 publicProfile=(await client(env).get('/api/public/profile/'+s.orgSlug)).json.profile;
 assert.deepEqual(publicProfile.theme,theme);
 const exportData=(await s.owner.get('/api/owner/data/export')).json;
 assert.deepEqual(exportData.profile.theme,theme);
});

test('branch hours preserve closed and overnight days and reject invalid input atomically',async()=>{
 const env=makeEnv(),s=await setupOrg(env);
 const hours=Array.from({length:7},(_,day)=>({day,closed:day===5,open:day===5?null:'18:00',close:day===5?null:'02:00'}));
 assert.equal((await s.owner.patch(`/api/owner/branches/${s.branchId}/settings`,{hours})).status,200);
 assert.deepEqual((await s.owner.get(`/api/owner/branches/${s.branchId}/settings`)).json.settings.hours,hours);
 assert.equal((await s.owner.patch(`/api/owner/branches/${s.branchId}/settings`,{hours:[...hours,{day:0,closed:true}]})).status,400);
 assert.deepEqual((await s.owner.get(`/api/owner/branches/${s.branchId}/settings`)).json.settings.hours,hours);
});
