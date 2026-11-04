// Shared bounded vocabulary. No merchant HTML, JavaScript or arbitrary CSS.
export const FRAMES=['atelier','split','poster','sidebar','editorial','market','gallery','ledger','boutique','service'];
export const HEROES=['stacked','centred','split','banner','overlay','minimal','wordmark','portrait','inset','panorama'];
export const COMPOSITION_OPTIONS={frame:FRAMES,hero:HEROES,navigation:['rail','sidebar','index','pills'],section:['plain','numbered','banner','ruled','centred'],media:['square','landscape','portrait','circle'],width:['narrow','regular','wide'],density:['airy','balanced','dense']};
export const BLOCK_TYPES=['hero','text','image','gallery','menu','featured','branches','hours','social','loyalty','faq','cta'];
export const BASE_COMPOSITION={frame:'atelier',hero:'stacked',navigation:'rail',section:'plain',media:'square',width:'regular',density:'balanced'};
export const BASE_HOME={enabled:false,footer_ar:'',footer_en:'',blocks:[]};
export const BASE_MENU={title_ar:'',title_en:'',description_ar:'',description_en:'',announcement_ar:'',announcement_en:'',announcement_url:null,search:true,prices:true,loyalty:true,cart:'side'};
const clone=value=>JSON.parse(JSON.stringify(value));

export function validateStructure(input,fail){
 const object=(v,key)=>{if(!v||typeof v!=='object'||Array.isArray(v))throw fail('invalid_design',key);return v;};
 const text=(v,key,max=800)=>{if(typeof v!=='string'||v.length>max)throw fail('invalid_design',key);return v.trim();};
 const link=(v,key)=>{if(v===null||v==='')return null;if(typeof v!=='string'||v.length>490||/[\s"'()\\<>]/.test(v))throw fail('invalid_design',key);if(/^\/(?!\/)/.test(v))return v;try{const u=new URL(v);if(u.protocol!=='https:'||u.username||u.password)throw 0;return u.href;}catch{throw fail('invalid_design',key);}};
 const known=(obj,keys,key)=>{for(const k of Object.keys(obj))if(!keys.includes(k))throw fail('invalid_design',key+'.'+k);};
 const composition={...BASE_COMPOSITION};
 if(input.composition!==undefined){const c=object(input.composition,'composition');known(c,Object.keys(COMPOSITION_OPTIONS),'composition');for(const [k,v]of Object.entries(c)){if(!COMPOSITION_OPTIONS[k].includes(v))throw fail('invalid_design','composition.'+k);composition[k]=v;}}
 const typography={heading_font:null,heading_scale:125,line_height:175,spacing:0};
 if(input.typography!==undefined){const t=object(input.typography,'typography');known(t,Object.keys(typography),'typography');for(const k of ['heading_scale','line_height','spacing'])if(t[k]!==undefined){const [min,max]=k==='heading_scale'?[100,180]:k==='line_height'?[140,210]:[-2,4];if(!Number.isInteger(t[k])||t[k]<min||t[k]>max)throw fail('invalid_design','typography.'+k);typography[k]=t[k];}if(t.heading_font!==undefined){if(t.heading_font!==null&&(typeof t.heading_font!=='string'||!/^[a-z_]{2,20}$/.test(t.heading_font)))throw fail('invalid_design','typography.heading_font');typography.heading_font=t.heading_font;}}
 const menu=clone(BASE_MENU);
 if(input.menu!==undefined){const m=object(input.menu,'menu');known(m,Object.keys(menu),'menu');for(const k of Object.keys(menu)){if(m[k]===undefined)continue;if(typeof menu[k]==='boolean'){if(typeof m[k]!=='boolean')throw fail('invalid_design','menu.'+k);menu[k]=m[k];}else if(k==='cart'){if(!['side','bottom'].includes(m[k]))throw fail('invalid_design','menu.cart');menu.cart=m[k];}else if(k==='announcement_url')menu[k]=link(m[k],'menu.'+k);else menu[k]=text(m[k],'menu.'+k,k.includes('description')?800:200);}}
 const home=clone(BASE_HOME);
 if(input.home!==undefined){const h=object(input.home,'home');known(h,Object.keys(home),'home');if(h.enabled!==undefined){if(typeof h.enabled!=='boolean')throw fail('invalid_design','home.enabled');home.enabled=h.enabled;}for(const k of ['footer_ar','footer_en'])if(h[k]!==undefined)home[k]=text(h[k],'home.'+k,200);
  if(h.blocks!==undefined){if(!Array.isArray(h.blocks)||h.blocks.length>24)throw fail('invalid_design','home.blocks');const ids=new Set();home.blocks=h.blocks.map((value,index)=>{const b=object(value,'home.blocks');known(b,['id','type','visible','title_ar','title_en','body_ar','body_en','label_ar','label_en','url','image','align','tone','variant','items'],'home.blocks');if(typeof b.id!=='string'||!/^[a-zA-Z0-9_-]{1,50}$/.test(b.id)||ids.has(b.id))throw fail('invalid_design','home.block_id');ids.add(b.id);if(!BLOCK_TYPES.includes(b.type))throw fail('invalid_design','home.block_type');const r={id:b.id,type:b.type,visible:b.visible!==false,align:'start',tone:'surface',variant:'standard',title_ar:'',title_en:'',body_ar:'',body_en:'',label_ar:'',label_en:'',url:null,image:null,items:[]};if(b.visible!==undefined&&typeof b.visible!=='boolean')throw fail('invalid_design','home.visible');for(const k of ['title_ar','title_en','body_ar','body_en','label_ar','label_en'])if(b[k]!==undefined)r[k]=text(b[k],'home.'+k,k.startsWith('body')?3000:180);for(const k of ['url','image'])if(b[k]!==undefined)r[k]=link(b[k],'home.'+k);for(const[k,values]of Object.entries({align:['start','center'],tone:['surface','brand','quiet'],variant:['standard','split','cover','columns']}))if(b[k]!==undefined){if(!values.includes(b[k]))throw fail('invalid_design','home.'+k);r[k]=b[k];}
   if(b.items!==undefined){if(!Array.isArray(b.items)||b.items.length>12)throw fail('invalid_design','home.items');r.items=b.items.map(item=>{const i=object(item,'home.item');known(i,['title_ar','title_en','body_ar','body_en','url','image'],'home.item');return{title_ar:text(i.title_ar||'','home.item.title',180),title_en:text(i.title_en||'','home.item.title',180),body_ar:text(i.body_ar||'','home.item.body',1000),body_en:text(i.body_en||'','home.item.body',1000),url:link(i.url||null,'home.item.url'),image:link(i.image||null,'home.item.image')};});}return r;});}
 }
 return{composition,typography,menu,home};
}

// 100 structural combinations, independent of palette: 10 site frames × 10 hero
// compositions. Each changes layout, navigation, sections and photo treatment.
export function blueprint(index){
 const frame=FRAMES[Math.floor(index/10)%FRAMES.length],hero=HEROES[index%10];
 const composition={frame,hero,navigation:['rail','sidebar','index','pills'][Math.floor(index/10)%4],section:['plain','numbered','banner','ruled','centred'][(index+Math.floor(index/10))%5],media:['square','landscape','portrait','circle'][index%4],width:['narrow','regular','wide'][Math.floor(index/10)%3],density:['airy','balanced','dense'][(index+1)%3]};
 const order=[['hero','featured','text','menu','branches','social'],['hero','menu','gallery','loyalty','hours','social'],['hero','text','gallery','menu','branches','faq'],['hero','featured','branches','menu','loyalty','social'],['hero','gallery','menu','text','hours','cta']][Math.floor(index/10)%5];
 return{composition,typography:{heading_font:null,heading_scale:[135,150,165,120,145][index%5],line_height:175,spacing:0},menu:{...BASE_MENU},home:{...BASE_HOME,enabled:true,blocks:order.map((type,n)=>({id:`section-${n+1}`,type,visible:true,title_ar:'',title_en:'',body_ar:'',body_en:'',label_ar:'',label_en:'',image:null,url:null,items:[],align:index%2?'center':'start',tone:n===2?'quiet':'surface',variant:['standard','split','cover','columns'][(index+n)%4]}))}};
}
