import {api,esc,lang} from './common.js';
const a=(ar,en)=>lang==='ar'?ar:en;
const q='?lang='+lang,key='zm_design_gallery_room';
const icon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10"/></svg>';
const sectors={cafe:['مقاهي','Cafés'],roastery:['محامص','Roasteries'],restaurant:['مطاعم','Restaurants'],burger:['برجر','Burgers'],oriental:['شرقي','Arabic dining'],bakery:['مخابز وحلويات','Bakeries'],juice:['عصائر','Juice'],clinic:['عيادات','Clinics'],salon:['صالونات','Salons'],laundry:['خدمات','Services'],seasonal:['مواسم','Seasons']};
const sectorName=s=>sectors[s]?a(...sectors[s]):s;
const grid=document.querySelector('#gallery'),status=document.querySelector('#gallery-status'),retry=document.querySelector('#gallery-retry');
let designs=[],busy=false,selected=null,room=null;
try{room=JSON.parse(sessionStorage.getItem(key));}catch{}
if(!room||!/^[A-Za-z0-9_-]{32}$/.test(room.token||''))room=null;
document.title=a('تصاميم المواقع | زيمارا منيو','Website designs | ZIMARA Menu');
document.querySelector('#gallery-header').innerHTML=`<a class="brand" href="/${q}" aria-label="${a('زيمارا منيو، الرئيسية','ZIMARA Menu, home')}"><span class="brand-mark" aria-hidden="true"><img src="/brand/symbol.webp" width="43" height="43" alt=""></span><span>${a('زيمارا','ZIMARA')}<small>${a('منيو','MENU')}</small></span></a><nav aria-label="${a('التنقل الرئيسي','Main navigation')}"><a class="language" href="/designs?lang=${lang==='ar'?'en':'ar'}" lang="${lang==='ar'?'en':'ar'}">${a('English','العربية')}</a><a class="studio-link" href="/demo?view=studio&lang=${lang}">${a('افتح الاستوديو','Open the studio')}${icon}</a></nav>`;
document.querySelector('#gallery-intro').innerHTML=`<div class="intro-copy"><p class="eyebrow">${a('مكتبة التصاميم / زيمارا منيو','THE DESIGN COLLECTION / ZIMARA MENU')}</p><h1>${a('مساحتك الرقمية.<br><em>على ذوقك.</em>','Your digital space.<br><em>Made your own.</em>')}</h1><p class="intro-note">${a('موقع يروي حكايتك، ومنيو يفتح الشهية. ابدأ بتصميم يناسب نشاطك وجرّبه كما يراه عملاؤك.','A site that tells your story. A menu worth exploring. Start with a design for your business and experience it as your customers will.')}</p><a class="browse-link" href="#gallery">${a('اكتشف التصاميم','Explore the collection')}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M12 4v16m-6-6 6 6 6-6"/></svg></a></div><div class="intro-visual"><img src="/editorial/counter.webp" alt="${a('مساحة مقهى، صورة توضيحية','An illustrative café interior')}" fetchpriority="high"><div class="visual-caption"><span>${a('فكرتك، بتفاصيلها.','Your idea, in every detail.')}</span><span>01 / 20</span></div></div>`;
document.querySelector('#gallery-heading').textContent=a('اختر نقطة البداية.','Find your starting point.');
document.querySelector('#gallery-filter').innerHTML=`<span>${a('نوع النشاط','Business type')}</span><select id="gallery-sector"><option value="all">${a('كل الأنشطة','All businesses')}</option></select>`;
document.querySelector('#gallery-footer').innerHTML=`<p>${a('زيمارا منيو · موقعك ومنيوك في مكان واحد.','ZIMARA Menu · Your website and menu, together.')}</p><p>${a('المعاينات ببيانات توضيحية في تجربة مستقلة.','Previews use illustrative content in an isolated demo.')}</p>`;
retry.textContent=a('إعادة المحاولة','Retry');
function storeRoom(value){room=value;try{if(value)sessionStorage.setItem(key,JSON.stringify(value));else sessionStorage.removeItem(key);}catch{}}
function setBusy(value){busy=value;grid.setAttribute('aria-busy',String(value));grid.querySelectorAll('button').forEach(b=>b.disabled=value);document.querySelector('#gallery-sector').disabled=value;}
function showError(error){status.textContent=error.status===410?a('انتهت غرفة التجربة. أعد المحاولة لإنشاء تجربة جديدة مستقلة.','Your demo room expired. Retry to create a new isolated preview.'):error.status===429?a('وصلنا للحد المؤقت للتجارب. انتظر قليلًا ثم أعد المحاولة.','The temporary demo limit was reached. Wait a moment, then retry.'):a('تعذر تجهيز المعاينة. تحقق من الاتصال وأعد المحاولة. احتفظنا بغرفتك إن كانت جاهزة.','Unable to prepare the preview. Check your connection and retry. Your room is retained if it was created.');retry.hidden=false;}
function render(){
 const sector=document.querySelector('#gallery-sector').value,list=designs.filter(d=>sector==='all'||d.sector===sector);
 document.querySelector('#gallery-count').textContent=a(`${list.length} تصميمًا منسّقًا · معاينات من المواقع الفعلية`,`${list.length} curated designs · actual website previews`);
 grid.innerHTML=list.map((d,i)=>`<article class="design-tile" data-id="${esc(d.id)}" data-sector="${esc(d.sector)}"><div class="tile-preview"><img src="${esc(d.preview_url)}" alt="${esc(a('معاينة موقع: ','Website preview: ')+(lang==='ar'?d.name_ar:d.name_en))}" loading="${i<3?'eager':'lazy'}" decoding="async"><span class="tile-index">${String(designs.indexOf(d)+1).padStart(2,'0')}</span></div><div class="tile-meta"><div><span class="sector-label">${esc(sectorName(d.sector))}</span><h3>${esc(lang==='ar'?d.name_ar:d.name_en)}</h3></div><button type="button" data-preview="${esc(d.id)}" aria-label="${esc(a('جرّب موقع ','Try website: ')+(lang==='ar'?d.name_ar:d.name_en))}">${a('جرّب الموقع','Try website')}${icon}</button></div></article>`).join('');
 grid.querySelectorAll('[data-preview]').forEach(button=>button.addEventListener('click',()=>openDesign(button.dataset.preview)));
 grid.setAttribute('aria-busy','false');
}
async function load(){retry.hidden=true;status.textContent=a('نحمّل التصاميم…','Loading the collection…');try{({designs}=await api('/api/public/designs'));const options=[...new Set(designs.map(d=>d.sector))];document.querySelector('#gallery-sector').insertAdjacentHTML('beforeend',options.map(s=>`<option value="${esc(s)}">${esc(sectorName(s))}</option>`).join(''));render();status.textContent='';}catch(error){showError(error);}}
async function openDesign(id){
 if(busy)return;selected=id;retry.hidden=true;setBusy(true);status.textContent=a('نجهّز موقعك التوضيحي…','Preparing your illustrative website…');
 try{
  if(room){const live=await api('/api/demo/'+encodeURIComponent(room.token));if(live.scope!=='synthetic_shared_room')throw new Error('invalid_demo_scope');storeRoom({...live,token:room.token});}
  else{const created=await api('/api/demo',{method:'POST',body:{mode:'studio'}});storeRoom(created);}
  // Establish this synthetic room's owner session before any design write.
  await api('/api/demo/'+encodeURIComponent(room.token)+'/session',{method:'POST',body:{role:'owner'}});
  const design=await api('/api/owner/design');
  const applied=await api('/api/owner/design/presets/'+encodeURIComponent(id)+'/apply',{method:'POST',body:{revision:design.revision,replace_content:true}});
  await api('/api/owner/design/publish',{method:'POST',body:{revision:applied.revision}});
  location.assign('/p/'+encodeURIComponent(room.org_slug)+q);
 }catch(error){if(error.status===410)storeRoom(null);showError(error);setBusy(false);status.scrollIntoView({block:'nearest'});}
}
document.querySelector('#gallery-sector').addEventListener('change',render);
retry.addEventListener('click',()=>selected?openDesign(selected):load());
load();
