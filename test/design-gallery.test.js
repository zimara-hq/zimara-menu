import test from 'node:test';
import assert from 'node:assert/strict';
import {makeEnv,client} from './helpers.js';
test('public design gallery exposes only authored public metadata without a session',async()=>{
 const r=await client(makeEnv()).get('/api/public/designs');assert.equal(r.status,200);assert.equal(r.json.designs.length,20);
 for(const d of r.json.designs){assert.deepEqual(Object.keys(d).sort(),['id','name_ar','name_en','preview_url','sector']);assert.match(d.preview_url,/^\/design-previews\/[a-z-]+\.webp$/);}
 assert.equal(new Set(r.json.designs.map(d=>d.id)).size,20);
});
