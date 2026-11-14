import { body, requireRole, audit } from './context.js';
import { bad, notFound, conflict, HttpError, id, now } from './util.js';
import { BUILTIN_OCCASIONS, CITIES, hijriParts, occasionRange, cityTimes } from './season-calendar.js';

const MOTIFS = ['ramadan','eid-fitr','eid-adha','national','founding','winter'];
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const baseConfig = () => ({mode:'off',manual_id:null,enabled_ids:[],overrides:{},branches:[]});
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
function keys(v, allowed) { if (!object(v) || Object.keys(v).some(k=>!allowed.includes(k))) throw bad('invalid_season_fields'); }
function text(v, max, optional=false) {
  if (optional && (v===undefined || v===null)) return '';
  if (typeof v!=='string' || v.length>max || (!optional&&!v.trim()) || /[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)) throw bad('invalid_season_text');
  return v.trim();
}
function ids(v,max) {
  if(!Array.isArray(v)||v.length>max||v.some(x=>typeof x!=='string'||!x||x.length>80)||new Set(v).size!==v.length)throw bad('invalid_season_ids');
  return [...v];
}
function calendar(fn) {
  try {return fn();} catch {throw new HttpError(503,'season_calendar_unavailable');}
}
async function catalogue(env, includeArchived=false) {
  const {results}=await env.DB.prepare('SELECT id,definition_json,enabled,archived FROM season_occasions ORDER BY created_at,id').all();
  return [...BUILTIN_OCCASIONS.map(o=>({...o,enabled:true,archived:false,builtin:true})),...results.filter(r=>includeArchived||!r.archived).map(r=>({...JSON.parse(r.definition_json),id:r.id,enabled:!!r.enabled&&!r.archived,archived:!!r.archived,builtin:false}))];
}
async function settings(env,orgId) {
  const row=await env.DB.prepare('SELECT revision,config_json FROM org_seasons WHERE org_id=?').bind(orgId).first();
  return {revision:row?.revision||0,config:row?JSON.parse(row.config_json):baseConfig()};
}
async function references(env,orgId) {
  const [branches,categories]=await Promise.all([
    env.DB.prepare('SELECT id,slug,name_ar,name_en FROM branches WHERE org_id=? AND active=1 ORDER BY id').bind(orgId).all(),
    env.DB.prepare('SELECT id,name_ar,name_en FROM categories WHERE org_id=? AND active=1 ORDER BY sort,id').bind(orgId).all(),
  ]);
  return {branches:branches.results,categories:categories.results};
}
async function normalizeConfig(env,orgId,input) {
  keys(input,['mode','manual_id','enabled_ids','overrides','branches']);
  if(!['off','auto','manual'].includes(input.mode))throw bad('invalid_season_mode');
  const [occasions,refs]=await Promise.all([catalogue(env,true),references(env,orgId)]);
  const known=new Set(occasions.map(o=>o.id));
  const enabled_ids=ids(input.enabled_ids,100);
  if(enabled_ids.some(x=>!known.has(x)))throw bad('invalid_season_occasion');
  const manual_id=input.manual_id??null;
  if(manual_id!==null&&(typeof manual_id!=='string'||!known.has(manual_id)))throw bad('invalid_season_occasion');
  if(input.mode==='manual'&&!manual_id)throw bad('invalid_season_occasion');
  keys(input.overrides,Object.keys(input.overrides||{}));
  if(Object.keys(input.overrides).length>100)throw bad('invalid_season_overrides');
  const overrides={};
  for(const [key,value] of Object.entries(input.overrides)) {
    if(!known.has(key))throw bad('invalid_season_occasion');
    keys(value,['banner_ar','banner_en']);
    overrides[key]={banner_ar:text(value.banner_ar,240,true),banner_en:text(value.banner_en,240,true)};
  }
  if(!Array.isArray(input.branches)||input.branches.length>100)throw bad('invalid_season_branches');
  const branchIds=new Set(refs.branches.map(b=>b.id)),categoryIds=new Set(refs.categories.map(b=>b.id)),seen=new Set();
  const branches=input.branches.map(b=>{
    keys(b,['branch_id','city','periods']);
    if(!branchIds.has(b.branch_id)||seen.has(b.branch_id))throw bad('invalid_season_branch');seen.add(b.branch_id);
    if(!Object.hasOwn(CITIES,b.city))throw bad('invalid_season_city');
    if(!Array.isArray(b.periods)||b.periods.length>12)throw bad('invalid_season_periods');
    const periods=b.periods.map(p=>{
      keys(p,['occasion_id','kind','start','end','category_ids']);
      if(p.occasion_id!==undefined&&!known.has(p.occasion_id))throw bad('invalid_season_occasion');
      if(!['iftar','suhoor','seasonal'].includes(p.kind))throw bad('invalid_season_period');
      if((p.start!==null&&!TIME.test(p.start))||(p.end!==null&&!TIME.test(p.end))||p.start===undefined||p.end===undefined||p.start!==null&&p.start===p.end)throw bad('invalid_season_time');
      const category_ids=ids(p.category_ids,100);
      if(category_ids.some(x=>!categoryIds.has(x)))throw bad('invalid_season_category');
      return {...(p.occasion_id?{occasion_id:p.occasion_id}:{}),kind:p.kind,start:p.start,end:p.end,category_ids};
    });
    return {branch_id:b.branch_id,city:b.city,periods};
  });
  return {mode:input.mode,manual_id,enabled_ids,overrides,branches};
}
const minutes=t=>Number(t.slice(0,2))*60+Number(t.slice(3));
function timeActive(start,end,at) {
  const local=new Date(Number(at)+3*3600000),m=local.getUTCHours()*60+local.getUTCMinutes(),s=minutes(start),e=minutes(end);
  return s<e?m>=s&&m<e:m>=s||m<e;
}

// previewId is supplied only by the protected owner route; public callers must omit it.
export async function publicSeason(env,orgId,branchId=null,at=Date.now(),previewId=null) {
  const {config}=await settings(env,orgId);
  return resolveSeason(env,orgId,branchId,at,previewId,config);
}
async function resolveSeason(env,orgId,branchId,at,previewId,config) {
  if(config.mode==='off'&&!previewId)return null;
  const branch=await env.DB.prepare(`SELECT b.id FROM branches b JOIN orgs o ON o.id=b.org_id WHERE b.org_id=? AND o.active=1 AND b.active=1 ${branchId===null?'':'AND b.id=?'} ORDER BY b.id LIMIT 1`).bind(...(branchId===null?[orgId]:[orgId,branchId])).first();
  if(!branch)return null;
  const occasions=(await catalogue(env)).filter(o=>o.enabled);
  let selected,range;
  if(previewId || config.mode==='manual') {
    selected=occasions.find(o=>o.id===(previewId||config.manual_id));
    if(!selected)return null;
    range=calendar(()=>occasionRange(selected,at));
  } else {
    for(const occasion of occasions) if(config.enabled_ids.includes(occasion.id)) {
      const r=calendar(()=>occasionRange(occasion,at));if(r.active){selected=occasion;range=r;break;}
    }
  }
  if(!selected)return null;
  const branchConfig=config.branches.find(b=>b.branch_id===branch.id);
  const city=branchConfig?.city||null;
  const solarAt=previewId&&!range.active?Date.parse(range.starts_on+'T12:00:00+03:00'):at;
  const solar=city?calendar(()=>cityTimes(city,solarAt)):null;
  const matchingPeriods=(branchConfig?.periods||[]).filter(p=>!p.occasion_id||p.occasion_id===selected.id);
  const attached=[...new Set(matchingPeriods.flatMap(p=>p.category_ids))];
  const validCats=attached.length?new Set((await env.DB.prepare('SELECT id FROM categories WHERE org_id=? AND active=1 AND id IN (SELECT value FROM json_each(?))').bind(orgId,JSON.stringify(attached)).all()).results.map(c=>c.id)):new Set();
  const periods=matchingPeriods.map(p=>{
    const full_day=p.kind==='seasonal'&&p.start===null&&p.end===null;
    const start=p.start??(p.kind==='iftar'?solar.sunset:'00:00');
    const end=p.end??(p.kind==='suhoor'?solar.fajr:full_day?'00:00':'23:59');
    return {kind:p.kind,start,end,...(full_day?{full_day:true}:{}),category_ids:p.category_ids.filter(c=>validCats.has(c)),active_now:full_day||timeActive(start,end,at),source:full_day||p.start!==null||p.end!==null?'merchant':'calculated'};
  });
  const h=calendar(()=>hijriParts(previewId?solarAt:at)),override=config.overrides[selected.id]||{};
  return {id:selected.id,name_ar:selected.name_ar,name_en:selected.name_en,motif:selected.motif,accent:selected.accent,banner_ar:override.banner_ar||selected.banner_ar||'',banner_en:override.banner_en||selected.banner_en||'',starts_on:range.starts_on,ends_on:range.ends_on,hijri_label:`${h.day}/${h.month}/${h.year} هـ`,city,periods,times_date:solar?.date||null,timezone:'Asia/Riyadh',preview:!!previewId,mode:previewId?'preview':config.mode,calendar_active:range.active};
}
export async function seasonCategoryAvailable(env,orgId,branchId,categoryId,at=Date.now()) {
  const season=await publicSeason(env,orgId,branchId,at);
  if(!season)return true;
  const matching=season.periods.filter(p=>p.category_ids.includes(categoryId));
  return !matching.length||matching.some(p=>p.active_now);
}
async function ownerView(env,orgId) {
  const [saved,occasions,refs,active]=await Promise.all([settings(env,orgId),catalogue(env),references(env,orgId),publicSeason(env,orgId)]);
  return {...saved,occasions:occasions.map(o=>({...o,...calendar(()=>occasionRange(o,Date.now()))})),cities:CITIES,...refs,active};
}
function normalizeOccasion(input,occasionId) {
  keys(input,['id','name_ar','name_en','motif','accent','rule','enabled']);
  if(typeof occasionId!=='string'||!/^[a-z][a-z0-9-]{1,59}$/.test(occasionId)||BUILTIN_OCCASIONS.some(o=>o.id===occasionId))throw bad('invalid_season_id');
  if(input.id!==undefined&&input.id!==occasionId)throw bad('invalid_season_id');
  if(!MOTIFS.includes(input.motif)||typeof input.accent!=='string'||!/^#[0-9a-fA-F]{6}$/.test(input.accent)||typeof input.enabled!=='boolean')throw bad('invalid_season_occasion');
  const r=input.rule;keys(r,['calendar','month','day','duration']);
  if(!['hijri','gregorian'].includes(r.calendar)||!Number.isInteger(r.month)||r.month<1||r.month>12||!Number.isInteger(r.day)||r.day<1||r.day>(r.calendar==='hijri'?30:[31,29,31,30,31,30,31,31,30,31,30,31][r.month-1])||!(r.duration==='month'&&r.calendar==='hijri'&&r.day===1||Number.isInteger(r.duration)&&r.duration>=1&&r.duration<=120))throw bad('invalid_season_rule');
  return {id:occasionId,name_ar:text(input.name_ar,80),name_en:text(input.name_en,80),motif:input.motif,accent:input.accent,rule:{calendar:r.calendar,month:r.month,day:r.day,duration:r.duration}};
}
export function registerSeasons(app) {
  const owner=requireRole('owner'),hq=requireRole('super','admin');
  app.get('/api/owner/seasons',owner,async c=>c.json(await ownerView(c.env,c.get('user').org_id)));
  app.put('/api/owner/seasons',owner,async c=>{
    const input=await body(c);keys(input,['revision','config']);
    if(!Number.isSafeInteger(input.revision)||input.revision<0)throw bad('invalid_revision');
    const user=c.get('user'),config=await normalizeConfig(c.env,user.org_id,input.config),t=now();
    const statement=input.revision===0?c.env.DB.prepare('INSERT INTO org_seasons(org_id,config_json,revision,updated_by,updated_at) VALUES(?,?,1,?,?) ON CONFLICT(org_id) DO NOTHING').bind(user.org_id,JSON.stringify(config),user.id,t):c.env.DB.prepare('UPDATE org_seasons SET config_json=?,revision=revision+1,updated_by=?,updated_at=? WHERE org_id=? AND revision=?').bind(JSON.stringify(config),user.id,t,user.org_id,input.revision);
    const results=await c.env.DB.batch([statement,c.env.DB.prepare("INSERT INTO audit_log(id,user_id,org_id,action,detail,created_at) SELECT ?,?,?,'seasons_saved',?,? WHERE changes()>0").bind(id(),user.id,user.org_id,JSON.stringify({revision:input.revision+1,mode:config.mode}),t)]);
    if(!results[0].meta.changes)throw conflict('season_conflict');
    return c.json(await ownerView(c.env,user.org_id));
  });
  app.get('/api/owner/seasons/preview',owner,async c=>{
    const orgId=c.get('user').org_id,occasion=c.req.query('occasion'),branchId=c.req.query('branch_id')||null;
    if(!occasion||!(await catalogue(c.env)).some(o=>o.enabled&&o.id===occasion))throw bad('invalid_season_occasion');
    if(branchId&&!await c.env.DB.prepare('SELECT id FROM branches WHERE id=? AND org_id=? AND active=1').bind(branchId,orgId).first())throw notFound();
    return c.json({season:await publicSeason(c.env,orgId,branchId,Date.now(),occasion)});
  });
  app.post('/api/owner/seasons/preview',owner,async c=>{
    const input=await body(c);keys(input,['config','occasion_id','branch_id']);
    const orgId=c.get('user').org_id,occasion=input.occasion_id,branchId=input.branch_id??null;
    if(branchId!==null&&(typeof branchId!=='string'||!await c.env.DB.prepare('SELECT id FROM branches WHERE id=? AND org_id=? AND active=1').bind(branchId,orgId).first()))throw notFound();
    const config=await normalizeConfig(c.env,orgId,input.config);
    if(typeof occasion!=='string'||!(await catalogue(c.env)).some(o=>o.enabled&&o.id===occasion))throw bad('invalid_season_occasion');
    return c.json({season:await resolveSeason(c.env,orgId,branchId,Date.now(),occasion,config)});
  });
  app.get('/api/admin/seasons',hq,async c=>c.json({occasions:await catalogue(c.env,true)}));
  app.post('/api/admin/seasons',hq,async c=>{
    const input=await body(c),o=normalizeOccasion(input,input.id),user=c.get('user'),t=now();
    if((await c.env.DB.prepare('SELECT COUNT(*) AS n FROM season_occasions').first()).n>=100)throw bad('season_catalogue_limit');
    const result=await c.env.DB.prepare('INSERT INTO season_occasions(id,definition_json,enabled,created_by,updated_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(o.id,JSON.stringify(o),input.enabled?1:0,user.id,user.id,t,t).run();
    if(!result.meta.changes)throw conflict('season_occasion_exists');
    await audit(c.env,user,'season_occasion_created',{id:o.id});return c.json({...o,enabled:input.enabled},201);
  });
  app.put('/api/admin/seasons/:id',hq,async c=>{
    const input=await body(c),o=normalizeOccasion(input,c.req.param('id')),user=c.get('user');
    const result=await c.env.DB.prepare('UPDATE season_occasions SET definition_json=?,enabled=?,updated_by=?,updated_at=? WHERE id=? AND archived=0').bind(JSON.stringify(o),input.enabled?1:0,user.id,now(),o.id).run();
    if(!result.meta.changes)throw notFound();await audit(c.env,user,'season_occasion_updated',{id:o.id});return c.json({...o,enabled:input.enabled});
  });
  app.delete('/api/admin/seasons/:id',hq,async c=>{
    const user=c.get('user'),occasionId=c.req.param('id');
    const result=await c.env.DB.prepare('UPDATE season_occasions SET enabled=0,archived=1,updated_by=?,updated_at=? WHERE id=? AND archived=0').bind(user.id,now(),occasionId).run();
    if(!result.meta.changes)throw notFound();await audit(c.env,user,'season_occasion_archived',{id:occasionId});return c.json({ok:true});
  });
}
