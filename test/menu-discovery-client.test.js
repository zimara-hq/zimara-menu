import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverItems, firstMenuImage, responsiveMedia, publicPriceLabels } from '../public/menu-discovery.js';
const items = [{id:'unknown',category_id:'a',available:true,price:1200,calories:null,dietary:[],orders_today:0},{id:'vegan',category_id:'a',available:true,price:1800,calories:240,dietary:['vegan'],orders_today:2},{id:'sold',category_id:'a',available:false,price:900,calories:50,dietary:['vegan'],orders_today:4},{id:'later',category_id:'b',available:true,price:800,calories:30,dietary:['vegan'],orders_today:8}];
const cats=[{id:'a',scheduled_available:true},{id:'b',scheduled_available:false}];
test('discovery hides unavailable items and scheduled categories',()=>assert.deepEqual(discoverItems(items,cats,{}).map(i=>i.id),['unknown','vegan']));
test('calorie filters exclude unknown values and dietary claims require explicit data',()=>{assert.deepEqual(discoverItems(items,cats,{maxCalories:300,dietary:'vegan'}).map(i=>i.id),['vegan']); assert.deepEqual(discoverItems(items,cats,{maxCalories:300}).map(i=>i.id),['vegan']);});
test('price filters use minor units and popularity uses actual daily counts',()=>{assert.deepEqual(discoverItems(items,cats,{maxPrice:1500}).map(i=>i.id),['unknown']);assert.deepEqual(discoverItems(items,cats,{sort:'popular'}).map(i=>i.id),['vegan','unknown']);});
test('zero daily history retains merchant ordering',()=>assert.deepEqual(discoverItems(items.slice(0,2).map(i=>({...i,orders_today:0})),cats,{sort:'popular'}).map(i=>i.id),['unknown','vegan']));

test('first image follows open category order and shared responsive descriptor',()=>{
 const data={categories:cats,items:[{...items[3],image_url:'/closed.webp'},{...items[1],image_url:'/first.webp',gallery:[{variants:[{width:320,url:'/320.webp'},{width:1280,url:'/1280.webp'}]}]},{...items[0],image_url:'/second.webp'}]};
 assert.deepEqual(firstMenuImage(data),{src:'/first.webp',srcset:'/320.webp 320w',sizes:'(max-width: 600px) 45vw, 320px'});
 for(const patch of [{profile_data:{profile:{theme:{show_images:false}}}},{design:{layout:'text'}},{design:{show:{images:false}}}])assert.equal(firstMenuImage({...data,...patch}),null);
 assert.deepEqual(responsiveMedia(),{srcset:'',sizes:''});
});

test('public price labels preserve SAR minor units in both languages including zero and comparisons',()=>{
 const labels=publicPriceLabels([{price:1250,compare_price:1700},{price:0},{price:1250,compare_price:null}]);
 for(const lang of ['ar','en']){
   const fmt=new Intl.NumberFormat(lang==='ar'?'ar-SA-u-nu-latn':'en-SA',{style:'currency',currency:'SAR'});
   assert.deepEqual(Object.keys(labels[lang]).sort(),['0','1250','1700']);
   for(const amount of [0,1250,1700])assert.equal(labels[lang][amount],fmt.format(amount/100));
 }
});
