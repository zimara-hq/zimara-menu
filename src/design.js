// Design engine. A design is a "recipe" of bounded choices (no free CSS or markup),
// so any recipe is safe to render and every preset is just another recipe.
import { requireRole, body, audit } from './context.js';
import { bad, notFound, conflict, now, id } from './util.js';
import {BASE_COMPOSITION,BASE_HOME,BASE_MENU,COMPOSITION_OPTIONS,validateStructure,blueprint} from './design-structure.js';

// ---------- Fonts (served by Google Fonts, allowed by the public CSP) ----------
// [id, family, weights, category] — category: modern | classic | decorative.
export const FONTS_AR = [
  ['tajawal', 'Tajawal', '400;700', 'modern'], ['cairo', 'Cairo', '400;700', 'modern'], ['almarai', 'Almarai', '400;700', 'modern'],
  ['ibm', 'IBM Plex Sans Arabic', '400;700', 'modern'], ['kufi', 'Noto Kufi Arabic', '400;700', 'modern'], ['readex', 'Readex Pro', '400;700', 'modern'],
  ['changa', 'Changa', '400;700', 'modern'], ['rubik', 'Rubik', '400;700', 'modern'], ['alexandria', 'Alexandria', '400;700', 'modern'],
  ['zain', 'Zain', '400;700', 'modern'], ['noto_sans', 'Noto Sans Arabic', '400;700', 'modern'], ['mada', 'Mada', '400;700', 'modern'],
  ['harmattan', 'Harmattan', '400;700', 'modern'], ['baloo', 'Baloo Bhaijaan 2', '400;700', 'modern'], ['kufam', 'Kufam', '400;700', 'modern'],
  ['vazirmatn', 'Vazirmatn', '400;700', 'modern'],
  ['amiri', 'Amiri', '400;700', 'classic'], ['naskh', 'Noto Naskh Arabic', '400;700', 'classic'], ['scheherazade', 'Scheherazade New', '400;700', 'classic'],
  ['lateef', 'Lateef', '400;700', 'classic'], ['el_messiri', 'El Messiri', '400;700', 'classic'], ['mirza', 'Mirza', '400;700', 'classic'],
  ['reem', 'Reem Kufi', '400;700', 'classic'],
  ['lalezar', 'Lalezar', '', 'decorative'], ['rakkas', 'Rakkas', '', 'decorative'], ['aref', 'Aref Ruqaa', '400;700', 'decorative'],
  ['marhey', 'Marhey', '400;700', 'decorative'], ['blaka', 'Blaka', '', 'decorative'], ['handjet', 'Handjet', '400;700', 'decorative'],
  ['qahiri', 'Qahiri', '', 'decorative'],
];
export const FONTS_EN = [
  ['jakarta', 'Plus Jakarta Sans', '400;700', 'modern'], ['inter', 'Inter', '400;700', 'modern'], ['poppins', 'Poppins', '400;700', 'modern'],
  ['montserrat', 'Montserrat', '400;700', 'modern'], ['outfit', 'Outfit', '400;700', 'modern'], ['space', 'Space Grotesk', '400;700', 'modern'],
  ['dm_sans', 'DM Sans', '400;700', 'modern'], ['playfair', 'Playfair Display', '400;700', 'classic'], ['lora', 'Lora', '400;700', 'classic'],
  ['fraunces', 'Fraunces', '400;700', 'classic'], ['dm_serif', 'DM Serif Display', '', 'decorative'], ['bebas', 'Bebas Neue', '', 'decorative'],
];

// ---------- Allowed values ----------
const E = {
  font_size: ['sm', 'md', 'lg'],
  layout: ['list', 'cards', 'grid', 'compact', 'text', 'magazine', 'elegant', 'tiles'],
  categories: ['chips', 'pills', 'underline', 'boxed'],
  motion: ['none', 'soft', 'lively'],
  'background.type': ['solid', 'gradient', 'pattern', 'image'],
  'background.pattern': ['dots', 'grid', 'arabesque', 'waves'],
  'cover.height': ['none', 'compact', 'wide', 'tall'],
  'cover.logo_shape': ['circle', 'rounded', 'square'],
  'cover.align': ['start', 'center'],
  'card.radius': ['none', 'sm', 'md', 'lg', 'xl'],
  'card.shadow': ['none', 'soft', 'strong'],
  'card.image': ['start', 'end'],
  'button.shape': ['square', 'rounded', 'pill'],
  'button.style': ['flat', 'gradient', 'glass', 'metal', 'neon', 'outline', 'soft3d'],
  'button.animation': ['none', 'pulse', 'glow', 'bounce', 'shine'],
};
const COLOR_KEYS = ['primary', 'accent', 'bg', 'surface', 'text'];
const SHOW_KEYS = ['images', 'calories', 'descriptions', 'allergens'];
const HEX = /^#[0-9a-f]{6}$/i;
const IMAGE_URL = /^(?:https:\/\/|\/)[^\s"'()\\<>]{1,490}$/;

export const BASE_RECIPE = Object.freeze({
  colors: { primary: '#23003f', accent: '#8447f2', bg: '#f7f5fa', surface: '#ffffff', text: '#1d1426' },
  font_ar: 'tajawal', font_en: 'jakarta', font_size: 'md',
  background: { type: 'solid', pattern: 'dots', image: null, blur: 0, angle: 135 },
  cover: { height: 'wide', logo_shape: 'rounded', logo_shadow: true, align: 'start' },
  layout: 'list', categories: 'chips',
  card: { radius: 'lg', shadow: 'soft', border: true, image: 'end' },
  button: { shape: 'rounded', style: 'flat', animation: 'none' },
  motion: 'soft',
  show: { images: true, calories: true, descriptions: true, allergens: true },
  composition: {...BASE_COMPOSITION},
  typography: {heading_font:null,heading_scale:125,line_height:175,spacing:0},
  home: {...BASE_HOME},
  menu: {...BASE_MENU},
});

const clone = (o) => JSON.parse(JSON.stringify(o));

// ---------- Contrast (WCAG) ----------
function lum(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export function contrast(a, b) {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}
const best = (bg) => (contrast('#ffffff', bg) >= contrast('#111111', bg) ? '#ffffff' : '#111111');

// Keeps text readable whatever the owner picks; returns the fields it changed.
export function fixContrast(r) {
  const changed = [];
  if (contrast(r.colors.text, r.colors.bg) < 4.5 || contrast(r.colors.text, r.colors.surface) < 4.5) {
    const t = best(r.colors.surface);
    if (t !== r.colors.text) { r.colors.text = t; changed.push('colors.text'); }
  }
  return changed;
}

// Derived colours the renderer needs; never stored, always recomputed.
export function derived(r) {
  const c = r.colors;
  return {
    on_primary: best(c.primary),
    price: contrast(c.primary, c.surface) >= 4.5 ? c.primary : c.text,
    muted_mix: lum(c.surface) > 0.5 ? '#000000' : '#ffffff',
  };
}

// ---------- Validation ----------
function pickEnum(path, v) {
  if (!E[path].includes(v)) throw bad('invalid_design', path);
  return v;
}
export function validateRecipe(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw bad('invalid_design');
  const r = clone(BASE_RECIPE);
  const obj = (k) => (input[k] === undefined ? {} : typeof input[k] === 'object' && input[k] && !Array.isArray(input[k]) ? input[k] : (() => { throw bad('invalid_design', k); })());
  const allowedTop = new Set(['colors', 'font_ar', 'font_en', 'font_size', 'background', 'cover', 'layout', 'categories', 'card', 'button', 'motion', 'show','composition','typography','home','menu']);
  for (const k of Object.keys(input)) if (!allowedTop.has(k)) throw bad('invalid_design', k);

  const colors = obj('colors');
  for (const [k, v] of Object.entries(colors)) {
    if (!COLOR_KEYS.includes(k) || typeof v !== 'string' || !HEX.test(v)) throw bad('invalid_design', 'colors.' + k);
    r.colors[k] = v.toLowerCase();
  }
  if (input.font_ar !== undefined) { if (input.font_ar!=='custom'&&!FONTS_AR.some((f) => f[0] === input.font_ar)) throw bad('invalid_design', 'font_ar'); r.font_ar = input.font_ar; }
  if (input.font_en !== undefined) { if (!FONTS_EN.some((f) => f[0] === input.font_en)) throw bad('invalid_design', 'font_en'); r.font_en = input.font_en; }
  for (const k of ['font_size', 'layout', 'categories', 'motion']) if (input[k] !== undefined) r[k] = pickEnum(k, input[k]);

  for (const group of ['background', 'cover', 'card', 'button']) {
    for (const [k, v] of Object.entries(obj(group))) {
      const path = group + '.' + k;
      if (E[path]) r[group][k] = pickEnum(path, v);
      else if (path === 'background.image') {
        if (v !== null && (typeof v !== 'string' || !IMAGE_URL.test(v))) throw bad('invalid_design', path);
        r.background.image = v;
      } else if (path === 'background.blur' || path === 'background.angle') {
        const max = k === 'blur' ? 20 : 360;
        if (!Number.isInteger(v) || v < 0 || v > max) throw bad('invalid_design', path);
        r.background[k] = v;
      } else if (path === 'cover.logo_shadow' || path === 'card.border') {
        if (typeof v !== 'boolean') throw bad('invalid_design', path);
        r[group][k] = v;
      } else throw bad('invalid_design', path);
    }
  }
  for (const [k, v] of Object.entries(obj('show'))) {
    if (!SHOW_KEYS.includes(k) || typeof v !== 'boolean') throw bad('invalid_design', 'show.' + k);
    r.show[k] = v;
  }
  if (r.background.type === 'image' && !r.background.image) r.background.type = 'solid';
  Object.assign(r,validateStructure(input,bad));
  if(r.typography.heading_font&&r.typography.heading_font!=='custom'&&!FONTS_AR.concat(FONTS_EN).some(f=>f[0]===r.typography.heading_font))throw bad('invalid_design','typography.heading_font');
  return r;
}

// ---------- 100 ready designs ----------
// Stable legacy IDs and palettes, now paired with 100 structural compositions.
// [key, sector, name_ar, name_en, primary, accent, bg, surface, text, font_ar, font_en]
const PALETTES = [
  ['latte', 'cafe', 'لاتيه', 'Latte', '#5b3a29', '#c08552', '#f8f3ee', '#ffffff', '#2b1d14', 'tajawal', 'jakarta'],
  ['mocha', 'cafe', 'موكا داكن', 'Dark mocha', '#d9a066', '#8c5a3c', '#1b1411', '#261d18', '#f6ece3', 'cairo', 'outfit'],
  ['matcha', 'cafe', 'ماتشا', 'Matcha', '#3f6b35', '#a3c585', '#f4f7ef', '#ffffff', '#1d2a19', 'readex', 'dm_sans'],
  ['caramel', 'cafe', 'كراميل', 'Caramel', '#9a4f12', '#f2b544', '#fff8ec', '#ffffff', '#2d1a08', 'almarai', 'poppins'],
  ['roast', 'roastery', 'محمصة سوداء', 'Black roast', '#c9a46c', '#7a5b34', '#121010', '#1c1918', '#f1ebe2', 'el_messiri', 'playfair'],
  ['origin', 'roastery', 'أصل البن', 'Origin', '#6b3e26', '#2f5d50', '#f3eee8', '#ffffff', '#22160f', 'ibm', 'fraunces'],
  ['ember', 'restaurant', 'جمر', 'Ember', '#b3261e', '#f94500', '#fff6f2', '#ffffff', '#2a0f0c', 'cairo', 'montserrat'],
  ['olive', 'restaurant', 'زيتون', 'Olive', '#4f5d2f', '#c2a14d', '#f6f4ec', '#ffffff', '#20240f', 'naskh', 'lora'],
  ['navy', 'restaurant', 'كحلي فاخر', 'Navy fine dining', '#c8a96a', '#8aa1c1', '#0f1a2b', '#16243a', '#eef2f8', 'amiri', 'playfair'],
  ['saffron', 'restaurant', 'زعفران', 'Saffron', '#a3470a', '#f0a202', '#fffaf0', '#ffffff', '#2b1606', 'alexandria', 'outfit'],
  ['smash', 'burger', 'سماش', 'Smash', '#d62828', '#fcbf49', '#fffbf2', '#ffffff', '#1e1b18', 'lalezar', 'bebas'],
  ['charcoal', 'burger', 'فحم', 'Charcoal', '#ffb703', '#fb5607', '#141414', '#1f1f1f', '#f5f5f5', 'changa', 'bebas'],
  ['heritage', 'oriental', 'تراث', 'Heritage', '#185345', '#b08d57', '#f5f1e8', '#ffffff', '#16251f', 'reem', 'lora'],
  ['majlis', 'oriental', 'مجلس', 'Majlis', '#7b2d26', '#d4a373', '#fbf5ec', '#ffffff', '#2a120f', 'aref', 'dm_serif'],
  ['croissant', 'bakery', 'كرواسون', 'Croissant', '#8a4b14', '#e9b872', '#fff9f0', '#ffffff', '#2a1606', 'baloo', 'poppins'],
  ['rose', 'bakery', 'وردي', 'Rose', '#b23a6b', '#f7a1c4', '#fff5f8', '#ffffff', '#33121f', 'marhey', 'poppins'],
  ['pistachio', 'bakery', 'فستق', 'Pistachio', '#4d7c4b', '#e8c07d', '#f7faf2', '#ffffff', '#1a2b19', 'kufam', 'dm_sans'],
  ['citrus', 'juice', 'حمضيات', 'Citrus', '#1d7a46', '#ff9f1c', '#f3fbf5', '#ffffff', '#12291b', 'rubik', 'outfit'],
  ['berry', 'juice', 'توت', 'Berry', '#7b1fa2', '#ec407a', '#fbf4fd', '#ffffff', '#2a0f33', 'zain', 'poppins'],
  ['care', 'clinic', 'رعاية', 'Care', '#1b4f8a', '#4fb3bf', '#f2f7fc', '#ffffff', '#0f2236', 'ibm', 'inter'],
  ['mint', 'clinic', 'نعناع طبي', 'Clinical mint', '#0f766e', '#5eead4', '#f0fbf9', '#ffffff', '#0b2826', 'noto_sans', 'inter'],
  ['velvet', 'salon', 'مخمل', 'Velvet', '#7a2e6b', '#e0a3c8', '#fcf5fa', '#ffffff', '#2d1028', 'el_messiri', 'fraunces'],
  ['gold', 'salon', 'ذهبي', 'Gold', '#d4af37', '#8c6d1f', '#141210', '#1e1b17', '#f7f1e3', 'scheherazade', 'playfair'],
  ['fresh', 'laundry', 'نظيف', 'Fresh', '#0369a1', '#38bdf8', '#f0f8ff', '#ffffff', '#0b2233', 'mada', 'dm_sans'],
];
const STYLES = [
  ['classic', 'كلاسيكي', 'Classic', { layout: 'list', categories: 'underline', card: { radius: 'md', shadow: 'soft', border: true, image: 'end' }, button: { shape: 'rounded', style: 'flat', animation: 'none' }, cover: { height: 'wide', logo_shape: 'rounded', logo_shadow: true, align: 'start' }, background: { type: 'solid' } }],
  ['photo', 'بطاقات صور', 'Photo cards', { layout: 'cards', categories: 'pills', card: { radius: 'xl', shadow: 'soft', border: false, image: 'end' }, button: { shape: 'pill', style: 'gradient', animation: 'pulse' }, cover: { height: 'tall', logo_shape: 'circle', logo_shadow: true, align: 'center' }, background: { type: 'gradient', angle: 160 } }],
  ['grid', 'شبكة', 'Grid', { layout: 'grid', categories: 'chips', card: { radius: 'lg', shadow: 'none', border: true, image: 'end' }, button: { shape: 'rounded', style: 'glass', animation: 'shine' }, cover: { height: 'compact', logo_shape: 'rounded', logo_shadow: false, align: 'start' }, background: { type: 'pattern', pattern: 'dots' } }],
  ['luxe', 'فاخر', 'Luxe', { layout: 'elegant', categories: 'boxed', card: { radius: 'none', shadow: 'none', border: false, image: 'end' }, button: { shape: 'square', style: 'outline', animation: 'glow' }, cover: { height: 'wide', logo_shape: 'circle', logo_shadow: false, align: 'center' }, background: { type: 'pattern', pattern: 'arabesque' } }],
];
const SEASONAL = [
  ['ramadan', 'رمضان كريم', 'Ramadan', '#d4af37', '#7c5cbf', '#120d24', '#1c1535', '#f5efe0', 'amiri', 'playfair', 'arabesque'],
  ['eid', 'عيد سعيد', 'Eid', '#8447f2', '#f94500', '#fbf7ff', '#ffffff', '#1d1426', 'marhey', 'poppins', 'dots'],
  ['national', 'اليوم الوطني', 'National Day', '#006c35', '#c8a24a', '#f2f8f4', '#ffffff', '#0d2418', 'reem', 'montserrat', 'waves'],
  ['founding', 'يوم التأسيس', 'Founding Day', '#7a4a1d', '#3b6e3b', '#f7f0e4', '#fffdf8', '#2a1a0c', 'aref', 'lora', 'arabesque'],
];

function makePresets() {
  const list = [];
  for (const [key, sector, nar, nen, primary, accent, bg, surface, text, far, fen] of PALETTES) {
    for (const [skey, sar, sen, style] of STYLES) {
      const r = validateRecipe({ ...clone(style),...blueprint(list.length), colors: { primary, accent, bg, surface, text }, font_ar: ['ibm','readex','alexandria','cairo','almarai'][Math.floor(list.length/10)%5], font_en: fen, motion: 'soft' });
      r.typography.heading_font=['ibm','alexandria','readex','kufi','naskh'][list.length%5];
      fixContrast(r);
      list.push({ id: `${key}-${skey}`, sector, name_ar: `${nar} · ${sar}`, name_en: `${nen} · ${sen}`, recipe: r });
    }
  }
  for (const [key, nar, nen, primary, accent, bg, surface, text, far, fen, pattern] of SEASONAL) {
    const r = validateRecipe({ ...clone(STYLES[1][3]),...blueprint(list.length), colors: { primary, accent, bg, surface, text }, font_ar:'ibm', font_en: fen, background: { type: 'pattern', pattern }, button: { shape: 'pill', style: 'flat', animation: 'none' } });
    fixContrast(r);
    list.push({ id: `season-${key}`, sector: 'seasonal', name_ar: nar, name_en: nen, recipe: r });
  }
  return list;
}
export const PRESETS = makePresets();
export const SECTORS = ['cafe', 'roastery', 'restaurant', 'burger', 'oriental', 'bakery', 'juice', 'clinic', 'salon', 'laundry', 'seasonal'];

// ---------- Storage ----------
const MAX_NAMED = 20;
const AUTO_KEEP_MS = 30 * 24 * 3600 * 1000;

async function row(env, orgId) {
  return env.DB.prepare('SELECT * FROM org_designs WHERE org_id=?').bind(orgId).first();
}
async function snapshot(env, orgId, name, recipe) {
  const t = now();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO design_versions(id,org_id,name,recipe_json,auto,created_at) VALUES(?,?,?,?,1,?)').bind(id(), orgId, name, JSON.stringify(recipe), t),
    env.DB.prepare('DELETE FROM design_versions WHERE org_id=? AND auto=1 AND created_at<? AND id NOT IN (SELECT version_id FROM design_schedules)').bind(orgId, t - AUTO_KEEP_MS),
  ]);
}
async function saveDraft(env, orgId, recipe, presetId = null, expected = null) {
  if(expected!==null&&(!Number.isSafeInteger(expected)||expected<0))throw bad('invalid_revision');
  if(expected>0&&!(await row(env,orgId)))throw conflict('design_conflict');
  const result=await env.DB.prepare(
    `INSERT INTO org_designs(org_id,draft_json,preset_id,updated_at,revision) VALUES(?,?,?,?,1)
     ON CONFLICT(org_id) DO UPDATE SET draft_json=excluded.draft_json, preset_id=COALESCE(excluded.preset_id, org_designs.preset_id), updated_at=excluded.updated_at,revision=org_designs.revision+1
     WHERE ? IS NULL OR org_designs.revision=?`,
  ).bind(orgId, JSON.stringify(recipe), presetId, now(),expected,expected).run();
  if(!result.meta.changes)throw conflict('design_conflict');
  return (await row(env,orgId)).revision;
}

// The design guests see now: a running schedule wins over the published design.
export async function activeDesign(env, orgId, at = now()) {
  const sched = await env.DB.prepare(
    `SELECT v.recipe_json FROM design_schedules s JOIN design_versions v ON v.id=s.version_id
      WHERE s.org_id=? AND s.starts_at<=? AND s.ends_at>? ORDER BY s.starts_at DESC LIMIT 1`,
  ).bind(orgId, at, at).first();
  const json = sched?.recipe_json || (await row(env, orgId))?.published_json;
  if (!json) return null;
  const r = JSON.parse(json);
  return { ...r, derived: derived(r) };
}

const versionView = (v) => ({ id: v.id, name: v.name, auto: v.auto === 1, created_at: v.created_at });

export function registerDesign(app) {
  const owner = requireRole('owner');

  app.get('/api/owner/design', owner, async (c) => {
    const u = c.get('user');
    const d = await row(c.env, u.org_id);
    const { results: versions } = await c.env.DB.prepare('SELECT id,name,auto,created_at FROM design_versions WHERE org_id=? ORDER BY created_at DESC LIMIT 60').bind(u.org_id).all();
    const { results: schedules } = await c.env.DB.prepare(
      'SELECT s.id,s.version_id,s.starts_at,s.ends_at,v.name FROM design_schedules s JOIN design_versions v ON v.id=s.version_id WHERE s.org_id=? AND s.ends_at>? ORDER BY s.starts_at',
    ).bind(u.org_id, now()).all();
    const draft = d ? validateRecipe(JSON.parse(d.draft_json)) : clone(BASE_RECIPE);
    const fontProfile=await c.env.DB.prepare('SELECT font_url FROM org_profiles WHERE org_id=?').bind(u.org_id).first();
    return c.json({
      draft: { ...draft, derived: derived(draft) },
      published: d?.published_json ? JSON.parse(d.published_json) : null,
      has_unpublished: !d || d.draft_json !== d.published_json,
      preset_id: d?.preset_id || null,
      published_at: d?.published_at || null,
      revision:d?.revision||0,
      owns_appearance:Boolean(d),
      compositions:COMPOSITION_OPTIONS,
      versions: versions.map(versionView),
      schedules,
      limits: { named_versions: MAX_NAMED, auto_days: 30 },
      fonts: { ar: FONTS_AR.map(([k, f, , cat]) => ({ id: k, family: f, category: cat })).concat(fontProfile?.font_url?[{id:'custom',family:'خط منشأتك المرفوع / Uploaded brand font',category:'modern'}]:[]), en: FONTS_EN.map(([k, f, , cat]) => ({ id: k, family: f, category: cat })) },
      options: E,
      sectors: SECTORS,
      presets: PRESETS.map((p) => ({ id: p.id, sector: p.sector, name_ar: p.name_ar, name_en: p.name_en, recipe: p.recipe })),
    });
  });

  app.put('/api/owner/design/draft', owner, async (c) => {
    const u = c.get('user');
    const b=await body(c),r = validateRecipe(b.recipe);
    const adjusted = fixContrast(r);
    const revision=await saveDraft(c.env, u.org_id, r,null,b.revision??null);
    return c.json({ draft: { ...r, derived: derived(r) }, adjusted,revision });
  });

  app.post('/api/owner/design/presets/:id/apply', owner, async (c) => {
    const u = c.get('user');
    const p = PRESETS.find((x) => x.id === c.req.param('id'));
    if (!p) throw notFound();
    const d = await row(c.env, u.org_id);
    if (d) await snapshot(c.env, u.org_id, 'قبل تطبيق ' + p.name_ar, JSON.parse(d.draft_json));
    const b=await body(c),next=clone(p.recipe),current=d?validateRecipe(JSON.parse(d.draft_json)):null;
    // Changing appearance must not erase the merchant's own copy and sections.
    if(current&&b.replace_content!==true){if(current.home.enabled)next.home=current.home;next.menu=current.menu;}
    const revision=await saveDraft(c.env, u.org_id, next, p.id,b.revision??null);
    await audit(c.env, u, 'design.preset', { preset: p.id });
    return c.json({ draft: { ...next, derived: derived(next) },revision });
  });

  app.post('/api/owner/design/publish', owner, async (c) => {
    const u = c.get('user');
    const b=await body(c);
    if(b.revision!==undefined&&(!Number.isSafeInteger(b.revision)||b.revision<0))throw bad('invalid_revision');
    const d = await row(c.env, u.org_id);
    if (!d) throw notFound();
    if (d.published_json) await snapshot(c.env, u.org_id, 'المنشور السابق', JSON.parse(d.published_json));
    const t = now();
    const result=await c.env.DB.prepare('UPDATE org_designs SET published_json=draft_json, published_at=?,revision=revision+1 WHERE org_id=? AND (? IS NULL OR revision=?)').bind(t, u.org_id,b.revision??null,b.revision??null).run();
    if(!result.meta.changes)throw conflict('design_conflict');
    await audit(c.env, u, 'design.publish');
    return c.json({ ok: true, published_at: t,revision:(await row(c.env,u.org_id)).revision });
  });

  app.post('/api/owner/design/discard', owner, async (c) => {
    const u = c.get('user');const b=await body(c);
    if(b.revision!==undefined&&(!Number.isSafeInteger(b.revision)||b.revision<0))throw bad('invalid_revision');
    const d = await row(c.env, u.org_id);
    if (!d?.published_json) throw notFound();
    const result=await c.env.DB.prepare('UPDATE org_designs SET draft_json=published_json, updated_at=?,revision=revision+1 WHERE org_id=? AND (? IS NULL OR revision=?)').bind(now(), u.org_id,b.revision??null,b.revision??null).run();if(!result.meta.changes)throw conflict('design_conflict');
    return c.json({ ok: true });
  });

  app.post('/api/owner/design/versions', owner, async (c) => {
    const u = c.get('user');
    const name = String((await body(c)).name ?? '').trim().slice(0, 40);
    if (!name) throw bad('name_required');
    const d = await row(c.env, u.org_id);
    if (!d) throw notFound();
    const n = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM design_versions WHERE org_id=? AND auto=0').bind(u.org_id).first();
    if (n.n >= MAX_NAMED) throw conflict('versions_limit');
    const vid = id();
    await c.env.DB.prepare('INSERT INTO design_versions(id,org_id,name,recipe_json,auto,created_at) VALUES(?,?,?,?,0,?)').bind(vid, u.org_id, name, d.draft_json, now()).run();
    return c.json({ version: { id: vid, name, auto: false } }, 201);
  });

  app.post('/api/owner/design/versions/:id/restore', owner, async (c) => {
    const u = c.get('user');
    const v = await c.env.DB.prepare('SELECT * FROM design_versions WHERE id=? AND org_id=?').bind(c.req.param('id'), u.org_id).first();
    if (!v) throw notFound();
    const d = await row(c.env, u.org_id);
    if (d) await snapshot(c.env, u.org_id, 'قبل استعادة ' + v.name, JSON.parse(d.draft_json));
    await saveDraft(c.env, u.org_id, JSON.parse(v.recipe_json));
    return c.json({ ok: true });
  });

  app.delete('/api/owner/design/versions/:id', owner, async (c) => {
    const u = c.get('user');
    const r = await c.env.DB.prepare('DELETE FROM design_versions WHERE id=? AND org_id=? AND id NOT IN (SELECT version_id FROM design_schedules)').bind(c.req.param('id'), u.org_id).run();
    if (!r.meta.changes) throw conflict('version_in_use_or_missing');
    return c.json({ ok: true });
  });

  app.post('/api/owner/design/schedules', owner, async (c) => {
    const u = c.get('user');
    const b = await body(c);
    const starts = Number(b.starts_at), ends = Number(b.ends_at);
    if (!Number.isSafeInteger(starts) || !Number.isSafeInteger(ends) || ends <= starts) throw bad('invalid_schedule');
    if (ends - starts > 120 * 24 * 3600 * 1000) throw bad('schedule_too_long');
    const v = await c.env.DB.prepare('SELECT id FROM design_versions WHERE id=? AND org_id=?').bind(String(b.version_id || ''), u.org_id).first();
    if (!v) throw notFound();
    const n = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM design_schedules WHERE org_id=? AND ends_at>?').bind(u.org_id, now()).first();
    if (n.n >= 10) throw conflict('schedules_limit');
    const overlap = await c.env.DB.prepare('SELECT id FROM design_schedules WHERE org_id=? AND starts_at<? AND ends_at>?').bind(u.org_id, ends, starts).first();
    if (overlap) throw conflict('schedule_overlap');
    const sid = id();
    await c.env.DB.prepare('INSERT INTO design_schedules(id,org_id,version_id,starts_at,ends_at,created_at) VALUES(?,?,?,?,?,?)').bind(sid, u.org_id, v.id, starts, ends, now()).run();
    await audit(c.env, u, 'design.schedule', { version: v.id });
    return c.json({ schedule: { id: sid } }, 201);
  });

  app.delete('/api/owner/design/schedules/:id', owner, async (c) => {
    const u = c.get('user');
    const r = await c.env.DB.prepare('DELETE FROM design_schedules WHERE id=? AND org_id=?').bind(c.req.param('id'), u.org_id).run();
    if (!r.meta.changes) throw notFound();
    return c.json({ ok: true });
  });
}
