import {icon} from './icons.js';
// Owner design studio: 100 ready designs, a step-by-step editor with a live phone
// preview, draft and publish, saved versions and scheduled seasonal designs.
import { api, esc, lang, pick } from './common.js';
import {watchForm,markFormDirty,markFormSaved,setFormBusy,confirmAction} from './forms.js';
import {websiteEditor,menuPageEditor,COMPOSITION_LABELS,BLOCK_TYPES} from './website-editor.js';
import {createDesignHistory} from './studio-history.js';
import {mountWorkbench} from './studio-workbench.js';
import {mountStudioInline} from './studio-inline.js';
import {imageField,wireImageFields} from './uploads.js';
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
  const [d, br] = await Promise.all([api('/api/owner/design'), api('/api/owner/branches')]);
  const slug = br.branches?.[0]?.slug;
  const initialHome=Boolean(d.draft?.home?.enabled||d.published?.home?.enabled);
  const previewUrl=initialHome?`/p/${encodeURIComponent(me?.org?.slug||'')}?design_preview=1`:(slug?`/m/${encodeURIComponent(slug)}?design_preview=1`:`/p/${encodeURIComponent(me?.org?.slug||'')}?design_preview=1`);
  const requested=new URLSearchParams(location.search).get('studio'),initialTab=({identity:'custom',home:'home',menu:'menu',templates:'presets'})[requested]||(initialHome?'home':'presets');
  let recipe = strip(d.draft), tab = initialTab, sector = 'all', query = '', replacePresetContent = false, saveTimer = null, dirty = d.has_unpublished, revision=d.revision, pendingSave=null,editVersion=0,lastSaved=d.owns_appearance?JSON.stringify(strip(d.draft)):null,failedSave=false;
  const history=createDesignHistory();let historySnapshot=structuredClone(recipe),selectedBlock=recipe.home.blocks[0]?.id||'footer',websiteApi=null,workbench=null,previewPresetId=null,adoptingPreview=false,publishing=false;
  let previewPage=initialHome?'home':'menu',previewWidth=matchMedia('(max-width:600px)').matches?390:matchMedia('(max-width:1000px)').matches?768:1160;

  el.innerHTML = `<div class="section-intro"><span class="eyebrow">${a('استوديو التصميم', 'DESIGN STUDIO')}</span><h1>${a('استوديو الموقع','Website studio')}</h1><p>${a('ابنِ الرئيسية والمنيو بنفسك. اختر تصميمًا، واضغط على النص أو الصورة في المعاينة لتعديلها. محتواك وخطك وألوانك لك. لا تظهر تعديلاتك للعملاء حتى تنشرها.','Build your homepage and menu. Choose a design, then edit text and images directly in the preview. Your content, fonts and colors remain yours. Changes stay private until published.')}</p></div>
  <form id="studio-guard" novalidate hidden></form><div class="studio tenant-builder">
    <div class="studio-panel">
      <div class="studio-bar card"><a class="studio-exit" href="#overview">${a('لوحة المنشأة','Workspace')} ${icon('arrowUpRight',16)}</a><a class="studio-live" id="st-open-site" href="/p/${esc(me.org.slug)}" target="_blank" rel="noopener">${a('افتح المنشور','Open published')} ${icon('arrowUpRight',16)}</a><div class="studio-history"><button type="button" class="btn ghost sm" id="st-undo" aria-label="${a('تراجع','Undo')}" title="${a('تراجع','Undo')}" disabled>${icon('undo',18)}</button><button type="button" class="btn ghost sm" id="st-redo" aria-label="${a('إعادة','Redo')}" title="${a('إعادة','Redo')}" disabled>${icon('redo',18)}</button></div><span id="st-status" class="pill" role="status"></span><button type="button" class="btn ghost sm" id="st-save">${a('حفظ المسودة','Save draft')}</button><div class="row"><button type="button" class="btn ghost sm" id="st-focus" aria-pressed="false">${a('توسيع المعاينة','Expand canvas')}</button><button type="button" class="btn ghost sm" id="st-inspector" aria-expanded="true">${a('الخصائص','Properties')}</button><button type="button" class="btn ghost sm" id="st-sections">${a('الأقسام','Sections')}</button><button type="button" class="btn ghost sm" id="st-toggle-preview" aria-expanded="false">${a('معاينة الموقع','Preview site')}</button><button type="button" class="btn ghost sm" id="st-discard">${a('تجاهل المسودة', 'Discard draft')}</button><button type="button" class="btn sm" id="st-publish">${a('انشر', 'Publish')}</button></div></div>
      <div class="seg" role="tablist">${[['presets', a('التصاميم الجاهزة', 'Ready designs')], ['home',a('الرئيسية','Homepage')],['menu',a('صفحة المنيو','Menu page')],['custom', a('الهوية', 'Identity')], ['versions', a('النسخ والجدولة', 'Versions & schedule')]].map(([k, t]) => `<button type="button" role="tab" data-tab="${k}">${t}</button>`).join('')}</div>
      <div id="st-body"></div><div id="st-msg" role="status"></div>
    </div>
    <div class="studio-preview" aria-label="${a('معاينة مباشرة', 'Live preview')}"><div class="preview-toolbar"><div class="seg"><button type="button" id="st-page-home" aria-pressed="false">${a('الرئيسية','Homepage')}</button><button type="button" id="st-page-menu" aria-pressed="true">${a('المنيو','Menu')}</button></div><div class="preview-devices">${[[390,a('جوال','Phone')],[768,a('تابلت','Tablet')],[1160,a('كمبيوتر','Desktop')]].map(([width,label])=>`<button type="button" class="btn ghost sm" data-preview-width="${width}" aria-pressed="${width===previewWidth}">${label}</button>`).join('')}</div></div><div class="preview-viewport"><div class="phone-frame"><iframe id="st-frame" title="${a('معاينة الصفحة', 'Page preview')}" src="${esc(previewUrl)}" loading="eager"></iframe></div></div><p class="small muted">${a('معاينة من صفحتك الفعلية. اضغط قسمًا في الرئيسية لتعديله.','Your actual page, live. Click a homepage section to edit it.')}</p></div>
  </div>`;
  const frame = el.querySelector('#st-frame'), bodyEl = el.querySelector('#st-body'), msg = el.querySelector('#st-msg');
  const builder=el.querySelector('.tenant-builder');builder.before(el.querySelector('.studio-bar'));const workTabs=el.querySelector('.studio-panel>.seg');workTabs.classList.add('studio-worktabs');workTabs.setAttribute('aria-label',a('تحرير الموقع','Website editing'));bodyEl.setAttribute('role','tabpanel');builder.before(workTabs);builder.dataset.mobilePreview='on';el.querySelector('#st-toggle-preview').textContent=a('الخصائص','Properties');
  workbench=mountWorkbench(builder,{getRecipe:()=>recipe,getSelected:()=>selectedBlock,onSelect:selectBlock,onChange:(path,value)=>{change(path,value);if(path==='home.blocks')render();},onAdd:type=>websiteApi?.addBlock(type),onTab:page=>{tab=page;render();}});
  const guard=el.querySelector('#studio-guard');watchForm(guard);
  const send = (r) => frame.contentWindow?.postMessage({ type: 'zm-design', recipe: r }, location.origin);
  const onReady = e=>{if(e.origin!==location.origin||e.source!==frame.contentWindow)return;if(e.data?.type==='zm-design-ready'){builder.dataset.previewReady='true';send(previewPresetId?previewRecipe(d.presets.find(p=>p.id===previewPresetId)):recipe);}};
  window.addEventListener('message', onReady);
  const inlineDispose=mountStudioInline({frame,getRecipe:()=>previewPresetId?null:recipe,
    onChange:(next,meta)=>{change(meta.blockId===null?'menu':'home.blocks',meta.blockId===null?next.menu:next.home.blocks);render();},
    onImage:openInlineImage,onSelect:id=>{selectedBlock=id;websiteApi?.select(id);workbench?.update(tab);},onStatus:text=>note(text,true)});
  async function flushInline(){if(builder.dataset.previewReady==='true')await inlineDispose.flush();}
  el.querySelector('#st-focus').onclick=event=>{const on=builder.dataset.focus!=='true';builder.dataset.focus=String(on);event.currentTarget.setAttribute('aria-pressed',String(on));event.currentTarget.textContent=on?a('إظهار اللوحات','Show panels'):a('توسيع المعاينة','Expand canvas');requestAnimationFrame(fit);};
  el.querySelector('#st-inspector').onclick=event=>{const hidden=builder.dataset.inspectorHidden!=='true';builder.dataset.inspectorHidden=String(hidden);event.currentTarget.setAttribute('aria-expanded',String(!hidden));requestAnimationFrame(fit);};
  function openInlineImage(target){
    const block=recipe.home.blocks.find(b=>b.id===target.blockId);if(!block)return;
    const source=target.index===undefined?block:block.items?.[target.index];if(!source)return;
    el.querySelector('#st-inline-media')?.remove();
    const panel=document.createElement('section');panel.id='st-inline-media';panel.className='studio-inline-media';panel.setAttribute('aria-label',a('تغيير الصورة المحددة','Replace selected image'));
    panel.innerHTML=`<div class="row"><h3>${a('هذه الصورة، باختيارك.','Make this image yours.')}</h3><button type="button" class="btn ghost sm" id="st-media-close">${a('إغلاق','Close')}</button></div>${imageField('value',a('الصورة المحددة','Selected image'),source.image||'','st-inline')}<button type="button" class="btn" id="st-media-apply">${a('اعتماد الصورة','Apply image')}</button><div id="st-media-library"></div><p role="status" id="st-media-status"></p>`;
    el.querySelector('.studio-panel').prepend(panel);wireImageFields(panel);builder.dataset.inspectorHidden='false';builder.dataset.focus='false';el.querySelector('#st-inspector').setAttribute('aria-expanded','true');el.querySelector('#st-focus').setAttribute('aria-pressed','false');el.querySelector('#st-focus').textContent=a('توسيع المعاينة','Expand canvas');
    if(matchMedia('(max-width:1000px)').matches){builder.dataset.mobilePreview='off';builder.dataset.mobilePane='';}
    const input=panel.querySelector('input[name=value]');panel.querySelector('#st-media-close').onclick=()=>panel.remove();
    panel.querySelector('#st-media-apply').onclick=()=>{
      if(panel.querySelector('[data-uploading=true]'))return;
      const value=input.value.trim();if(value&&!/^(?:https:\/\/|\/(?!\/))[^\s"'()\\<>]{1,490}$/.test(value)){panel.querySelector('#st-media-status').textContent=a('اختر صورة مرفوعة أو رابط https صحيح.','Use an uploaded image or a valid https URL.');return;}
      const blocks=structuredClone(recipe.home.blocks),current=blocks.find(b=>b.id===target.blockId),destination=target.index===undefined?current:current?.items?.[target.index];if(!destination)return;
      destination.image=value;change('home.blocks',blocks);panel.remove();render();note(a('تغيّرت الصورة في المسودة. انشرها عندما تكون جاهزًا.','Image updated in your draft. Publish when ready.'));
    };
    api('/api/owner/menu').then(menu=>{if(!panel.isConnected)return;const images=[...new Set(menu.items.map(i=>i.image_url).filter(Boolean))].slice(0,12);const library=panel.querySelector('#st-media-library');library.innerHTML=`<h4>${a('من صور أصنافك','From your item photos')}</h4><div class="studio-photo-library">${images.map(url=>`<button type="button" data-photo="${esc(url)}" aria-label="${a('اختيار هذه الصورة','Choose this image')}"><img src="${esc(url)}" alt="" loading="lazy"></button>`).join('')}</div>`;library.querySelectorAll('[data-photo]').forEach(button=>button.onclick=()=>{input.value=button.dataset.photo;input.dispatchEvent(new Event('change',{bubbles:true}));input.focus();});}).catch(()=>{});
    panel.scrollIntoView({block:'nearest'});panel.querySelector('#st-media-close').focus();
  }

  const note = (text, err) => { msg.innerHTML = `<p class="msg ${err ? 'error' : ''}">${esc(text)}</p>`; };
  const status = () => { frame.inert=Boolean(previewPresetId); const s = el.querySelector('#st-status'); s.textContent = previewPresetId?a('معاينة لم تُعتمد','Preview not applied'):(dirty ? a('مسودة غير منشورة', 'Unpublished draft') : a('منشور', 'Published')); s.className = 'pill ' + (previewPresetId?'':dirty ? 'preparing' : 'ready');el.querySelector('#st-publish').disabled=publishing||Boolean(previewPresetId);el.querySelector('#st-save').disabled=Boolean(previewPresetId);el.querySelector('#st-undo').disabled=!history.canUndo;el.querySelector('#st-redo').disabled=!history.canRedo; };

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
        if(editVersion===version){if(result.adjusted.length)recipe.colors=result.draft.colors;historySnapshot=structuredClone(recipe);markFormSaved(guard);send(result.draft);}
        status();
        if(result.adjusted.length)note(a('عُدّل لون النص لحماية وضوح القراءة.','Text colour was adjusted to preserve readability.'));
      }catch(error){failedSave=true;statusText(error.status===409?a('تعارض: احتفظنا بتعديلاتك محليًا','Conflict: your local edits are retained'):a('لم تُحفظ التعديلات','Edits not saved'));note(error.status===409?a('تغيّرت المسودة في جلسة أخرى. افتح الاستوديو في نافذة أخرى للمقارنة؛ لم ننشر أو نستبدل تعديلاتك.','The draft changed in another session. Open the studio in another window to compare; nothing was published or overwritten.'):a('تعذر حفظ المسودة. بياناتك باقية هنا. راجع الحقول والاتصال ثم اضغط حفظ المسودة.','Could not save the draft. Your entries remain here. Check the fields and connection, then Save draft.'),true);throw error;}
      finally{release();pendingSave=null;}
    })();
    await pendingSave;
    if(editVersion!==version)await save();
  }
  function statusText(text){el.querySelector('#st-status').textContent=text;}
  function change(path,value){if(JSON.stringify(get(historySnapshot,path))===JSON.stringify(value))return;history.record(historySnapshot,{key:path,merge:typeof value==='string'||typeof value==='number'});put(recipe,path,value);historySnapshot=structuredClone(recipe);if(path==='layout')recipe.composition.frame=({list:'atelier',cards:'split',grid:'market',compact:'service',text:'ledger',magazine:'editorial',elegant:'boutique',tiles:'gallery'})[value]||recipe.composition.frame;editVersion++;markFormDirty(guard);dirty=true;status();workbench?.update(tab);send(recipe);clearTimeout(saveTimer);saveTimer=setTimeout(()=>{if(el.isConnected)save().catch(()=>{});},700);}
  function selectBlock(id){selectedBlock=id;if(matchMedia('(max-width:1000px)').matches){builder.dataset.mobilePane='';builder.dataset.mobilePreview='off';el.querySelector('#st-toggle-preview').textContent=a('معاينة الموقع','Preview site');}if(tab!=='home'){tab='home';render();}else{websiteApi?.select(id);workbench.update(tab);el.querySelector('.studio-panel').dataset.inspectorTitle=id==='footer'?a('تذييل الموقع','Site footer'):a(...(BLOCK_TYPES[recipe.home.blocks.find(b=>b.id===id)?.type]||BLOCK_TYPES.hero));}frame.contentWindow?.postMessage({type:'zm-highlight-block',id},location.origin);}
  function travel(kind){if(previewPresetId)clearPreview();const snapshot=history[kind](recipe);if(!snapshot)return;recipe=snapshot;historySnapshot=structuredClone(recipe);editVersion++;markFormDirty(guard);dirty=true;status();send(recipe);render();clearTimeout(saveTimer);saveTimer=setTimeout(()=>save().catch(()=>{}),700);}
  el.querySelector('#st-undo').onclick=()=>travel('undo');el.querySelector('#st-redo').onclick=()=>travel('redo');
  const onShortcut=event=>{if(!el.isConnected||!(event.ctrlKey||event.metaKey)||event.altKey||event.target.closest('input,textarea,select,[contenteditable=true]'))return;if(event.key.toLowerCase()==='z'){event.preventDefault();travel(event.shiftKey?'redo':'undo');}else if(event.ctrlKey&&event.key.toLowerCase()==='y'){event.preventDefault();travel('redo');}};document.addEventListener('keydown',onShortcut);
  function preview(page){previewPage=page;const publicPath=page==='menu'&&slug?`/m/${encodeURIComponent(slug)}`:`/p/${encodeURIComponent(me.org.slug)}`;el.querySelector('#st-open-site').href=publicPath+(lang==='en'?'?lang=en':'');const unavailable=page==='menu'&&!slug;el.querySelector('.studio-preview').dataset.unavailable=String(unavailable);const destination=publicPath+'?design_preview=1&lang='+lang;if(frame.getAttribute('src')!==destination){builder.dataset.previewReady='false';frame.src=destination;}el.querySelector('#st-page-home').setAttribute('aria-pressed',String(page==='home'));el.querySelector('#st-page-menu').setAttribute('aria-pressed',String(page==='menu'));}
  el.querySelector('#st-page-home').setAttribute('aria-pressed',String(initialHome));el.querySelector('#st-page-menu').setAttribute('aria-pressed',String(!initialHome));
  el.querySelector('#st-toggle-preview').onclick=event=>{const on=builder.dataset.mobilePreview!=='on';builder.dataset.mobilePane='';builder.dataset.mobilePreview=on?'on':'off';event.currentTarget.setAttribute('aria-expanded',String(on));event.currentTarget.textContent=on?a('الخصائص','Properties'):a('معاينة الموقع','Preview site');requestAnimationFrame(fit);};
  el.querySelector('#st-page-home').onclick=()=>preview('home');el.querySelector('#st-page-menu').onclick=()=>preview('menu');
  el.querySelector('#st-sections').onclick=()=>{builder.dataset.mobilePane=builder.dataset.mobilePane==='outline'?'':'outline';};
  const previewBar=document.createElement('div');previewBar.id='st-template-preview-bar';previewBar.className='studio-template-preview';previewBar.hidden=true;previewBar.innerHTML=`<strong id="st-preview-title"></strong><span>${a('معاينة خاصة؛ لم يُعتمد بعد.','Private preview; not applied yet.')}</span><div><button type="button" class="btn ghost sm" id="st-preview-back">${a('العودة للتصاميم','Back to designs')}</button><button type="button" class="btn sm" id="st-preview-use">${a('اعتماد وتخصيص','Use and customise')}</button></div>`;el.querySelector('.studio-preview').prepend(previewBar);const emptyPreview=document.createElement('section');emptyPreview.className='wb-empty-preview';emptyPreview.innerHTML=`<h3>${a('ابدأ بفرعك الأول','Start with your first branch')}</h3><p>${a('معاينة المنيو تحتاج فرعًا. إعداداتك محفوظة كمسودة.','Menu preview needs a branch. Your settings remain in the draft.')}</p><a href="#branches" class="btn">${a('إدارة الفروع','Manage branches')} ${icon('arrowUpRight',16)}</a>`;el.querySelector('.studio-preview').append(emptyPreview);
  function previewRecipe(p){return p?{...p.recipe,home:replacePresetContent?p.recipe.home:recipe.home,menu:replacePresetContent?p.recipe.menu:recipe.menu}:recipe;}
  function clearPreview(){previewPresetId=null;builder.dataset.trying='';previewBar.hidden=true;send(recipe);status();}
  el.querySelector('#st-preview-back').onclick=clearPreview;el.querySelector('#st-preview-use').onclick=()=>{if(previewPresetId){adoptingPreview=true;bodyEl.querySelector('[data-use="'+CSS.escape(previewPresetId)+'"]')?.click();}};
  const viewport=el.querySelector('.preview-viewport'),phone=el.querySelector('.phone-frame');
  const fit=()=>{const scale=Math.min(1,Math.max(180,viewport.clientWidth-12)/previewWidth);phone.style.width=previewWidth+'px';phone.style.height='740px';phone.style.transform=`scale(${scale})`;viewport.style.height=740*scale+'px';phone.style.insetInlineStart=Math.max(0,(viewport.clientWidth-previewWidth*scale)/2)+'px';};
  const observer=new ResizeObserver(fit);observer.observe(viewport);
  el.querySelectorAll('[data-preview-width]').forEach(button=>button.onclick=()=>{previewWidth=Number(button.dataset.previewWidth);el.querySelectorAll('[data-preview-width]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));fit();});
  el.querySelector('#st-save').onclick=async e=>{e.currentTarget.disabled=true;try{await flushInline();await save();note(a('حُفظت المسودة.','Draft saved.'));}catch{note(a('لم نحفظ. أنهِ تحرير النص أو تحقق من اتصال المعاينة ثم أعد المحاولة.','Not saved. Finish editing or check the preview connection, then retry.'),true);}finally{el.querySelector('#st-save').disabled=Boolean(previewPresetId);}};
  const dispose=new MutationObserver(()=>{if(!el.isConnected){clearTimeout(saveTimer);observer.disconnect();document.removeEventListener('keydown',onShortcut);workbench.close();inlineDispose();window.removeEventListener('message',onReady);dispose.disconnect();}});dispose.observe(document.getElementById('main'),{childList:true,subtree:true});

  function presetsView() {
    // Show a different frame and hero in each opening tile, rather than ten
    // adjacent variations of one family. IDs and persisted choices stay intact.
    const catalogue=d.presets.map((preset,index)=>({preset,rank:((index%10-Math.floor(index/10)+10)%10)*10+Math.floor(index/10)})).sort((a,b)=>a.rank-b.rank).map(entry=>entry.preset);
    const list = catalogue.sort((a,b)=>Number(Boolean(b.curated))-Number(Boolean(a.curated))).filter((p) => (sector === 'all' || p.sector === sector) && (!query || (p.name_ar + ' ' + p.name_en + ' ' + p.id).toLowerCase().includes(query.toLowerCase())));
    bodyEl.innerHTML = `<div class="row"><label class="visually-hidden" for="st-q">${a('ابحث', 'Search')}</label><button type="button" class="btn ghost sm" id="st-clear" ${query?'':'hidden'}>${a('مسح البحث','Clear search')}</button><input id="st-q" type="search" placeholder="${a('ابحث عن تصميم…', 'Search designs…')}" value="${esc(query)}"></div>
    <div class="chip-row" role="group" aria-label="${a('النشاط', 'Trade')}">${Object.keys(SECTOR).map((k) => `<button type="button" class="chip ${k === sector ? 'on' : ''}" data-sector="${k}">${lbl(SECTOR[k])} <small>${k === 'all' ? d.presets.length : d.presets.filter((p) => p.sector === k).length}</small></button>`).join('')}</div>
    <label class="check"><input type="checkbox" id="st-replace-content" ${replacePresetContent?'checked':''}>${a('استخدم أقسام التصميم ومحتواه التوضيحي بدل محتوى المسودة','Replace draft sections and copy with this design’s illustrative content')}</label><p class="small muted">${a('20 تصميمًا منسّقًا ببنية مختلفة، مع معاينات من الموقع الفعلي. بقية الخيارات امتدادات للمحرك.','20 authored designs with different structures and actual site previews. Other choices extend the recipe engine.')}</p><div class="design-grid">${list.map((p) => miniCard(p, p.id === d.preset_id)).join('') || `<p class="muted">${a('ما في نتائج.', 'No results.')}</p>`}</div>`;
    bodyEl.querySelector('#st-replace-content').onchange=e=>{replacePresetContent=e.target.checked;clearPreview();};
    bodyEl.querySelector('#st-clear').onclick=()=>{query='';presetsView();bodyEl.querySelector('#st-q').focus();};
    bodyEl.querySelector('#st-q').oninput = (e) => { query = e.target.value; const pos = e.target.selectionStart; presetsView(); const q = bodyEl.querySelector('#st-q'); q.focus(); q.setSelectionRange(pos, pos); };
    bodyEl.querySelectorAll('[data-sector]').forEach((b) => (b.onclick = () => { sector = b.dataset.sector; presetsView(); }));
    bodyEl.querySelectorAll('[data-try]').forEach((b) => (b.onclick = async () => { b.disabled=true;try{if(pendingSave||failedSave||editVersion>0)await save();const p = d.presets.find((x) => x.id === b.dataset.try);previewPresetId=p.id;status();builder.dataset.trying='on';el.querySelector('#st-template-preview-bar').hidden=false;el.querySelector('#st-preview-title').textContent=a('معاينة: ','Preview: ')+pick(p,'name'); send({...p.recipe,home:replacePresetContent?p.recipe.home:recipe.home,menu:replacePresetContent?p.recipe.menu:recipe.menu}); note(a(`تشوف «${p.name_ar}» بالمعاينة. اضغط «اعتمد» لو عجبك.`, `Previewing “${p.name_en}”. Tap “Use” if you like it.`));}catch{note(a('تعذر تجهيز المعاينة. احتفظنا بتعديلاتك؛ أعد المحاولة.','Could not prepare preview. Your edits are retained; retry.'),true);}finally{if(b.isConnected)b.disabled=false;} }));
    bodyEl.querySelectorAll('[data-use]').forEach((b) => (b.onclick = async () => {
      b.disabled = true;
      try { await flushInline();await save();const r = await api('/api/owner/design/presets/' + b.dataset.use + '/apply', { method: 'POST', body: {revision,replace_content:replacePresetContent} }); revision=r.revision;history.record(historySnapshot);recipe = strip(r.draft);historySnapshot=structuredClone(recipe);lastSaved=JSON.stringify(recipe);markFormSaved(guard); d.preset_id = b.dataset.use; dirty = true; status(); send(r.draft); presetsView();if(adoptingPreview){adoptingPreview=false;clearPreview();tab=recipe.home.enabled?'home':'custom';render();} note(a('اعتمدنا التصميم كمسودة. خصّصه أو اضغط «انشر».', 'Design set as your draft. Customise it or publish.')); }
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
    const reload = async () => { Object.assign(d, await api('/api/owner/design')); recipe = strip(d.draft);history.clear();historySnapshot=structuredClone(recipe);revision=d.revision;lastSaved=JSON.stringify(recipe);markFormSaved(guard); dirty = d.has_unpublished; status(); send(d.draft); versionsView(); };
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
    builder.dataset.view=tab;builder.dataset.mobilePane='';if(['custom','versions','presets'].includes(tab))builder.dataset.mobilePreview='off';if(tab==='home')preview('home');if(tab==='menu')preview('menu');
    el.querySelector('.studio-panel').dataset.inspectorTitle=tab==='home'?(selectedBlock==='footer'?a('تذييل الموقع','Site footer'):a(...(BLOCK_TYPES[recipe.home.blocks.find(b=>b.id===selectedBlock)?.type]||BLOCK_TYPES.hero))):({menu:a('خصائص المنيو','Menu properties'),custom:a('هوية الموقع','Site identity'),versions:a('النسخ والجدولة','Versions & schedule')})[tab]||'';
    el.querySelector('.preview-toolbar').dataset.previewLabel=previewPage==='home'?a('الصفحة الرئيسية','Homepage'):a('صفحة المنيو','Menu page');
    el.querySelectorAll('[data-tab]').forEach((b) => {b.setAttribute('aria-selected',String(b.dataset.tab===tab));b.tabIndex=b.dataset.tab===tab?0:-1;b.id='st-tab-'+b.dataset.tab;b.setAttribute('aria-controls','st-body');});bodyEl.setAttribute('aria-labelledby','st-tab-'+tab);
    msg.innerHTML = '';websiteApi=null;
    bodyEl.onclick=null;bodyEl.oninput=null;bodyEl.onchange=null;bodyEl.oncompositionend=null;
    ({presets:presetsView,custom:customView,versions:versionsView,home:()=>{websiteApi=websiteEditor(bodyEl,{recipe,change,preview,compact:true,selectedId:()=>selectedBlock,onSelectionChange:id=>{selectedBlock=id||'footer';},onStructureChange:()=>{selectBlock(selectedBlock);if(matchMedia('(max-width:1000px)').matches){builder.dataset.mobilePane='';builder.dataset.mobilePreview='off';}}});},menu:()=>{menuPageEditor(bodyEl,{recipe,change,preview});const group=document.createElement('section');group.className='card stack';group.innerHTML=`<label for="st-menu-layout">${a('تخطيط المنيو','Menu layout')}</label><select id="st-menu-layout" data-menu-layout>${['grid','list','text',...(!['grid','list','text'].includes(recipe.layout)?[recipe.layout]:[])].map(value=>`<option value="${esc(value)}" ${value===recipe.layout?'selected':''}>${lbl(L.layout[value]||[value,value])}</option>`).join('')}</select><p class="small muted">${a('التخطيط مسودة خاصة حتى تضغط انشر. النص فقط يخفي صور البطاقات.','Layout stays private until you publish. Text only hides card images.')}</p>`;bodyEl.prepend(group);group.querySelector('select').onchange=e=>change('layout',e.target.value);}})[tab]();workbench.update(tab);status();
  }
  const tabButtons=[...el.querySelectorAll('[data-tab]')];tabButtons.forEach((button,index)=>{button.onclick=()=>{clearPreview();tab=button.dataset.tab;render();};button.onkeydown=event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?tabButtons.length-1:(index+(event.key==='ArrowRight'?(lang==='ar'?-1:1):(lang==='ar'?1:-1))+tabButtons.length)%tabButtons.length;tabButtons[next].click();tabButtons[next].focus();};});
  el.querySelector('#st-publish').onclick = async (e) => {
    if(el.querySelector('[data-uploading=true]'))return note(a('انتظر اكتمال رفع الصورة قبل النشر.','Wait for the image upload before publishing.'),true);
    publishing=true;e.target.disabled = true;
    try { await flushInline();clearTimeout(saveTimer); await save(); const result=await api('/api/owner/design/publish', { method: 'POST', body: {revision} });revision=result.revision;d.published=structuredClone(recipe); dirty = false; status(); note(a('نشرنا تصميمك. عملاؤك يشوفونه الحين.', 'Published. Guests see your new design now.')); }
    catch { note(a('تعذر النشر. حاول مجددًا.', 'Could not publish. Try again.'), true); }
    publishing=false;e.target.disabled=Boolean(previewPresetId);
  };
  el.querySelector('#st-discard').onclick = async () => {
    if (!d.published) return note(a('ما في تصميم منشور ترجع له.', 'There is no published design to return to.'), true);
    if(!await confirmAction({title:a('التخلي عن المسودة؟','Discard the draft?'),description:a('ستعود إلى آخر تصميم منشور للرئيسية والمنيو.','Restore the last published homepage and menu.'),confirmLabel:a('التخلي عن المسودة','Discard draft')}))return;
    try { clearTimeout(saveTimer);if(pendingSave)await pendingSave; await api('/api/owner/design/discard', { method: 'POST', body: {revision} }); Object.assign(d, await api('/api/owner/design')); recipe = strip(d.draft);history.clear();historySnapshot=structuredClone(recipe);revision=d.revision;lastSaved=JSON.stringify(recipe);failedSave=false;markFormSaved(guard); dirty = false; status(); send(d.draft); render(); } catch { note(a('تعذر التنفيذ.', 'Could not do that.'), true); }
  };
  status(); render();
}

export function miniCard(p, current) {
  const c = p.recipe.colors;
  const sample=({cafe:['رواق','قهوة تستاهل وقتك'],roastery:['مدار','رحلة البن تبدأ هنا'],restaurant:['مائدة','مكان للذوق والحكاية'],burger:['ستاك','برجر. على أصوله.'],oriental:['سفرة','من مطبخنا، بمحبة'],bakery:['قمحة','صباح يبدأ من الفرن'],juice:['قطرة','يومك، بطعم أجمل'],clinic:['نَبض','رعاية أقرب إليك'],salon:['لُمى','وقتك للعناية'],laundry:['صفاء','عناية بكل التفاصيل'],seasonal:['الموسم','للأوقات التي تجمعنا']})[p.sector]||['منشأتك','تجربة تشبهك'];
  const services=['clinic','salon','laundry'].includes(p.sector),serviceItems=({clinic:['استشارة عامة','صحة الأسرة','موعد متابعة','الفحوصات'],salon:['العناية بالشعر','العناية بالبشرة','جلسة استرخاء','الباقات'],laundry:['غسيل وعناية','تنظيف جاف','كيّ وتجهيز','عناية خاصة']})[p.sector]||[];
  const r = { none: '0', sm: '4px', md: '8px', lg: '12px', xl: '16px' }[p.recipe.card.radius];
  const btn = { square: '2px', rounded: '8px', pill: '99px' }[p.recipe.button.shape];
  return `<article class="design-card ${current ? 'current' : ''}">
    ${p.preview_url?`<img class="design-real-preview" src="${esc(p.preview_url)}" alt="${esc(a('معاينة فعلية لتصميم ','Actual preview of ')+pick(p,'name'))}" loading="lazy" width="640" height="480">`:''}<div class="mini ${p.preview_url?'has-real-preview ':''}${services?'mini-service-site':''}" data-frame="${esc(p.recipe.composition?.frame||'atelier')}" data-hero="${esc(p.recipe.composition?.hero||'stacked')}" aria-hidden="true" style="--m-bg:${c.bg};--m-sf:${c.surface};--m-p:${c.primary};--m-a:${c.accent};--m-t:${c.text};--m-r:${r};--m-b:${btn}">
      <div class="mini-cover">${services?`<strong>${esc(sample[1])}</strong>`:'<img src="/editorial/counter.webp" alt="" loading="lazy">'}</div><div class="mini-name">${lang==='ar'?esc(sample[0]):esc(p.name_en.split(' ')[0])}</div>
      <div class="mini-items mini-${esc(p.recipe.layout)}">${services?serviceItems.map(item=>'<i><span>'+esc(item)+'</span></i>').join(''):`<i><img src="/editorial/coffee.webp" alt="" loading="lazy"></i><i><img src="/editorial/pastry.webp" alt="" loading="lazy"></i><i><img src="/editorial/counter.webp" alt="" loading="lazy"></i><i><img src="/editorial/coffee.webp" alt="" loading="lazy"></i>`}</div><div class="mini-btn"></div>
    </div>
    <h4>${esc(pick(p, 'name'))}</h4>
    <div class="row"><button type="button" class="btn ghost sm" data-try="${esc(p.id)}">${a('جرّب', 'Try')}</button><button type="button" class="btn sm" data-use="${esc(p.id)}">${current ? a('مختار', 'Chosen') : a('اعتمد', 'Use')}</button></div>
  </article>`;
}
