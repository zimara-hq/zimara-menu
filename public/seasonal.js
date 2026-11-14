// A bounded decorative layer; merchant recipes and page content remain owned by their renderer.
const MOTIFS = new Set(['ramadan', 'eid-fitr', 'eid-adha', 'national', 'founding', 'winter']);
const NAMES = {
  ramadan: ['رمضان كريم', 'Ramadan Kareem'], 'eid-fitr': ['عيد الفطر', 'Eid al-Fitr'],
  'eid-adha': ['عيد الأضحى', 'Eid al-Adha'], national: ['اليوم الوطني', 'Saudi National Day'],
  founding: ['يوم التأسيس', 'Founding Day'], winter: ['شتاء دافئ', 'Winter days'],
};
const CITIES = { riyadh:['الرياض','Riyadh'], jeddah:['جدة','Jeddah'], makkah:['مكة المكرمة','Makkah'], madinah:['المدينة المنورة','Madinah'], dammam:['الدمام','Dammam'], hail:['حائل',"Ha’il"], abha:['أبها','Abha'], tabuk:['تبوك','Tabuk'], taif:['الطائف','Taif'], buraidah:['بريدة','Buraidah'], khobar:['الخبر','Khobar'], jazan:['جازان','Jazan'], najran:['نجران','Najran'] };
const PERIODS = { iftar:['الإفطار','Iftar'], suhoor:['السحور','Suhoor'], seasonal:['الفترة الموسمية','Seasonal hours'] };
const ACCENTS = { ramadan:'#534331', 'eid-fitr':'#807036', 'eid-adha':'#486557', national:'#226649', founding:'#785436', winter:'#405E72' };
const svg = body => `<svg viewBox="0 0 520 360" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">${body}</svg>`;
const star = (x,y,r=12) => `<path d="M${x} ${y-r}L${x+r*.28} ${y-r*.28}L${x+r} ${y}L${x+r*.28} ${y+r*.28}L${x} ${y+r}L${x-r*.28} ${y+r*.28}L${x-r} ${y}L${x-r*.28} ${y-r*.28}Z" fill="currentColor"/>`;
// Authored geometric compositions: no remote illustrations, logo, flag or user-authored SVG.
const ART = {
  ramadan: svg('<path d="M90 360V178C90 98 151 50 210 18C269 50 330 98 330 178V360" stroke="currentColor" stroke-width="2"/><path d="M115 360V180C115 116 166 75 210 48C254 75 305 116 305 180V360" stroke="currentColor" opacity=".4"/><path d="M267 99A80 80 0 1 0 283 234A66 66 0 1 1 267 99Z" fill="currentColor"/><path d="M382 0V102M358 122L382 102L406 122V177L382 197L358 177Z M358 132H406M368 130V172M382 130V183M396 130V172" stroke="currentColor" stroke-width="2"/>'+star(425,238,10)+star(346,266,5)+star(122,72,6)),
  'eid-fitr': svg('<path d="M0 75Q260 215 520 75M0 33Q260 173 520 33" stroke="currentColor" stroke-width="2"/><path d="M70 108V192M180 142V220M300 145V212M420 113V180" stroke="currentColor"/>'+star(70,212,24)+star(180,250,36)+star(300,235,27)+star(420,211,39)+'<circle cx="180" cy="250" r="54" stroke="currentColor"/><circle cx="420" cy="211" r="58" stroke="currentColor" opacity=".4"/>'+star(320,320,9)+star(64,298,8)),
  'eid-adha': svg('<path d="M75 360V193Q75 130 150 90Q225 130 225 193V360M212 360V151Q212 73 300 22Q388 73 388 151V360M375 360V218Q375 158 445 122Q515 158 515 218V360" stroke="currentColor" stroke-width="2"/><path d="M242 360V157Q242 98 300 59Q358 98 358 157V360" stroke="currentColor" opacity=".4"/><path d="M268 226L300 194L332 226L300 258Z" fill="currentColor"/>'+star(150,246,23)+star(445,273,25)+'<path d="M0 320H520M0 334H520" stroke="currentColor" opacity=".4"/>'),
  national: svg('<path d="M0 300L140 160L240 260L430 70L520 160M0 340L140 200L240 300L430 110L520 200M0 260L140 120L240 220L430 30L520 120" stroke="currentColor" stroke-width="3"/><path d="M60 360L175 245L270 340L462 148L520 206" stroke="currentColor" stroke-width="18"/><path d="M0 80L42 38L84 80L42 122Z M83 80L125 38L167 80L125 122Z" fill="currentColor" opacity=".22"/>'+star(316,72,17)+star(70,204,8)),
  founding: svg('<path d="M0 44H520M0 316H520" stroke="currentColor" stroke-width="3"/><path d="M0 70L55 125L110 70L165 125L220 70L275 125L330 70L385 125L440 70L495 125L550 70M-55 290L0 235L55 290L110 235L165 290L220 235L275 290L330 235L385 290L440 235L495 290L550 235" stroke="currentColor" stroke-width="12"/><path d="M0 180L65 130L130 180L65 230Z M130 180L195 130L260 180L195 230Z M260 180L325 130L390 180L325 230Z M390 180L455 130L520 180L455 230Z" stroke="currentColor" stroke-width="3"/><path d="M40 180L65 160L90 180L65 200Z M170 180L195 160L220 180L195 200Z M300 180L325 160L350 180L325 200Z M430 180L455 160L480 180L455 200Z" fill="currentColor"/>'),
  winter: svg('<path d="M300 32V280M193 94L407 218M193 218L407 94M300 66L278 88M300 66L322 88M300 246L278 224M300 246L322 224M222 111L230 141M222 111L252 103M378 201L348 209M378 201L370 171M222 201L252 209M222 201L230 171M378 111L348 103M378 111L370 141" stroke="currentColor" stroke-width="3"/>'+star(126,122,27)+star(438,52,13)+star(98,246,11)+'<path d="M0 339Q110 267 235 317T520 291M0 359Q140 293 270 337T520 319" stroke="currentColor" stroke-width="2"/>'),
};
function contrastInk(hex) {
  const rgb = hex.slice(1).match(/../g).map(v => parseInt(v,16)/255).map(v => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4);
  const luminance = .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];
  return luminance > .179 ? '#000000' : '#ffffff';
}
function textNode(doc, tag, className, text) {
  const node = doc.createElement(tag); node.className = className; node.textContent = text; return node;
}
function cleanText(value, max=600) { return typeof value === 'string' ? value.trim().slice(0,max) : ''; }
function clock(value) { return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : ''; }

export function renderSeason(main, season, { view = 'home' } = {}) {
  if (!main?.ownerDocument) return null;
  const owned = [...main.children].filter(node => node.hasAttribute('data-season-layer'));
  if (!season || !MOTIFS.has(season.motif)) { owned.forEach(node => node.remove()); return null; }
  const doc = main.ownerDocument, en = doc.documentElement.lang === 'en', pick = pair => pair[en ? 1 : 0];
  const motif = season.motif, accent = /^#[0-9a-f]{6}$/i.test(season.accent) ? season.accent : ACCENTS[motif];
  const layer = doc.createElement('section');
  layer.className = `seasons seasons--${motif} seasons--${view === 'menu' ? 'menu' : 'home'}`;
  layer.dataset.seasonLayer = ''; layer.dataset.season = String(season.id || motif);
  layer.setAttribute('aria-label', en ? 'Seasonal experience' : 'الموسم');
  layer.style.setProperty('--seasons-accent',accent); layer.style.setProperty('--seasons-on-accent',contrastInk(accent));
  const art = doc.createElement('div'); art.className = 'seasons-art'; art.setAttribute('aria-hidden','true'); art.innerHTML = ART[motif];
  const copy = doc.createElement('div'); copy.className = 'seasons-copy';
  const name = cleanText(season[en ? 'name_en' : 'name_ar'],120) || cleanText(season[en ? 'name_ar' : 'name_en'],120) || pick(NAMES[motif]);
  copy.append(textNode(doc,'h2','seasons-title',name));
  const message = cleanText(season[en ? 'banner_en' : 'banner_ar']) || cleanText(season[en ? 'banner_ar' : 'banner_en']);
  if (message) copy.append(textNode(doc,'p','seasons-message',message));
  const metadata = doc.createElement('div'); metadata.className = 'seasons-meta';
  const date = cleanText(season.hijri_label,100);
  if (date) metadata.append(textNode(doc,'span','seasons-date',date));
  const city = typeof season.city === 'object' && season.city ? cleanText(season.city[en?'name_en':'name_ar'],100) : pick(CITIES[season.city] || ['','']);
  if (city) metadata.append(textNode(doc,'span','seasons-city',city));
  if (season.preview) metadata.append(textNode(doc,'span','seasons-preview',en ? 'Season preview' : 'معاينة الموسم'));
  if (metadata.childElementCount) copy.append(metadata);
  const periods = doc.createElement('div'); periods.className = 'seasons-periods';
  for (const period of (Array.isArray(season.periods) ? season.periods : []).slice(0,6)) {
    if (!PERIODS[period.kind] || (!period.full_day && (!clock(period.start) || !clock(period.end)))) continue;
    const row = doc.createElement('div'); row.className = 'seasons-period';
    row.append(textNode(doc,'strong','seasons-period-name',pick(PERIODS[period.kind])));
    const time = textNode(doc,'span','seasons-time',period.full_day ? (en ? 'All day' : 'طوال اليوم') : `${period.start} – ${period.end}`); if (!period.full_day) time.dir = 'ltr'; row.append(time);
    const source = textNode(doc,'span','seasons-source',period.source === 'calculated' ? (en ? 'Calculated estimate' : 'تقدير محسوب') : (en ? 'Merchant hours' : 'مواعيد المنشأة'));
    if (period.source === 'calculated' && /^\d{4}-\d{2}-\d{2}$/.test(season.times_date || '')) {
      const date = textNode(doc,'time','seasons-estimate-date',season.times_date); date.dateTime = season.times_date; date.dir = 'ltr'; source.append(' · ',date);
      if (season.timezone === 'Asia/Riyadh') source.append(en ? ' · Riyadh time' : ' · توقيت الرياض');
    }
    row.append(source);
    if (period.active_now && !season.preview && season.calendar_active !== false) row.append(textNode(doc,'span','seasons-now',en ? 'Now' : 'الآن'));
    const links = doc.createElement('div'); links.className = 'seasons-links';
    for (const id of [...new Set(Array.isArray(period.category_ids) ? period.category_ids : [])].slice(0,12)) {
      if (typeof id !== 'string' || id.length > 160) continue;
      // menu.js owns c-{id}; link only to a real, currently rendered category.
      const target = doc.getElementById(`c-${id}`);
      const title = target && main.contains(target) ? target.querySelector('h2,h3')?.textContent?.trim() : '';
      if (!title) continue;
      const link = textNode(doc,'a','seasons-category',title); link.setAttribute('href',`#c-${id}`); links.append(link);
    }
    if (links.childElementCount) row.append(links);
    periods.append(row);
  }
  layer.append(copy,art);
  if(periods.childElementCount){if(view==='menu'){const hours=doc.createElement('details');hours.className='seasons-hours';hours.append(textNode(doc,'summary','',en?'Seasonal hours and menu':'أوقات الموسم وأقسامه'),periods);layer.append(hours);}else layer.append(periods);}
  if (owned.length) { owned[0].replaceWith(layer); owned.slice(1).forEach(node => node.remove()); }
  else main.insertBefore(layer,view==='menu'?(main.querySelector('.menu-sticky')||main.firstChild):([...main.children].find(node => node.tagName === 'SECTION')||main.firstChild));
  return layer;
}
