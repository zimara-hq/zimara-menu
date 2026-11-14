import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as samples from '../src/sample-menu.js';
import {makeEnv,client} from './helpers.js';

test('all unchanged sample menus have distinct local responsive original art',()=>{
 assert.equal(samples.sampleItemCount('cafe'),16);
 assert.equal(samples.sampleItemCount('restaurant'),11);
 assert.equal(typeof samples.sampleItemMedia,'function','sample media helper exists');
 const urls=new Set(), drawings=new Set();
 for(const sector of ['cafe','restaurant']){
  const items=samples.sampleMenu(sector).flatMap(c=>c[2]);
  items.forEach((item,index)=>{
   const media=samples.sampleItemMedia(sector,index);
   assert.deepEqual(samples.sampleItemMedia(sector,item[1]),media);
   assert.match(media.url,/^\/menu-art\/[a-z-]+-640\.webp$/);
   assert.ok(!urls.has(media.url),item[1]+' has distinct art');urls.add(media.url);
   assert.deepEqual(media.variants.map(v=>v.width),[320,640,960]);
   for(const variant of media.variants){
    const path=new URL('../public'+variant.url,import.meta.url);
    const bytes=readFileSync(path);assert.equal(bytes.toString('ascii',8,12),'WEBP');
    assert.ok(statSync(path).size>200);
    assert.equal(bytes.toString('ascii',12,16),'VP8X');
    assert.equal(bytes.readUIntLE(24,3)+1,variant.width);
    assert.equal(bytes.readUIntLE(27,3)+1,Math.round(variant.width*2/3));
   }
   const svg=readFileSync(new URL('../public'+media.url.replace('-640.webp','.svg'),import.meta.url),'utf8');
   const hash=createHash('sha256').update(svg.replace(/<title>.*?<\/title>/,'')).digest('hex');
   assert.ok(!drawings.has(hash),item[1]+' has distinct drawing content');drawings.add(hash);
   assert.ok(svg.includes('<title>'+item[1].replaceAll('&','&amp;')+'</title>'),item[1]+' described in source');
  });
 }
 const total=readdirSync(new URL('../public/menu-art/',import.meta.url)).reduce((n,f)=>n+statSync(new URL('../public/menu-art/'+f,import.meta.url)).size,0);
 assert.ok(total<1_500_000,`asset budget ${total}`);
});

test('fresh standard and studio demos attach distinct gallery media without changing menu content',async()=>{
 for(const mode of [undefined,'studio']){
  const env=makeEnv();const api=client(env);
  const created=await api.post('/api/demo',mode?{mode}:{});assert.equal(created.status,201);
  const {results:items}=await env.DB.prepare('SELECT name_en,price,calories,image_url,gallery_json FROM items ORDER BY rowid').all();
  const expected=samples.sampleMenu('cafe').flatMap(c=>c[2]);assert.equal(items.length,expected.length);
  for(let i=0;i<items.length;i++){
   const item=items[i];assert.equal(item.name_en,expected[i][1]);assert.equal(item.price,expected[i][4]);assert.equal(item.calories,expected[i][5]);
   assert.deepEqual(JSON.parse(item.gallery_json),[samples.sampleItemMedia('cafe',i)]);
   assert.equal(item.image_url,samples.sampleItemMedia('cafe',i).url);
  }
 }
});

test('default Latin critical face is a real small WOFF2 with full extended fallback',()=>{
 const file=readFileSync(new URL('../public/fonts/menu-jakarta-core.woff2',import.meta.url));
 assert.equal(file.toString('ascii',0,4),'wOF2');assert.ok(file.length<15000);
 const css=readFileSync(new URL('../public/menu-next.css',import.meta.url),'utf8');
 assert.match(css,/menu-jakarta-core\.woff2.*unicode-range:U\+0000-00FF,U\+2000-206F,U\+20A0-20CF/);
 assert.match(css,/menu-jakarta\.woff2.*unicode-range:U\+0100-0148/);
 assert.doesNotMatch(css,/unicode-range:U\+0100-1FFF/,'extended fallback must not claim Arabic codepoints it does not contain');
});
