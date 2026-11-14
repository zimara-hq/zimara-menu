import test from 'node:test';
import assert from 'node:assert/strict';
import {PRESETS,validateRecipe,contrast} from '../src/design.js';
import {makeEnv,setupOrg} from './helpers.js';
import {readFileSync} from 'node:fs';

test('catalog exposes twenty authored site designs with distinct structures and local previews',async()=>{
 const s=await setupOrg(makeEnv());
 const response=await s.owner.get('/api/owner/design');
 const curated=response.json.presets.filter(p=>p.curated);
 assert.equal(curated.length,20);
 assert.equal(response.json.presets.length,100);
 assert.equal(new Set(curated.map(p=>p.recipe.home.blocks.map(b=>b.type).join(','))).size,20,'each design has its own content topology');
 assert.ok(new Set(curated.map(p=>p.recipe.composition.frame)).size>=9);
 assert.ok(new Set(curated.map(p=>p.recipe.layout)).size>=7);
 for(const p of curated){
  assert.match(p.preview_url,/^\/design-previews\/[a-z-]+\.webp$/);
  assert.deepEqual(validateRecipe(p.recipe),p.recipe);
  assert.ok(p.recipe.home.blocks.some(b=>b.type==='hero'&&b.title_ar&&b.title_en));
  assert.ok(contrast(p.recipe.colors.text,p.recipe.colors.bg)>=4.5);
 }
 assert.ok(PRESETS.find(p=>p.id==='latte-classic').curated);
});

test('curated application retains existing merchant content without reseeding it',async()=>{
 const s=await setupOrg(makeEnv());
 await s.owner.put('/api/owner/design/draft',{recipe:{home:{enabled:true,blocks:[{id:'mine',type:'text',title_ar:'محتوى التاجر',title_en:'Merchant content'}]},menu:{title_en:'Actual menu',announcement_en:'Actual announcement'}}});
 const result=await s.owner.post('/api/owner/design/presets/latte-classic/apply',{});
 assert.equal(result.status,200);
 assert.equal(result.json.draft.home.blocks.length,1);
 assert.equal(result.json.draft.home.blocks[0].id,'mine');
 assert.equal(result.json.draft.menu.title_en,'Actual menu');
 assert.equal(result.json.draft.menu.announcement_en,'Actual announcement');
});

test('each curated thumbnail is a real WebP asset served from the catalog path',()=>{
 for(const p of PRESETS.filter(p=>p.curated)){
  const data=readFileSync(new URL('../public'+p.preview_url,import.meta.url));
  assert.equal(data.toString('ascii',0,4),'RIFF');
  assert.equal(data.toString('ascii',8,12),'WEBP');
  assert.ok(data.length>2000,p.id);
 }
});

test('applying a design keeps a disabled homepage and its authored content unless replacement is explicit',async()=>{
 const s=await setupOrg(makeEnv());
 const {derived,...recipe}=(await s.owner.get('/api/owner/design')).json.draft;
 recipe.home.enabled=false;recipe.home.blocks=[{id:'kept',type:'hero',title_ar:'نص خاص محفوظ رغم تعطيل الرئيسية',title_en:'Private retained draft',visible:true}];
 const save=await s.owner.put('/api/owner/design/draft',{recipe});assert.equal(save.status,200);
 const applied=await s.owner.post('/api/owner/design/presets/latte-classic/apply',{});assert.equal(applied.status,200);
 assert.deepEqual(applied.json.draft.home,save.json.draft.home);assert.deepEqual(applied.json.draft.menu,save.json.draft.menu);
});
