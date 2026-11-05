import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverItems } from '../public/menu-discovery.js';
const items = [{id:'unknown',category_id:'a',available:true,price:1200,calories:null,dietary:[],orders_today:0},{id:'vegan',category_id:'a',available:true,price:1800,calories:240,dietary:['vegan'],orders_today:2},{id:'sold',category_id:'a',available:false,price:900,calories:50,dietary:['vegan'],orders_today:4},{id:'later',category_id:'b',available:true,price:800,calories:30,dietary:['vegan'],orders_today:8}];
const cats=[{id:'a',scheduled_available:true},{id:'b',scheduled_available:false}];
test('discovery hides unavailable items and scheduled categories',()=>assert.deepEqual(discoverItems(items,cats,{}).map(i=>i.id),['unknown','vegan']));
test('calorie filters exclude unknown values and dietary claims require explicit data',()=>{assert.deepEqual(discoverItems(items,cats,{maxCalories:300,dietary:'vegan'}).map(i=>i.id),['vegan']); assert.deepEqual(discoverItems(items,cats,{maxCalories:300}).map(i=>i.id),['vegan']);});
test('price filters use minor units and popularity uses actual daily counts',()=>{assert.deepEqual(discoverItems(items,cats,{maxPrice:1500}).map(i=>i.id),['unknown']);assert.deepEqual(discoverItems(items,cats,{sort:'popular'}).map(i=>i.id),['vegan','unknown']);});
test('zero daily history retains merchant ordering',()=>assert.deepEqual(discoverItems(items.slice(0,2).map(i=>({...i,orders_today:0})),cats,{sort:'popular'}).map(i=>i.id),['unknown','vegan']));
