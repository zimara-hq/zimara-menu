// Applies a design recipe to a public page. Every value is checked against a
// fixed list or a colour pattern first, so a recipe can never inject CSS.
const HEX = /^#[0-9a-f]{6}$/i;
const IMG = /^(?:https:\/\/|\/)[^\s"'()\\<>]{1,490}$/;
const FONT_FAMILY = {
  tajawal: 'Tajawal', cairo: 'Cairo', almarai: 'Almarai', ibm: 'IBM Plex Sans Arabic', kufi: 'Noto Kufi Arabic', readex: 'Readex Pro',
  changa: 'Changa', rubik: 'Rubik', alexandria: 'Alexandria', zain: 'Zain', noto_sans: 'Noto Sans Arabic', mada: 'Mada',
  harmattan: 'Harmattan', baloo: 'Baloo Bhaijaan 2', kufam: 'Kufam', vazirmatn: 'Vazirmatn', amiri: 'Amiri', naskh: 'Noto Naskh Arabic',
  scheherazade: 'Scheherazade New', lateef: 'Lateef', el_messiri: 'El Messiri', mirza: 'Mirza', reem: 'Reem Kufi', lalezar: 'Lalezar',
  rakkas: 'Rakkas', aref: 'Aref Ruqaa', marhey: 'Marhey', blaka: 'Blaka', handjet: 'Handjet', qahiri: 'Qahiri',
  jakarta: 'Plus Jakarta Sans', inter: 'Inter', poppins: 'Poppins', montserrat: 'Montserrat', outfit: 'Outfit', space: 'Space Grotesk',
  dm_sans: 'DM Sans', playfair: 'Playfair Display', lora: 'Lora', fraunces: 'Fraunces', dm_serif: 'DM Serif Display', bebas: 'Bebas Neue',
};
const SINGLE_WEIGHT = new Set(['lalezar', 'rakkas', 'blaka', 'qahiri', 'dm_serif', 'bebas']);
const LOCAL = new Set(['tajawal', 'jakarta','ibm','readex','alexandria']);
const ENUMS = {
  layout: ['list', 'cards', 'grid', 'compact', 'text', 'magazine', 'elegant', 'tiles'],
  categories: ['chips', 'pills', 'underline', 'boxed'], motion: ['none', 'soft', 'lively'], font_size: ['sm', 'md', 'lg'],
  bg: ['solid', 'gradient', 'pattern', 'image'], pattern: ['dots', 'grid', 'arabesque', 'waves'],
  cover: ['none', 'compact', 'wide', 'tall'], logo: ['circle', 'rounded', 'square'], align: ['start', 'center'],
  radius: ['none', 'sm', 'md', 'lg', 'xl'], shadow: ['none', 'soft', 'strong'], image: ['start', 'end'],
  bshape: ['square', 'rounded', 'pill'], bstyle: ['flat', 'gradient', 'glass', 'metal', 'neon', 'outline', 'soft3d'], banim: ['none', 'pulse', 'glow', 'bounce', 'shine'],
};
const one = (list, v, d) => (list.includes(v) ? v : d);
const luminance=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);

function loadFont(key) {
  if (!FONT_FAMILY[key] || LOCAL.has(key)) return;
  const href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(FONT_FAMILY[key]).replace(/%20/g, '+')}${SINGLE_WEIGHT.has(key) ? '' : ':wght@400;700'}&display=swap`;
  if (document.querySelector(`link[data-font="${key}"]`)) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = href; l.dataset.font = key;
  document.head.append(l);
}

export function applyDesign(r) {
  const root = document.documentElement;
  if (!r || typeof r !== 'object') { delete root.dataset.design; return; }
  const c = r.colors || {}, d = r.derived || {}, s = root.style;
  const set = (name, v) => (HEX.test(v || '') ? s.setProperty(name, v) : s.removeProperty(name));
  root.dataset.design = '1';
  // A designed page uses its own colours in light and dark device modes alike.
  root.dataset.theme = 'light';
  set('--brand', c.primary); set('--accent', c.primary); set('--accent-ink', d.price); set('--on-accent', d.on_primary);
  if(HEX.test(c.primary||'')&&HEX.test(c.surface||'')){
    const lp=luminance(c.primary),ls=luminance(c.surface),ratio=(Math.max(lp,ls)+.05)/(Math.min(lp,ls)+.05);
    s.setProperty('--on-accent',lp>.179?'#111111':'#ffffff');s.setProperty('--accent-ink',ratio>=4.5?c.primary:c.text);
  }
  set('--d-accent2', c.accent); set('--bg', c.bg); set('--surface', c.surface); set('--ink', c.text);
  if (HEX.test(c.text || '') && HEX.test(c.surface || '')) {
    s.setProperty('--muted', `color-mix(in srgb, ${c.text} 68%, ${c.surface})`);
    s.setProperty('--line', `color-mix(in srgb, ${c.text} 14%, ${c.surface})`);
  }
  const ar = FONT_FAMILY[r.font_ar] ? r.font_ar : 'ibm', en = FONT_FAMILY[r.font_en] ? r.font_en : 'jakarta';
  loadFont(ar); loadFont(en);
  const curated=document.querySelector('link[data-curated-fonts]');
  if(!curated){const link=document.createElement('link');link.rel='stylesheet';link.href='/fonts/curated.css';link.dataset.curatedFonts='1';document.head.append(link);}
  const custom=r.font_ar==='custom'&&root.dataset.tenantCustomFont==='1';
  s.setProperty('--font', `${custom?'TenantFont, ':''}'${FONT_FAMILY[ar]}', '${FONT_FAMILY[en]}', system-ui, sans-serif`);
  const type=r.typography||{},heading=FONT_FAMILY[type.heading_font]?type.heading_font:ar;
  loadFont(heading);
  s.setProperty('--tenant-heading-font',`${(r.typography?.heading_font==='custom'||!r.typography?.heading_font&&custom)&&root.dataset.tenantCustomFont==='1'?'TenantFont, ':''}'${FONT_FAMILY[heading]}', '${FONT_FAMILY[en]}', sans-serif`);
  s.setProperty('--tenant-heading-scale',String(Math.max(100,Math.min(180,type.heading_scale||125))/100));
  s.setProperty('--tenant-leading',String(Math.max(140,Math.min(210,type.line_height||175))/100));
  s.setProperty('--tenant-spacing',`${Math.max(-2,Math.min(4,type.spacing||0))/100}em`);
  const composition=r.composition||{};
  for(const[key,values]of Object.entries({frame:['atelier','split','poster','sidebar','editorial','market','gallery','ledger','boutique','service'],hero:['stacked','centred','split','banner','overlay','minimal','wordmark','portrait','inset','panorama'],navigation:['rail','sidebar','index','pills'],section:['plain','numbered','banner','ruled','centred'],media:['square','landscape','portrait','circle'],width:['narrow','regular','wide'],density:['airy','balanced','dense']}))root.dataset['site'+key[0].toUpperCase()+key.slice(1)]=values.includes(composition[key])?composition[key]:values[0];
  root.dataset.menuSearch=r.menu?.search===false?'0':'1';root.dataset.menuPrices=r.menu?.prices===false?'0':'1';root.dataset.menuLoyalty=r.menu?.loyalty===false?'0':'1';root.dataset.menuCart=r.menu?.cart==='bottom'?'bottom':'side';
  const bg = r.background || {}, cv = r.cover || {}, card = r.card || {}, b = r.button || {};
  Object.assign(root.dataset, {
    dLayout: one(ENUMS.layout, r.layout, 'list'), dCats: one(ENUMS.categories, r.categories, 'chips'),
    dMotion: one(ENUMS.motion, r.motion, 'soft'), dSize: one(ENUMS.font_size, r.font_size, 'md'),
    dBg: one(ENUMS.bg, bg.type, 'solid'), dPattern: one(ENUMS.pattern, bg.pattern, 'dots'),
    dCover: one(ENUMS.cover, cv.height, 'wide'), dLogo: one(ENUMS.logo, cv.logo_shape, 'rounded'), dAlign: one(ENUMS.align, cv.align, 'start'),
    dLogoShadow: cv.logo_shadow === false ? '0' : '1',
    dRadius: one(ENUMS.radius, card.radius, 'lg'), dShadow: one(ENUMS.shadow, card.shadow, 'soft'), dBorder: card.border === false ? '0' : '1',
    dImage: one(ENUMS.image, card.image, 'end'),
    dBshape: one(ENUMS.bshape, b.shape, 'rounded'), dBstyle: one(ENUMS.bstyle, b.style, 'flat'), dBanim: one(ENUMS.banim, b.animation, 'none'),
    tenantLayout: ['cards', 'grid', 'tiles', 'magazine'].includes(r.layout) ? 'cards' : 'list',
  });
  s.setProperty('--d-angle', `${Number.isInteger(bg.angle) ? bg.angle : 135}deg`);
  s.setProperty('--d-blur', `${Number.isInteger(bg.blur) ? Math.min(20, bg.blur) : 0}px`);
  if (bg.type === 'image' && IMG.test(bg.image || '')) s.setProperty('--d-image', `url("${bg.image}")`);
  else s.removeProperty('--d-image');
  const show = r.show || {};
  for (const k of ['images', 'calories', 'descriptions', 'allergens']) root.dataset['dHide' + k[0].toUpperCase() + k.slice(1)] = show[k] === false ? '1' : '0';
}

// Live preview inside the design studio: the parent page (same origin only) sends recipes.
export function listenForPreview(onRecipe) {
  if (!new URLSearchParams(location.search).has('design_preview')) return;
  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || e.source !== window.parent) return;
    if (e.data?.type === 'zm-design') {applyDesign(e.data.recipe);onRecipe?.(e.data.recipe);}
  });
  window.parent.postMessage({ type: 'zm-design-ready' }, location.origin);
}
