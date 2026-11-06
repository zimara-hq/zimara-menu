import test from 'node:test';
import assert from 'node:assert/strict';
import {mountStudioInline} from '../public/studio-inline.js';

test('preview edits validate origin, source, existing block IDs and text bounds before changing latest draft',()=>{
 const previous=globalThis.window, previousLocation=globalThis.location;
 const listeners=new Set(),source={};
 globalThis.window={addEventListener:(type,fn)=>listeners.add(fn),removeEventListener:(type,fn)=>listeners.delete(fn)};
 globalThis.location={origin:'https://example.test'};
 let recipe={home:{blocks:[{id:'hero',type:'hero',title_ar:'قبل',body_ar:''}]},menu:{title_ar:''}},changes=0;
 const cleanup=mountStudioInline({frame:{contentWindow:source,src:'https://example.test/p/demo?design_preview=1'},getRecipe:()=>recipe,onChange:next=>{recipe=next;changes++;}});
 const send=(data,origin=location.origin,from=source)=>{for(const fn of listeners)fn({data,origin,source:from});};
 const edit={type:'zm-inline-commit',blockId:'hero',field:'title_ar',value:'بعد'};
 send(edit,'https://evil.test');send(edit,location.origin,{});send({...edit,blockId:'missing'});send({...edit,field:'__proto__'});send({...edit,value:'x'.repeat(181)});send({...edit,value:{html:'bad'}});
 assert.equal(changes,0);
 send(edit);assert.equal(changes,1);assert.equal(recipe.home.blocks[0].title_ar,'بعد');
 recipe.home.blocks=[];send(edit);assert.equal(changes,1,'stale deleted block must be rejected');
 send({type:'zm-inline-commit',blockId:null,field:'description_ar',value:'وصف'});assert.equal(recipe.menu.description_ar,'وصف');
 cleanup();assert.equal(listeners.size,0);
 globalThis.window=previous;globalThis.location=previousLocation;
});


test('the mounted frame must remain a same-origin design preview before it can change a draft',()=>{
 const previous=globalThis.window, previousLocation=globalThis.location;
 let listener,changes=0;const source={},frame={src:'https://example.test/p/demo',contentWindow:source};
 globalThis.window={addEventListener:(type,fn)=>listener=fn,removeEventListener:()=>{}};
 globalThis.location={origin:'https://example.test'};
 const recipe={home:{blocks:[{id:'hero',type:'hero',title_ar:'قديم'}]}};
 const cleanup=mountStudioInline({frame,getRecipe:()=>recipe,onChange:()=>changes++});
 const event={origin:location.origin,source,data:{type:'zm-inline-commit',blockId:'hero',field:'title_ar',value:'جديد'}};
 listener(event);assert.equal(changes,0,'ordinary public iframe must be noneditable');
 frame.src='https://elsewhere.test/p/demo?design_preview=1';listener(event);assert.equal(changes,0);
 frame.src='https://example.test/p/demo?design_preview=1';listener(event);assert.equal(changes,1);
 cleanup();globalThis.window=previous;globalThis.location=previousLocation;
});

test('flush waits for the preview acknowledgement and prior change callback, rejecting foreign acknowledgements and disposal',async()=>{
 const previous=globalThis.window, previousLocation=globalThis.location;
 let listener,request,resolveChange;
 const source={postMessage:message=>{request=message;}};
 const frame={src:'https://example.test/p/demo?design_preview=1',contentWindow:source};
 globalThis.window={addEventListener:(type,fn)=>listener=fn,removeEventListener:()=>{}};
 globalThis.location={origin:'https://example.test'};
 const recipe={home:{blocks:[{id:'hero',type:'hero',title_ar:'قديم'}]}};
 const cleanup=mountStudioInline({frame,getRecipe:()=>recipe,onChange:()=>new Promise(resolve=>{resolveChange=resolve;})});
 try {
  let finished=false;const flushing=cleanup.flush().then(()=>{finished=true;});
  assert.equal(request.type,'zm-inline-flush');
  const ack={type:'zm-inline-flushed',nonce:request.nonce,ok:true};
  listener({origin:'https://foreign.test',source,data:ack});
  listener({origin:location.origin,source:{},data:ack});
  await Promise.resolve();assert.equal(finished,false);
  listener({origin:location.origin,source,data:{type:'zm-inline-commit',blockId:'hero',field:'title_ar',value:'جديد'}});
  listener({origin:location.origin,source,data:ack});
  await Promise.resolve();assert.equal(finished,false,'acknowledgement must await earlier change callback');
  resolveChange();await flushing;assert.equal(finished,true);
  const pending=cleanup.flush();cleanup();await assert.rejects(pending,/أُغلق/);
 } finally {cleanup();globalThis.window=previous;globalThis.location=previousLocation;}
});

test('a stalled preview rejects flush with a recoverable timeout instead of allowing a stale save',async()=>{
 const previous=globalThis.window, previousLocation=globalThis.location;
 globalThis.window={addEventListener:()=>{},removeEventListener:()=>{}};
 globalThis.location={origin:'https://example.test'};
 const statuses=[],source={postMessage:()=>{}};
 const cleanup=mountStudioInline({frame:{src:'https://example.test/p/demo?design_preview=1',contentWindow:source},getRecipe:()=>({}),onStatus:message=>statuses.push(message)});
 try {
  await assert.rejects(cleanup.flush({timeoutMs:20}),error=>error.code==='inline_flush_timeout'&&error.message.includes('أعد المحاولة'));
  assert.equal(statuses.length,1);
 } finally {cleanup();globalThis.window=previous;globalThis.location=previousLocation;}
});

test('inline recovery messages follow document language and default to Arabic',async()=>{
 const previous=globalThis.window,previousLocation=globalThis.location,previousDocument=globalThis.document;
 globalThis.window={addEventListener:()=>{},removeEventListener:()=>{}};
 globalThis.location={origin:'https://example.test'};
 globalThis.document={documentElement:{lang:'en'}};
 const statuses=[],cleanup=mountStudioInline({frame:{src:'https://example.test/p/demo',contentWindow:{}},getRecipe:()=>({}),onStatus:message=>statuses.push(message)});
 try {
  await assert.rejects(cleanup.flush(),/The preview is not ready/);
  assert.equal(statuses[0],'The preview is not ready. Wait for the page to appear, then try again.');
  document.documentElement.lang='';
  await assert.rejects(cleanup.flush(),/المعاينة غير جاهزة/);
 } finally {cleanup();globalThis.window=previous;globalThis.location=previousLocation;globalThis.document=previousDocument;}
});
