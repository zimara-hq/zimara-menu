import { publicSeason, seasonCategoryAvailable } from './seasons.js';
// Public discovery derives claims only from merchant inputs and accepted orders.
import { bad, notFound } from './util.js';
import { body, requireRole } from './context.js';

export function normalizeGallery(value = []) {
  if (!Array.isArray(value) || value.length > 6) throw bad('invalid_gallery');
  const mediaUrl = (v) => {
    if (typeof v !== 'string' || v.length > 2048 || /[\s<>"'\\]/.test(v)) throw bad('invalid_gallery');
    if (/^\/(?!\/)/.test(v)) return v;
    try { const u = new URL(v); if (u.protocol === 'https:' && !u.username && !u.password) return v; } catch {}
    throw bad('invalid_gallery');
  };
  return value.map((entry) => {
    if (!entry || !Array.isArray(entry.variants) || entry.variants.length > 3) throw bad('invalid_gallery');
    const widths = new Set();
    return { url: mediaUrl(entry.url), variants: entry.variants.map((v) => {
      if (!v || ![320,640,960].includes(v.width) || widths.has(v.width)) throw bad('invalid_gallery');
      widths.add(v.width); return { url: mediaUrl(v.url), width: v.width };
    }) };
  });
}
export function normalizeDietary(value = []) {
  if (!Array.isArray(value) || value.length > 3 || value.some(v => !['vegan','vegetarian','gluten_free'].includes(v))) throw bad('invalid_dietary');
  return [...new Set(value)];
}
export async function discoveryFields(env, orgId, b, itemId = null) {
  const ids = b.complementary_ids ?? [];
  if (!Array.isArray(ids) || ids.length > 3 || ids.some(v => typeof v !== 'string' || !v || v.length > 60 || v === itemId) || new Set(ids).size !== ids.length) throw bad('invalid_complementary_ids');
  for (const id of ids) if (!(await env.DB.prepare('SELECT id FROM items WHERE id=? AND org_id=?').bind(id, orgId).first())) throw bad('invalid_complementary_ids');
  return [JSON.stringify(normalizeGallery(b.gallery)), JSON.stringify(normalizeDietary(b.dietary)), JSON.stringify(ids)];
}
export function normalizeSchedule(s) {
  if (!s || typeof s.start !== 'string' || typeof s.end !== 'string' || !Array.isArray(s.days) || s.days.length > 7 || s.days.some(d => !Number.isInteger(d) || d < 0 || d > 6) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.end) || s.start === s.end) throw bad('invalid_schedule');
  return {days:[...new Set(s.days)].sort(),start:s.start,end:s.end};
}
export function scheduleAvailable(schedule, at = Date.now()) {
  if (!schedule) return true;
  const r = new Date(at + 3 * 3600000), day = r.getUTCDay(), minute = r.getUTCHours()*60+r.getUTCMinutes();
  const minutes = t => Number(t.slice(0,2))*60+Number(t.slice(3));
  const start = minutes(schedule.start), end = minutes(schedule.end);
  return start < end ? schedule.days.includes(day) && minute >= start && minute < end : (schedule.days.includes(day) && minute >= start) || (schedule.days.includes((day+6)%7) && minute < end);
}
export function riyadhDayStart(at = Date.now()) {
  return Math.floor((at + 3*3600000)/86400000)*86400000-3*3600000;
}
export async function schedulesFor(env, branchId) {
  const {results} = await env.DB.prepare('SELECT category_id,days_json,start,end FROM menu_category_schedules WHERE branch_id=?').bind(branchId).all();
  return results.map(({days_json,...s})=>({...s,days:JSON.parse(days_json)}));
}
export async function categoryAvailable(env, branchId, categoryId, at = Date.now()) {
  const s = await env.DB.prepare('SELECT days_json,start,end FROM menu_category_schedules WHERE branch_id=? AND category_id=?').bind(branchId, categoryId).first();
  if (!scheduleAvailable(s ? {...s,days:JSON.parse(s.days_json)} : null,at)) return false;
  const branch = await env.DB.prepare('SELECT org_id FROM branches WHERE id=?').bind(branchId).first();
  return branch ? seasonCategoryAvailable(env,branch.org_id,branchId,categoryId,at) : false;
}
const accepted = "q.status='accepted' AND (t.id IS NULL OR t.status!='cancelled')";
export async function discoverMenu(env, orgId, branchId, menu, at = Date.now()) {
  const schedules = new Map((await schedulesFor(env,branchId)).map(s=>[s.category_id,s]));
  const season=await publicSeason(env,orgId,branchId,at);
  const seasonalAvailable=id=>{const periods=season?.periods?.filter(p=>p.category_ids.includes(id))||[];return !periods.length||periods.some(p=>p.active_now);};
  const categories = menu.categories.map(c=>({...c,scheduled_available:scheduleAvailable(schedules.get(c.id),at)&&seasonalAvailable(c.id)}));
  const availability = new Map(categories.map(c=>[c.id,c.scheduled_available]));
  const {results} = await env.DB.prepare(`SELECT json_extract(j.value,'$.id') AS item_id,COUNT(DISTINCT q.id) AS n FROM customer_orders q LEFT JOIN tickets t ON t.id=q.ticket_id AND t.org_id=q.org_id AND t.branch_id=q.branch_id JOIN json_each(q.items_json) j WHERE q.org_id=? AND q.branch_id=? AND ${accepted} AND q.created_at>=? AND q.created_at<=? GROUP BY item_id`).bind(orgId,branchId,riyadhDayStart(at),at).all();
  const counts = new Map(results.map(r=>[r.item_id,r.n]));
  const total = await env.DB.prepare(`SELECT COUNT(*) AS n FROM customer_orders q LEFT JOIN tickets t ON t.id=q.ticket_id AND t.org_id=q.org_id AND t.branch_id=q.branch_id WHERE q.org_id=? AND q.branch_id=? AND ${accepted} AND q.created_at>=? AND q.created_at<=?`).bind(orgId,branchId,riyadhDayStart(at),at).first();
  return {categories,items:menu.items.map(i=>({...i,available:availability.get(i.category_id)===false?0:i.available,orders_today:counts.get(i.id)||0})),discovery:{generated_at:at,timezone:'Asia/Riyadh',order_count_today:total.n}};
}
export async function recommendations(env, orgId, branchId, menu, itemId, at=Date.now()) {
  const origin = menu.items.find(i=>i.id===itemId); if (!origin) throw notFound();
  const visible = new Map(menu.items.filter(i=>i.available).map(i=>[i.id,i]));
  // Filter with current public-menu eligibility before ranking/limiting history.
  // A single bound JSON array avoids a SQL parameter per menu item.
  const {results} = await env.DB.prepare(`SELECT json_extract(pair.value,'$.id') AS item_id,COUNT(DISTINCT q.id) AS n FROM customer_orders q LEFT JOIN tickets t ON t.id=q.ticket_id AND t.org_id=q.org_id AND t.branch_id=q.branch_id JOIN json_each(q.items_json) pair WHERE q.org_id=? AND q.branch_id=? AND ${accepted} AND q.created_at>=? AND q.created_at<=? AND EXISTS(SELECT 1 FROM json_each(q.items_json) source WHERE json_extract(source.value,'$.id')=?) AND json_extract(pair.value,'$.id')!=? AND json_extract(pair.value,'$.id') IN (SELECT value FROM json_each(?)) GROUP BY item_id HAVING COUNT(DISTINCT q.id)>=3 ORDER BY n DESC,item_id LIMIT 3`).bind(orgId,branchId,at-30*86400000,at,itemId,itemId,JSON.stringify([...visible.keys()])).all();
  const hits = results;
  if (hits.length) return {source:'orders',sample_size:Math.max(...hits.map(r=>r.n)),items:hits.map(r=>visible.get(r.item_id))};
  const items = origin.complementary_ids.map(id=>visible.get(id)).filter(Boolean).slice(0,3);
  return {source:items.length?'merchant':'none',sample_size:0,items};
}
export function registerMenuSchedules(app) {
  const owner=requireRole('owner');
  const branch = async c=> { const b=await c.env.DB.prepare('SELECT id FROM branches WHERE id=? AND org_id=?').bind(c.req.param('branchId'),c.get('user').org_id).first(); if(!b)throw notFound();return b; };
  app.get('/api/owner/branches/:branchId/menu-schedules',owner,async c=>c.json({schedules:await schedulesFor(c.env,(await branch(c)).id)}));
  app.put('/api/owner/branches/:branchId/menu-schedules/:categoryId',owner,async c=>{
    const b=await branch(c),orgId=c.get('user').org_id,categoryId=c.req.param('categoryId');
    if(!await c.env.DB.prepare('SELECT id FROM categories WHERE id=? AND org_id=?').bind(categoryId,orgId).first())throw notFound();
    const input=await body(c);
    if(input.schedule===null) await c.env.DB.prepare('DELETE FROM menu_category_schedules WHERE branch_id=? AND category_id=?').bind(b.id,categoryId).run();
    else {const s=normalizeSchedule(input.schedule);await c.env.DB.prepare('INSERT INTO menu_category_schedules(branch_id,category_id,days_json,start,end) VALUES(?,?,?,?,?) ON CONFLICT(branch_id,category_id) DO UPDATE SET days_json=excluded.days_json,start=excluded.start,end=excluded.end').bind(b.id,categoryId,JSON.stringify(s.days),s.start,s.end).run();}
    return c.json({schedules:await schedulesFor(c.env,b.id)});
  });
}
