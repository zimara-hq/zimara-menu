// Owner design studio: 100 ready designs, a step-by-step editor with a live phone
// preview, draft and publish, saved versions and scheduled seasonal designs.
import { api, esc, lang, pick } from './common.js';
import {watchForm,markFormDirty,markFormSaved,setFormBusy,confirmAction} from './forms.js';
import {websiteEditor,menuPageEditor,COMPOSITION_LABELS} from './website-editor.js';
const a = (ar, en) => (lang === 'ar' ? ar : en);

const SECTOR = { all: ['الكل', 'All'], cafe: ['مقاهي', 'Cafés'], roastery: ['محامص', 'Roasteries'], restaurant: ['مطاعم', 'Restaurants'], burger: ['برجر وسريع', 'Burgers'], oriental: ['شعبي وشرقي', 'Arabic'], bakery: ['مخابز وحلويات', 'Bakeries'], juice: ['عصائر', 'Juice'], clinic: ['عيادات', 'Clinics'], salon: ['صالونات', 'Salons'], laundry: ['مغاسل وخدمات', 'Services'], seasonal: ['مواسم', 'Seasons'] };
const L = {
  layout: { list: ['قائمة', 'List'], cards: ['بطاقات', 'Cards'], grid: ['شبكة', 'Grid'], compact: ['مضغوط', 'Compact'], text: ['نص فقط', 'Text only'], magazine: ['مجلة', 'Magazine'], elegant: ['أنيق', 'Elegant'], tiles: ['مربعات صور', 'Photo tiles'] },
  categories: { chips: ['أزرار', 'Chips'], pills: ['كبسولات ملونة', 'Pills'], underline: ['خط سفلي', 'Underline'], boxed: ['مربعات', 'Boxed'] },
  motion: { none: ['بدون', 'None'], soft: ['ناعمة', 'Soft'], lively: ['حيوية', 'Lively'] },
  font_size: { sm: ['صغير', 'Small'], md: ['متوسط', 'Medium'], lg: ['كبير', 'Large'] },
  'background.type': { solid: ['لون واحد', 'Solid'], gradient: ['متدرج', 'Gradient'], pattern: ['نقشة', 'Pattern'], image: ['صورة', 'Image'] },
  'background.pattern': { dots: ['نقاط', 'Dots'], grid: ['مربعات', 'Grid'], arabesque: ['زخرفة عربية', 'Arabesque'], waves: ['أمواج', 'Waves'] },
  'cover.height': { none: ['بدون غلاف', 'No cover'], compact: ['صغير', 'Compact'], wide: ['عريض', 'Wide'], tall: ['كبير', 'Tall'] },
  'cover.logo_shape': { circle: ['دائري', 'Circle'], rounded: ['ناعم', 'Rounded'], square: ['مربع', 'Square'] },
  'cover.align': { start: ['جانبي', 'Side'], center: ['بالوسط', 'Centred'] },
  'card.radius': { none: ['حاد', 'Sharp'], sm: ['خفيف', 'Slight'], md: ['متوسط', 'Medium'], lg: ['ناعم', 'Soft'], xl: ['دائري جدًا', 'Round'] },
  'card.shadow': { none: ['بدون', 'None'], soft: ['خفيف', 'Soft'], strong: ['قوي', 'Strong'] },
  'card.image': { start: ['الصورة أول', 'Image first'], end: ['الصورة آخر', 'Image last'] },
  'button.shape': { square: ['مربع', 'Square'], rounded: ['ناعم', 'Rounded'], pill: ['كبسولة', 'Pill'] },
  'button.style': { flat: ['مسطح', 'Flat'], gradient: ['متدرج', 'Gradient'], glass: ['زجاجي', 'Glass'], metal: ['معدني', 'Metal'], neon: ['نيون', 'Neon'], outline: ['إطار', 'Outline'], soft3d: ['بارز', 'Raised'] },
  'button.animation': { none: ['بدون', 'None'], pulse: ['نبض', 'Pulse'], glow: ['توهج', 'Glow'], bounce: ['قفز', 'Bounce'], shine: ['لمعة', 'Shine'] },
};
const COLORS = [['primary', 'اللون الأساسي (الأزرار والسعر)', 'Main colour (buttons, prices)'], ['accent', 'اللون الثاني (التدرج واللمسات)', 'Second colour (gradients, touches)'], ['bg', 'خلفية الصفحة', 'Page background'], ['surface', 'خلفية البطاقات', 'Card background'], ['text', 'لون النص', 'Text colour']];
const SHOW = [['images', 'صور الأصناف', 'Item photos'], ['calories', 'السعرات', 'Calories'], ['descriptions', 'الأوصاف', 'Descriptions'], ['allergens', 'مسببات الحساسية', 'Allergens']];
const CAT = { modern: ['حديث', 'Modern'], classic: ['كلاسيكي', 'Classic'], decorative: ['زخرفي', 'Decorative'] };
const lbl = (pair) => a(pair[0], pair[1]);
const get = (r, path) => path.split('.').reduce((o, k) => o?.[k], r);
function put(r, path, v) { const ks = path.split('.'); let o = r; for (const k of ks.slice(0, -1)) o = o[k] ||= {}; o[ks.at(-1)] = v; }
const strip = ({ derived: _d, ...r }) => r;
const hijri = (ms) => { try { return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', { day: 'numeric', month: 'long', year: 'numeric' }).format(ms); } catch { return ''; } };
const day = (ms) => new Date(ms).toISOString().slice(0, 10);

export async function designStudio(el, me) {
  const [d, br] = await Promise.all([api('/api/owner/design'), api('/api/owner/branches').catch(() => ({ branches: [] }))]);
  const slug = br.branches?.[0]?.slug;
  const initialHome=Boolean(d.published?.home?.enabled);
  const previewUrl=initialHome?`/p/${encodeURIComponent(me?.org?.slug||'')}?design_preview=1`:(slug?`/m/${encodeURIComponent(slug)}?design_preview=1`:`/p/${encodeURIComponent(me?.org?.slug||'')}?design_preview=1`);
  let recipe = strip(d.draft), tab = 'presets', sector = 'all', query = '', saveTimer = null, dirty = d.has_unpublished, revision=d.revision, pendingSave=null,editVersion=0,lastSaved=JSON.stringify(strip(d.draft)),failedSave=false;
  let previewPage=initialHome?'home':'menu',previewWidth=matchMedia('(max-width:1000px)').matches?390:1160;

  el.innerHTML = `<div class="section-intro"><span class="eyebrow">${a('استوديو التصميم', 'DESIGN STUDIO')}</span><h2>${a('صمّم تجربة تشبهك.','Design an experience that feels like you.')}</h2><p>${a('ابنِ الرئيسية والمنيو بنفسك. 100 تركيبة تخطيط من عشرة هياكل وواجهات مختلفة، مع محتواك وخطوطك. التعديل مسودة حتى تنشره.','Build your homepage and menu. 100 structural combinations across ten site frames and hero compositions. Your content and typography remain yours; edits stay private until published.')}</p></div>
  <form id="studio-guard" novalidate hidden></form><div class="studio tenant-builder">
    <div class="studio-panel">
      <div class="studio-bar card"><span id="st-status" class="pill" role="status"></span><button type="button" class="btn ghost sm" id="st-save">${a('حفظ المسودة','Save draft')}</button><div class="row"><button type="button" class="btn ghost sm" id="st-toggle-preview" aria-expanded="false">${a('معاينة الموقع','Preview site')}</button><button type="button" class="btn ghost sm" id="st-discard">${a('تجاهل المسودة', 'Discard draft')}</button><button type="button" class="btn sm" id="st-publish">${a('انشر', 'Publish')}</button></div></div>
      <div class="seg" role="tablist">${[['presets', a('التصاميم الجاهزة', 'Ready designs')], ['home',a('الرئيسية','Homepage')],['menu',a('صفحة المنيو','Menu page')],['custom', a('الهوية والتخطيط', 'Identity & layout')], ['versions', a('النسخ والجدولة', 'Versions & schedule')]].map(([k, t]) => `<button type="button" role="tab" data-tab="${k}">${t}</button>`).join('')}</div>
      <div id="st-body"></div><div id="st-msg" role="status"></div>
    </div>
    <div class="studio-preview" aria-label="${a('معاينة مباشرة', 'Live preview')}"><div class="preview-toolbar"><div class="seg"><button type="button" id="st-page-home" aria-pressed="false">${a('الرئيسية','Homepage')}</button><button type="button" id="st-page-menu" aria-pressed="true">${a('المنيو','Menu')}</button></div><div class="preview-devices">${[[390,a('جوال','Phone')],[768,a('تابلت','Tablet')],[1160,a('كمبيوتر','Desktop')]].map(([width,label])=>`<button type="button" class="btn ghost sm" data-preview-width="${width}" aria-pressed="${width===previewWidth}">${label}</button>`).join('')}</div></div><div class="preview-viewport"><div class="phone-frame"><iframe id="st-frame" title="${a('معاينة الصفحة', 'Page preview')}" src="${esc(previewUrl)}" loading="eager"></iframe></div></div><p class="small muted">${a('معاينة من صفحتك الفعلية. اضغط قسمًا في الرئيسية لتعديله.','Your actual page, live. Click a homepage section to edit it.')}</p></div>
  </div>`;
  const frame = el.querySelector('#st-frame'), bodyEl = el.querySelector('#st-body'), msg = el.querySelector('#st-msg');
  const builder=el.querySelector('.tenant-builder');builder.before(el.querySelector('.studio-bar'));
  const guard=el.querySelector('#studio-guard');watchForm(guard);
  const send = (r) => frame.contentWindow?.postMessage({ type: 'zm-design', recipe: r }, location.origin);
  const onReady = e=>{if(e.origin!==location.origin||e.source!==frame.contentWindow)return;if(e.data?.type==='zm-design-ready')send(recipe);if(e.data?.type==='zm-block-select'){tab='home';render();const block=[...bodyEl.querySelectorAll('[data-editor-block]')].find(node=>node.dataset.editorBlock===e.data.id);if(block){block.open=true;block.scrollIntoView({block:'center'});block.querySelector('summary').focus();}}};
  window.addEventListener('message', onReady);
  const note = (text, err) => { msg.innerHTML = `<p class="msg ${err ? 'error' : ''}">${esc(text)}</p>`; };
  const status = () => { const s = el.querySelector('#st-status'); s.textContent = dirty ? a('مسودة غير منشورة', 'Unpublished draft') : a('منشور ✓', 'Published ✓'); s.className = 'pill ' + (dirty ? 'preparing' : 'ready'); };

  async function save() {
    clearTimeout(saveTimer);
    if(pendingSave){await pendingSave;if(lastSaved===JSON.stringify(recipe))return;}
    if(lastSaved===JSON.stringify(recipe)&&!failedSave)return;
    const snapshot=structuredClone(recipe),version=editVersion,release=setFormBusy(guard);
    statusText(a('جارٍ حفظ المسودة…','Saving draft…'));
    pendingSave=(async()=>{
      try{
        const result=await api('/api/owner/design/draft',{method:'PUT',body:{recipe:snapshot,revision}});
        revision=result.revision;lastSaved=JSON.stringify(snapshot);dirty=true;failedSave=false;
        if(editVersion===version){if(result.adjusted.length)recipe.colors=result.draft.colors;markFormSaved(guard);send(result.draft);}
        status();
        if(result.adjusted.length)note(a('عُدّل لون النص لحماية وضوح القراءة.','Text colour was adjusted to preserve readability.'));
      }catch(error){failedSave=true;statusText(error.status===409?a('تعارض: احتفظنا بتعديلاتك محليًا','Conflict: your local edits are retained'):a('لم تُحفظ التعديلات','Edits not saved'));note(error.status===409?a('تغيّرت المسودة في جلسة أخرى. افتح الاستوديو في نافذة أخرى للمقارنة؛ لم ننشر أو نستبدل تعديلاتك.','The draft changed in another session. Open the studio in another window to compare; nothing was published or overwritten.'):a('تعذر حفظ المسودة. بياناتك باقية هنا. راجع الحقول والاتصال ثم اضغط حفظ المسودة.','Could not save the draft. Your entries remain here. Check the fields and connection, then Save draft.'),true);throw error;}
      finally{release();pendingSave=null;}
    })();
    await pendingSave;
    if(editVersion!==version)await save();
  }
  function statusText(text){el.querySelector('#st-status').textContent=text;}
  function change(path,value){put(recipe,path,value);if(path==='layout')recipe.composition.frame=({list:'atelier',cards:'split',grid:'market',compact:'service',text:'ledger',magazine:'editorial',elegant:'boutique',tiles:'gallery'})[value]||recipe.composition.frame;editVersion++;markFormDirty(guard);dirty=true;status();send(recipe);clearTimeout(saveTimer);saveTimer=setTimeout(()=>{if(el.isConnected)save().catch(()=>{});},700);}
  function preview(page){previewPage=page;frame.src=(page==='home'?`/p/${encodeURIComponent(me.org.slug)}`:`/m/${encodeURIComponent(slug)}`)+'?design_preview=1&lang='+lang;el.querySelector('#st-page-home').setAttribute('aria-pressed',String(page==='home'));el.querySelector('#st-page-menu').setAttribute('aria-pressed',String(page==='menu'));}
  el.querySelector('#st-page-home').setAttribute('aria-pressed',String(initialHome));el.querySelector('#st-page-menu').setAttribute('aria-pressed',String(!initialHome));
  el.querySelector('#st-toggle-preview').onclick=event=>{const on=builder.dataset.mobilePreview!=='on';builder.dataset.mobilePreview=on?'on':'off';event.currentTarget.setAttribute('aria-expanded',String(on));event.currentTarget.textContent=on?a('العودة للتعديل','Back to editing'):a('معاينة الموقع','Preview site');requestAnimationFrame(fit);};
  el.querySelector('#st-page-home').onclick=()=>preview('home');el.querySelector('#st-page-menu').onclick=()=>preview('menu');
  const viewport=el.querySelector('.preview-viewport'),phone=el.querySelector('.phone-frame');
  const fit=()=>{const scale=Math.min(1,Math.max(180,viewport.clientWidth-12)/previewWidth);phone.style.width=previewWidth+'px';phone.style.height='740px';phone.style.transform=`scale(${scale})`;viewport.style.height=740*scale+'px';phone.style.insetInlineStart=Math.max(0,(viewport.clientWidth-previewWidth*scale)/2)+'px';};
  const observer=new ResizeObserver(fit);observer.observe(viewport);
  el.querySelectorAll('[data-preview-width]').forEach(button=>button.onclick=()=>{previewWidth=Number(button.dataset.previewWidth);el.querySelectorAll('[data-preview-width]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));fit();});
  el.querySelector('#st-save').onclick=()=>save().then(()=>note(a('حُفظت المسودة.','Draft saved.'))).catch(()=>{});
  const dispose=new MutationObserver(()=>{if(!el.isConnected){clearTimeout(saveTimer);observer.disconnect();window.removeEventListener('message',onReady);dispose.disconnect();}});dispose.observe(document.getElementById('main'),{childList:true,subtree:true});

  function presetsView() {
    // Show a different frame and hero in each opening tile, rather than ten
    // adjacent variations of one family. IDs and persisted choices stay intact.
    const catalogue=d.presets.map((preset,index)=>({preset,rank:((index%10-Math.floor(index/10)+10)%10)*10+Math.floor(index/10)})).sort((a,b)=>a.rank-b.rank).map(entry=>entry.preset);
    const list = catalogue.filter((p) => (sector === 'all' || p.sector === sector) && (!query || (p.name_ar + ' ' + p.name_en).toLowerCase().includes(query.toLowerCase())));
    bodyEl.innerHTML = `<div class="row"><label class="visually-hidden" for="st-q">${a('ابحث', 'Search')}</label><button type="button" class="btn ghost sm" id="st-clear" ${query?'':'hidden'}>${a('مسح البحث','Clear search')}</button><input id="st-q" type="search" placeholder="${a('ابحث عن تصميم…', 'Search designs…')}" value="${esc(query)}"></div>
    <div class="chip-row" role="group" aria-label="${a('النشاط', 'Trade')}">${Object.keys(SECTOR).map((k) => `<button type="button" class="chip ${k === sector ? 'on' : ''}" data-sector="${k}">${lbl(SECTOR[k])} <small>${k === 'all' ? d.presets.length : d.presets.filter((p) => p.sector === k).length}</small></button>`).join('')}</div>
    <div class="design-grid">${list.map((p) => miniCard(p, p.id === d.preset_id)).join('') || `<p class="muted">${a('ما في نتائج.', 'No results.')}</p>`}</div>`;
    bodyEl.querySelector('#st-clear').onclick=()=>{query='';presetsView();bodyEl.querySelector('#st-q').focus();};
    bodyEl.querySelector('#st-q').oninput = (e) => { query = e.target.value; const pos = e.target.selectionStart; presetsView(); const q = bodyEl.querySelector('#st-q'); q.focus(); q.setSelectionRange(pos, pos); };
    bodyEl.querySelectorAll('[data-sector]').forEach((b) => (b.onclick = () => { sector = b.dataset.sector; presetsView(); }));
    bodyEl.querySelectorAll('[data-try]').forEach((b) => (b.onclick = () => { const p = d.presets.find((x) => x.id === b.dataset.try); send({...p.recipe,home:recipe.home.enabled?recipe.home:p.recipe.home,menu:recipe.menu}); note(a(`تشوف «${p.name_ar}» بالمعاينة. اضغط «اعتمد» لو عجبك.`, `Previewing “${p.name_en}”. Tap “Use” if you like it.`)); }));
    bodyEl.querySelectorAll('[data-use]').forEach((b) => (b.onclick = async () => {
      b.disabled = true;
      try { await save();const r = await api('/api/owner/design/presets/' + b.dataset.use + '/apply', { method: 'POST', body: {revision} }); revision=r.revision;recipe = strip(r.draft);lastSaved=JSON.stringify(recipe);markFormSaved(guard); d.preset_id = b.dataset.use; dirty = true; status(); send(r.draft); presetsView(); note(a('اعتمدنا التصميم كمسودة. خصّصه أو اضغط «انشر».', 'Design set as your draft. Customise it or publish.')); }
      catch { b.disabled = false; note(a('تعذر تطبيق التصميم.', 'Could not apply the design.'), true); }
    }));
  }

  function radios(path) {
    const cur = get(recipe, path), labels = L[path];
    return `<div class="opt-grid" role="radiogroup">${Object.keys(labels).map((v) => `<label class="opt ${v === cur ? 'on' : ''}"><input type="radio" name="${esc(path)}" value="${esc(v)}" ${v === cur ? 'checked' : ''} data-path="${esc(path)}"><span>${lbl(labels[v])}</span></label>`).join('')}</div>`;
  }
  const fontSelect = (key, fonts) => `<select id="st-${key}" data-path="${key}">${Object.keys(CAT).map((cat) => `<optgroup label="${lbl(CAT[cat])} (${fonts.filter((f) => f.category === cat).length})">${fonts.filter((f) => f.category === cat).map((f) => `<option value="${esc(f.id)}" ${recipe[key] === f.id ? 'selected' : ''}>${esc(f.family)}</option>`).join('')}</optgroup>`).join('')}</select>`;
  const step = (n, title, inner, open) => `<details class="card studio-step" ${open ? 'open' : ''}><summary><span class="step-n">${n}</span>${title}</summary><div class="stack">${inner}</div></details>`;

  function customView() {
    const bg = recipe.background;
    bodyEl.innerHTML = [
      step(1, a('الألوان', 'Colours'), COLORS.map(([k, ar, en]) => `<label class="color-row"><input type="color" value="${esc(recipe.colors[k])}" data-path="colors.${k}"><span>${a(ar, en)}</span><code dir="ltr">${esc(recipe.colors[k])}</code></label>`).join('') + `<p class="small muted">${a('نتأكد تلقائيًا إن النص واضح على الخلفية.', 'We automatically keep text readable on the background.')}</p>`, true),
      step(2, a('الخطوط', 'Fonts'), `<label for="st-font_ar">${a('الخط العربي', 'Arabic font')} (${d.fonts.ar.length})</label>${fontSelect('font_ar', d.fonts.ar)}<label for="st-font_en">${a('الخط الإنجليزي', 'English font')} (${d.fonts.en.length})</label>${fontSelect('font_en', d.fonts.en)}<p class="small">${a('حجم الخط', 'Text size')}</p>${radios('font_size')}`),
      step(3, a('الخلفية', 'Background'), radios('background.type') + (bg.type === 'pattern' ? radios('background.pattern') : '') + (bg.type === 'gradient' ? `<label>${a('اتجاه التدرج', 'Gradient angle')} <input type="range" min="0" max="360" step="15" value="${bg.angle}" data-path="background.angle" data-int></label>` : '') + (bg.type === 'image' ? `<label for="st-img">${a('رابط الصورة (https)', 'Image link (https)')}</label><input id="st-img" dir="ltr" inputmode="url" placeholder="https://…" value="${esc(bg.image || '')}" data-path="background.image"><label>${a('ضبابية', 'Blur')} <input type="range" min="0" max="20" value="${bg.blur}" data-path="background.blur" data-int></label>` : '')),
      step(4, a('الغلاف والشعار', 'Cover & logo'), `<p class="small">${a('ارتفاع الغلاف', 'Cover height')}</p>${radios('cover.height')}<p class="small">${a('شكل الشعار', 'Logo shape')}</p>${radios('cover.logo_shape')}<p class="small">${a('مكان الاسم والشعار', 'Name & logo position')}</p>${radios('cover.align')}<label class="check"><input type="checkbox" data-path="cover.logo_shadow" ${recipe.cover.logo_shadow ? 'checked' : ''}> ${a('ظل للشعار', 'Logo shadow')}</label>`),
      step(5, a('تخطيط المنيو', 'Menu layout'), radios('layout')),
      step(6, a('شكل الأقسام', 'Section tabs'), radios('categories')),
      step(7, a('بطاقة الصنف', 'Item card'), `<p class="small">${a('الزوايا', 'Corners')}</p>${radios('card.radius')}<p class="small">${a('الظل', 'Shadow')}</p>${radios('card.shadow')}<p class="small">${a('مكان الصورة', 'Image position')}</p>${radios('card.image')}<label class="check"><input type="checkbox" data-path="card.border" ${recipe.card.border ? 'checked' : ''}> ${a('إطار حول البطاقة', 'Card border')}</label>`),
      step(8, a('الأزرار', 'Buttons'), `<p class="small">${a('الشكل', 'Shape')}</p>${radios('button.shape')}<p class="small">${a('الملمس', 'Texture')}</p>${radios('button.style')}<p class="small">${a('الحركة', 'Animation')}</p>${radios('button.animation')}`),
      step(9, a('حركة الصفحة', 'Page motion'), radios('motion') + `<p class="small muted">${a('لو جوال العميل مفعّل «تقليل الحركة» نوقف الحركات تلقائيًا.', 'If the guest’s phone has Reduce Motion on, animations stop automatically.')}</p>`),
      step(10, a('وش يظهر', 'What to show'), SHOW.map(([k, ar, en]) => `<label class="check"><input type="checkbox" data-path="show.${k}" ${recipe.show[k] ? 'checked' : ''}> ${a(ar, en)}</label>`).join('')),
      step(11,a('هيكل الموقع والواجهة','Site frame & hero'),Object.entries(COMPOSITION_LABELS).map(([key,options])=>`<label>${({frame:a('هيكل الموقع','Site frame'),hero:a('واجهة البداية','Hero composition'),navigation:a('التنقل','Navigation'),section:a('عناوين الأقسام','Section headings'),media:a('نسبة الصور','Image shape'),width:a('عرض الموقع','Site width'),density:a('كثافة المحتوى','Content density')})[key]}<select data-path="composition.${key}">${Object.entries(options).map(([value,label])=>`<option value="${value}" ${recipe.composition[key]===value?'selected':''}>${lbl(label)}</option>`).join('')}</select></label>`).join(''),true),
      step(12,a('مقاسات الخطوط ومسافات القراءة','Typography & reading rhythm'),`<label>${a('خط العناوين','Heading font')}<select data-path="typography.heading_font">${d.fonts.ar.map(f=>`<option value="${esc(f.id)}" ${(recipe.typography.heading_font||recipe.font_ar)===f.id?'selected':''}>${esc(f.family)}</option>`).join('')}</select></label><label>${a('حجم العناوين','Heading scale')}<input type="range" min="100" max="180" value="${recipe.typography.heading_scale}" data-path="typography.heading_scale" data-int></label><label>${a('تباعد السطور','Line height')}<input type="range" min="140" max="210" value="${recipe.typography.line_height}" data-path="typography.line_height" data-int></label><label>${a('تباعد الحروف','Letter spacing')}<input type="range" min="-2" max="4" value="${recipe.typography.spacing}" data-path="typography.spacing" data-int></label>`),
    ].join('');
    bodyEl.querySelectorAll('[data-path]').forEach((inp) => {
      const path = inp.dataset.path;
      const ev = inp.type === 'color' || inp.type === 'range' || inp.tagName === 'INPUT' && inp.type !== 'checkbox' && inp.type !== 'radio' ? 'input' : 'change';
      inp.addEventListener(ev, () => {
        let v = inp.type === 'checkbox' ? inp.checked : inp.value;
        if (inp.dataset.int !== undefined) v = Number(v);
        if (path === 'background.image') { v = v.trim() || null; if (v && !/^https:\/\/[^\s"'()\\<>]+$/.test(v)) return; }
        if (inp.type === 'color') inp.parentElement.querySelector('code').textContent = v;
        change(path, v);
        if (inp.type === 'radio') { inp.closest('.opt-grid').querySelectorAll('.opt').forEach((o) => o.classList.toggle('on', o.querySelector('input').checked)); if (path === 'background.type') customView(); }
      });
    });
  }

  function versionsView() {
    const named = d.versions.filter((v) => !v.auto), auto = d.versions.filter((v) => v.auto);
    bodyEl.innerHTML = `<section class="card stack"><h3>${a('احفظ نسخة من تصميمك', 'Save a version of your design')}</h3><p class="small muted">${a(`تقدر تحفظ لين ${d.limits.named_versions} نسخة بأسماء، مثل «رمضان» أو «اليوم الوطني».`, `Keep up to ${d.limits.named_versions} named versions, like “Ramadan” or “National Day”.`)}</p><form novalidate class="row" id="st-vform"><label class="visually-hidden" for="st-vname">${a('اسم النسخة', 'Version name')}</label><input id="st-vname" maxlength="40" placeholder="${a('مثال: رمضان', 'e.g. Ramadan')}" required><button class="btn" type="submit">${a('احفظ النسخة', 'Save version')}</button></form>
      ${named.length ? `<ul class="plain-list">${named.map((v) => `<li class="row-between"><span><strong>${esc(v.name)}</strong> <small class="muted">${esc(new Date(v.created_at).toLocaleDateString(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB'))}</small></span><span class="row"><button type="button" class="btn ghost sm" data-restore="${esc(v.id)}">${a('استرجع', 'Restore')}</button><button type="button" class="btn ghost sm" data-del="${esc(v.id)}">${a('احذف', 'Delete')}</button></span></li>`).join('')}</ul>` : ''}</section>
    <section class="card stack"><h3>${a('جدولة تصميم', 'Schedule a design')}</h3><p class="small muted">${a('التصميم يتغير لحاله في الوقت اللي تحدده، ويرجع بعدها لتصميمك المنشور.', 'The design switches by itself on the dates you set, then returns to your published design.')}</p>
      ${named.length ? `<form novalidate class="stack" id="st-sform"><label for="st-sv">${a('النسخة', 'Version')}</label><select id="st-sv">${named.map((v) => `<option value="${esc(v.id)}">${esc(v.name)}</option>`).join('')}</select><div class="row"><label>${a('من', 'From')} <input type="date" id="st-from" required></label><label>${a('إلى', 'To')} <input type="date" id="st-to" required></label></div><p class="small muted" id="st-hijri"></p><button class="btn" type="submit">${a('أضف الجدولة', 'Add schedule')}</button></form>` : `<p class="muted">${a('احفظ نسخة أولًا عشان تجدولها.', 'Save a version first to schedule it.')}</p>`}
      ${d.schedules.length ? `<ul class="plain-list">${d.schedules.map((s) => `<li class="row-between"><span><strong>${esc(s.name)}</strong><br><small class="muted">${esc(day(s.starts_at))} ← ${esc(day(s.ends_at))} · ${esc(hijri(s.starts_at))}</small></span><button type="button" class="btn ghost sm" data-unsched="${esc(s.id)}">${a('إلغاء', 'Cancel')}</button></li>`).join('')}</ul>` : ''}</section>
    <section class="card stack"><h3>${a('نسخ تلقائية', 'Automatic snapshots')}</h3><p class="small muted">${a(`نحفظ نسخة تلقائيًا قبل كل نشر أو تطبيق تصميم، وتبقى ${d.limits.auto_days} يوم.`, `We save a snapshot before every publish or design change, kept for ${d.limits.auto_days} days.`)}</p>
      ${auto.length ? `<ul class="plain-list">${auto.slice(0, 15).map((v) => `<li class="row-between"><span>${esc(v.name)} <small class="muted">${esc(new Date(v.created_at).toLocaleString(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB'))}</small></span><button type="button" class="btn ghost sm" data-restore="${esc(v.id)}">${a('استرجع', 'Restore')}</button></li>`).join('')}</ul>` : `<p class="muted">${a('ما في نسخ تلقائية بعد.', 'No snapshots yet.')}</p>`}</section>`;
    const reload = async () => { Object.assign(d, await api('/api/owner/design')); recipe = strip(d.draft);revision=d.revision;lastSaved=JSON.stringify(recipe);markFormSaved(guard); dirty = d.has_unpublished; status(); send(d.draft); versionsView(); };
    const ERR = { versions_limit: a('وصلت الحد الأعلى للنسخ. احذف نسخة قديمة.', 'Version limit reached. Delete an old one.'), schedule_overlap: a('فيه جدولة ثانية بنفس الفترة.', 'Another schedule overlaps these dates.'), schedules_limit: a('وصلت الحد الأعلى للجداول.', 'Schedule limit reached.'), schedule_too_long: a('أقصى مدة للجدولة 120 يوم.', 'A schedule can last at most 120 days.'), version_in_use_or_missing: a('النسخة مستخدمة في جدولة.', 'This version is used by a schedule.') };
    const fail = (err) => note(ERR[err?.message] || a('تعذر تنفيذ الإجراء.', 'Could not complete the action.'), true);
    bodyEl.querySelector('#st-vform').onsubmit = async (e) => { e.preventDefault(); try { clearTimeout(saveTimer); await save(); await api('/api/owner/design/versions', { method: 'POST', body: { name: bodyEl.querySelector('#st-vname').value } }); await reload(); note(a('حفظنا النسخة.', 'Version saved.')); } catch (err) { fail(err); } };
    const from = bodyEl.querySelector('#st-from'), to = bodyEl.querySelector('#st-to'), hj = bodyEl.querySelector('#st-hijri');
    const showHijri = () => { if (hj) hj.textContent = from?.value && to?.value ? `${a('بالهجري:', 'Hijri:')} ${hijri(new Date(from.value).getTime())} ← ${hijri(new Date(to.value).getTime())}` : ''; };
    from?.addEventListener('change', showHijri); to?.addEventListener('change', showHijri);
    const sform = bodyEl.querySelector('#st-sform');
    if (sform) sform.onsubmit = async (e) => {
      e.preventDefault();
      const starts = new Date(from.value + 'T00:00:00+03:00').getTime(), ends = new Date(to.value + 'T23:59:59+03:00').getTime();
      try { await api('/api/owner/design/schedules', { method: 'POST', body: { version_id: bodyEl.querySelector('#st-sv').value, starts_at: starts, ends_at: ends } }); await reload(); note(a('تمت الجدولة.', 'Scheduled.')); } catch (err) { fail(err); }
    };
    bodyEl.querySelectorAll('[data-restore]').forEach((b) => (b.onclick = async () => { try { await api(`/api/owner/design/versions/${b.dataset.restore}/restore`, { method: 'POST', body: {} }); await reload(); note(a('رجعنا النسخة كمسودة. اضغط «انشر» لو تبيها.', 'Version restored as your draft. Publish when ready.')); } catch (err) { fail(err); } }));
    bodyEl.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => { if(!await confirmAction({title:a('حذف النسخة؟','Delete this version?'),description:a('تُحذف النسخة المسماة فقط؛ لا يتغير الموقع المنشور.','Only this saved version is removed; the published site is unchanged.'),confirmLabel:a('حذف النسخة','Delete version'),danger:true}))return; try { await api('/api/owner/design/versions/' + b.dataset.del, { method: 'DELETE', body: {} }); await reload(); } catch (err) { fail(err); } }));
    bodyEl.querySelectorAll('[data-unsched]').forEach((b) => (b.onclick = async () => { try { await api('/api/owner/design/schedules/' + b.dataset.unsched, { method: 'DELETE', body: {} }); await reload(); } catch (err) { fail(err); } }));
  }

  function render() {
    builder.dataset.view=tab;if(tab==='home')preview('home');if(tab==='menu')preview('menu');
    el.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    msg.innerHTML = '';
    bodyEl.onclick=null;bodyEl.oninput=null;bodyEl.onchange=null;bodyEl.oncompositionend=null;
    ({presets:presetsView,custom:customView,versions:versionsView,home:()=>websiteEditor(bodyEl,{recipe,change,preview}),menu:()=>menuPageEditor(bodyEl,{recipe,change,preview})})[tab]();
  }
  el.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { tab = b.dataset.tab; render(); }));
  el.querySelector('#st-publish').onclick = async (e) => {
    if(el.querySelector('[data-uploading=true]'))return note(a('انتظر اكتمال رفع الصورة قبل النشر.','Wait for the image upload before publishing.'),true);
    e.target.disabled = true;
    try { clearTimeout(saveTimer); await save(); const result=await api('/api/owner/design/publish', { method: 'POST', body: {revision} });revision=result.revision;d.published=structuredClone(recipe); dirty = false; status(); note(a('نشرنا تصميمك. عملاؤك يشوفونه الحين.', 'Published. Guests see your new design now.')); }
    catch { note(a('تعذر النشر. حاول مجددًا.', 'Could not publish. Try again.'), true); }
    e.target.disabled = false;
  };
  el.querySelector('#st-discard').onclick = async () => {
    if (!d.published) return note(a('ما في تصميم منشور ترجع له.', 'There is no published design to return to.'), true);
    if(!await confirmAction({title:a('التخلي عن المسودة؟','Discard the draft?'),description:a('ستعود إلى آخر تصميم منشور للرئيسية والمنيو.','Restore the last published homepage and menu.'),confirmLabel:a('التخلي عن المسودة','Discard draft')}))return;
    try { clearTimeout(saveTimer);if(pendingSave)await pendingSave; await api('/api/owner/design/discard', { method: 'POST', body: {revision} }); Object.assign(d, await api('/api/owner/design')); recipe = strip(d.draft);revision=d.revision;lastSaved=JSON.stringify(recipe);failedSave=false;markFormSaved(guard); dirty = false; status(); send(d.draft); render(); } catch { note(a('تعذر التنفيذ.', 'Could not do that.'), true); }
  };
  status(); render();
}

export function miniCard(p, current) {
  const c = p.recipe.colors;
  const r = { none: '0', sm: '4px', md: '8px', lg: '12px', xl: '16px' }[p.recipe.card.radius];
  const btn = { square: '2px', rounded: '8px', pill: '99px' }[p.recipe.button.shape];
  return `<article class="design-card ${current ? 'current' : ''}">
    <div class="mini" data-frame="${esc(p.recipe.composition?.frame||'atelier')}" data-hero="${esc(p.recipe.composition?.hero||'stacked')}" aria-hidden="true" style="--m-bg:${c.bg};--m-sf:${c.surface};--m-p:${c.primary};--m-a:${c.accent};--m-t:${c.text};--m-r:${r};--m-b:${btn}">
      <div class="mini-cover"><img src="/editorial/counter.webp" alt="" loading="lazy"></div><div class="mini-name">${a('رواق','Riwaq')}</div>
      <div class="mini-items mini-${esc(p.recipe.layout)}"><i><img src="/editorial/coffee.webp" alt="" loading="lazy"></i><i><img src="/editorial/pastry.webp" alt="" loading="lazy"></i><i><img src="/editorial/counter.webp" alt="" loading="lazy"></i><i><img src="/editorial/coffee.webp" alt="" loading="lazy"></i></div><div class="mini-btn"></div>
    </div>
    <h4>${esc(pick(p, 'name'))}</h4>
    <div class="row"><button type="button" class="btn ghost sm" data-try="${esc(p.id)}">${a('جرّب', 'Try')}</button><button type="button" class="btn sm" data-use="${esc(p.id)}">${current ? a('مختار ✓', 'Chosen ✓') : a('اعتمد', 'Use')}</button></div>
  </article>`;
}
