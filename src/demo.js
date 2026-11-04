import { sampleMenuStatements } from './sample-menu.js';
import {PRESETS,validateRecipe,fixContrast} from './design.js';
import { createSession, sessionCookie, hashPassword,deviceLabel} from './auth.js';
import { body, isSecure, rateLimit } from './context.js';
import { id, randomToken, hmac, now, HttpError, bad, notFound } from './util.js';
const HOUR = 3600000;
async function findRoom(c) {
 const token = c.req.param('token');
 if (!/^[A-Za-z0-9_-]{32}$/.test(token || '')) throw notFound();
 const room = await c.env.DB.prepare('SELECT d.*,o.slug AS org_slug,b.slug AS branch_slug FROM demo_rooms d JOIN orgs o ON o.id=d.org_id JOIN branches b ON b.id=d.branch_id WHERE d.token_hash=? AND d.expires_at>? AND o.active=1').bind(await hmac(c.env.AUTH_SECRET,'demo:'+token),now()).first();
 if (!room) throw new HttpError(410,'demo_expired');
 return room;
}
function view(room) {return {expires_at:room.expires_at,org_slug:room.org_slug,branch_slug:room.branch_slug,scope:'synthetic_shared_room',capabilities:{payments:false,wallet:false,push:false}};}
export function registerDemo(app) {
 app.get('/api/public/experience-metrics',async c=>{
  const row=await c.env.DB.prepare('SELECT COUNT(*) AS n FROM demo_rooms').first();
  return c.json({days_since_launch:Math.max(0,Math.floor((now()-Date.UTC(2026,9,10))/86400000)),experiences:row.n,services:3});
 });
 app.post('/api/demo',async c=>{
  if(c.env.DEMO_ENABLED==='false')throw new HttpError(503,'demo_unavailable');
  const input=await body(c);
  if(input.mode!==undefined&&input.mode!=='studio')throw bad('invalid_demo_mode');
  await rateLimit(c,'demo-create',{limit:Math.min(100,Math.max(1,Number(c.env.DEMO_HOURLY_LIMIT)||8)),window:HOUR}); // DEMO_HOURLY_LIMIT: test runs only
  const n=await c.env.DB.prepare('SELECT COUNT(*) AS n FROM demo_rooms WHERE expires_at>?').bind(now()).first();
  if(n.n>=200)throw new HttpError(429,'demo_capacity');
  const token=randomToken(24),oid=id(),bid=id(),owner=id(),cashier=id(),t=now(),expires=t+2*HOUR;
  const slug='demo-'+randomToken(8).replace(/[-_]/g,'a').toLowerCase();
  const passwordHash=await hashPassword(randomToken(32));
  const statements=[
   c.env.DB.prepare('INSERT INTO orgs(id,slug,name_ar,name_en,brand_color,created_at) VALUES(?,?,?,?,?,?)').bind(oid,slug,'رواق · تجربة زيمارا','Riwaq · ZIMARA demo','#704391',t),
   c.env.DB.prepare('INSERT INTO branches(id,org_id,slug,name_ar,name_en,created_at) VALUES(?,?,?,?,?,?)').bind(bid,oid,slug+'-hail','حائل · فرع توضيحي','Ha’il · sample branch',t),
   c.env.DB.prepare("INSERT INTO users(id,email,name,role,org_id,password_hash,created_at) VALUES(?,?,?,'owner',?,?,?)").bind(owner,owner+'@demo.invalid','مالك التجربة',oid,passwordHash,t),
   c.env.DB.prepare("INSERT INTO users(id,email,name,role,org_id,branch_id,password_hash,created_at) VALUES(?,?,?,'branch',?,?,?,?)").bind(cashier,cashier+'@demo.invalid','كاشير التجربة',oid,bid,passwordHash,t),
   c.env.DB.prepare('INSERT INTO loyalty_programs(org_id,stamps_required) VALUES(?,3)').bind(oid),
   c.env.DB.prepare("INSERT INTO org_profiles(org_id,sector,description_ar,description_en,updated_at) VALUES(?,'cafe',?,?,?)").bind(oid,'منشأة توضيحية ببيانات اصطناعية، وليست مقهى فعليًا.','A synthetic sample business, not a real café.',t),
   c.env.DB.prepare("INSERT INTO subscriptions(org_id,plan,status,trial_ends_at,current_period_end,created_at,updated_at) VALUES(?,'pro','trial',?,?,?,?)").bind(oid,expires,expires,t,t),
   c.env.DB.prepare('INSERT INTO demo_rooms(id,token_hash,org_id,branch_id,owner_id,cashier_id,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)').bind(id(),await hmac(c.env.AUTH_SECRET,'demo:'+token),oid,bid,owner,cashier,t,expires)
  ];
  statements.splice(statements.length-2,0,...sampleMenuStatements(c.env.DB,oid,'cafe',id));
  if(input.mode==='studio'){
   const recipe=validateRecipe({...JSON.parse(JSON.stringify(PRESETS[62].recipe)),colors:{primary:'#2d4639',accent:'#ccaf83',bg:'#f5f4ef',surface:'#ffffff',text:'#203027'},font_ar:'readex',font_en:'jakarta',typography:{heading_font:'alexandria',heading_scale:135,line_height:180,spacing:0},composition:{frame:'gallery',hero:'split',navigation:'rail',section:'plain',media:'landscape',width:'wide',density:'airy'},home:{enabled:true,footer_ar:'رواق · موقع توضيحي لتجربة زيمارا',footer_en:'Riwaq · An illustrative ZIMARA website',blocks:[
    {id:'welcome',type:'hero',title_ar:'خذ وقتك.\nقهوتك هنا.',title_en:'Take your time.\nYour coffee is here.',body_ar:'موقع مقهى توضيحي صُمّم لتجربة المحرر. عدّل هذه الكلمات والصور والتخطيط لتشوف فكرتك على الصفحة.',body_en:'An illustrative café website for trying the editor. Change the words, photography and layout to see your own idea take shape.',image:'/editorial/counter.webp',label_ar:'على المنيو',label_en:'Explore the menu'},
    {id:'favourites',type:'featured',title_ar:'على ذوقك.',title_en:'To your taste.'},
    {id:'story',type:'text',title_ar:'قهوة. ومساحة لك.',title_en:'Coffee. And a little space for you.',body_ar:'هذا محتوى تجريبي يمكنك تغييره. أضف حكاية المكان، الصورة اللي تحبها، والتفاصيل اللي تهم زوّارك.',body_en:'This is sample copy you can change. Add your story, your favourite photographs and the details that matter to your guests.',tone:'quiet',variant:'columns'},
    {id:'moments',type:'gallery',title_ar:'تفاصيل من المكان.',title_en:'A closer look.',items:[{image:'/editorial/coffee.webp',title_ar:'قهوة بروقان · صورة توضيحية',title_en:'Coffee, unrushed · illustrative image'},{image:'/editorial/pastry.webp',title_ar:'تستاهل الحلو · صورة توضيحية',title_en:'Something sweet · illustrative image'}]},
    {id:'browse',type:'menu',title_ar:'كل اختياراتك هنا.',title_en:'All your favourites, here.'},
    {id:'return',type:'loyalty',title_ar:'لنا رجعة.',title_en:'See you again.'},
    {id:'find-us',type:'branches',title_ar:'نلقاك هنا.',title_en:'Find us here.'}
   ]}});fixContrast(recipe);
   statements.push(
    c.env.DB.prepare('UPDATE orgs SET brand_color=? WHERE id=?').bind('#2d4639',oid),
    c.env.DB.prepare('UPDATE org_profiles SET banners_json=? WHERE org_id=?').bind(JSON.stringify([{image_url:'/editorial/counter.webp',alt_ar:'صورة مقهى توضيحية من Unsplash',alt_en:'Illustrative café photograph from Unsplash'}]),oid),
    c.env.DB.prepare('INSERT INTO org_designs(org_id,draft_json,published_json,published_at,updated_at,revision) VALUES(?,?,?,?,?,1)').bind(oid,JSON.stringify(recipe),JSON.stringify(recipe),t,t),
    c.env.DB.prepare("UPDATE items SET image_url=CASE WHEN name_ar LIKE '%كروسان%' THEN '/editorial/pastry.webp' ELSE '/editorial/coffee.webp' END WHERE org_id=? AND (name_ar LIKE '%كروسان%' OR name_ar LIKE '%لاتيه%' OR name_ar='كابتشينو' OR name_ar='فلات وايت' OR name_ar='إسبريسو')").bind(oid)
   );
  }
  await c.env.DB.batch(statements);
  return c.json({token,...view({expires_at:expires,org_slug:slug,branch_slug:slug+'-hail'})},201);
 });
 app.get('/api/demo/:token',async c=>c.json(view(await findRoom(c))));
 app.post('/api/demo/:token/display',async c=>{
  const room=await findRoom(c);
  await rateLimit(c,'demo-display',{limit:20,window:HOUR});
  const token=randomToken(32);
  const count=await c.env.DB.prepare('SELECT COUNT(*) AS n FROM display_devices WHERE org_id=?').bind(room.org_id).first();
  if(count.n>=20)throw new HttpError(429,'display_limit');
  await c.env.DB.prepare('INSERT INTO display_devices(id,org_id,branch_id,token_hash,label,created_at) VALUES(?,?,?,?,?,?)').bind(id(),room.org_id,room.branch_id,await hmac(c.env.AUTH_SECRET,'display:'+token),'Demo counter',now()).run();
  return c.json({url:'/display/'+token},201);
 });

 app.post('/api/demo/:token/session',async c=>{
  await rateLimit(c,'demo-session',{limit:60,window:900000});
  const room=await findRoom(c),b=await body(c);
  if(!['owner','branch'].includes(b.role))throw bad('invalid_role');
  const userId=b.role==='owner'?room.owner_id:room.cashier_id;
  const token=await createSession(c.env,userId,false,{label:deviceLabel(c.req.header('user-agent')),via:'demo'});
  await c.env.DB.prepare('UPDATE sessions SET expires_at=? WHERE id=?').bind(room.expires_at,await hmac(c.env.AUTH_SECRET,'session:'+token)).run();
  c.header('Set-Cookie',sessionCookie(token,isSecure(c)));
  return c.json({ok:true,role:b.role,expires_at:room.expires_at,redirect:'/app'});
 });
}
export async function expireDemo(env){
 const t=now();
 await env.DB.batch([
  env.DB.prepare('UPDATE orgs SET active=0 WHERE id IN(SELECT org_id FROM demo_rooms WHERE expires_at<=?)').bind(t),
  env.DB.prepare('DELETE FROM sessions WHERE user_id IN(SELECT owner_id FROM demo_rooms WHERE expires_at<=? UNION SELECT cashier_id FROM demo_rooms WHERE expires_at<=?)').bind(t,t),
 ]);
}
