import { sampleMenuStatements } from './sample-menu.js';
import { createSession, sessionCookie, hashPassword } from './auth.js';
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
  await rateLimit(c,'demo-create',{limit:8,window:HOUR});
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
  const token=await createSession(c.env,userId);
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
