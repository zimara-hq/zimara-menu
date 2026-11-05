import test from 'node:test';
import assert from 'node:assert/strict';
import {createDesignHistory} from '../public/studio-history.js';
test('recipe history coalesces typing, preserves deep snapshots and restores redo',()=>{
 let time=0;const h=createDesignHistory({clock:()=>time}),r={home:{blocks:[{id:'hero',title:'A'}]}};
 h.record(r,{key:'title',merge:true});r.home.blocks[0].title='AB';time=100;h.record(r,{key:'title',merge:true});r.home.blocks[0].title='ABC';
 const old=h.undo(r);assert.equal(old.home.blocks[0].title,'A');assert.equal(h.canUndo,false);old.home.blocks[0].title='independent';
 assert.equal(h.redo(old).home.blocks[0].title,'ABC');
});
test('structural edits remain separate; new edits invalidate the redo branch',()=>{
 const h=createDesignHistory(),a={blocks:['hero']},b={blocks:['hero','faq']},c={blocks:['faq','hero']};h.record(a);h.record(b);assert.deepEqual(h.undo(c),b);assert.deepEqual(h.undo(b),a);assert.deepEqual(h.redo(a),b);h.record(b);assert.equal(h.canRedo,false);
});
test('bounded history drops old snapshots and clear removes both directions',()=>{
 const h=createDesignHistory({limit:2});for(let i=0;i<4;i++)h.record({i});assert.deepEqual(h.undo({i:4}),{i:3});assert.deepEqual(h.undo({i:3}),{i:2});assert.equal(h.undo({i:2}),null);assert.equal(h.canRedo,true);h.clear();assert.equal(h.canUndo,false);assert.equal(h.canRedo,false);
});
