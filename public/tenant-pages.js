import {icon} from './icons.js';
import {esc,lang,pick,money} from './common.js';
let editorSelection=null;
const editorMode=new URLSearchParams(location.search).has('design_preview')&&window.parent!==window;
const {deferInlineRender=()=>false,installInlinePreview=()=>{}}=editorMode?await import('./studio-inline.js'):{};
function paintEditorSelection(){document.querySelectorAll('[data-block-id]').forEach(node=>{node.dataset.editorSelected=String(node.dataset.blockId===editorSelection);});}
window.addEventListener('message',event=>{if(!editorMode||event.origin!==location.origin||event.source!==window.parent||event.data?.type!=='zm-highlight-block')return;editorSelection=event.data.id;paintEditorSelection();document.querySelector('[data-editor-selected=true]')?.scrollIntoView({block:'nearest',behavior:'instant'});});
const a=(ar,en)=>lang==='ar'?ar:en;
const inline=(b,field,index)=>editorMode?` data-inline-block="${esc(b?.id||'')}" data-inline-field="${field==='image'?'image':field+'_'+(lang==='ar'?'ar':'en')}"${index===undefined?'':` data-inline-index="${index}"`}${field==='image'?' data-inline-image="true"':''}`:'';
const text=(value)=>esc(value||'').replace(/\n/g,'<br>');
const image=(src,alt='',eager=false,attrs='')=>src?`<img${attrs} src="${esc(src)}" alt="${esc(alt)}" ${eager?'fetchpriority="high"':'loading="lazy"'} decoding="async">`:'';

export function tenantChrome(org,recipe={}){
 recipe=recipe||{};
 const brand=document.querySelector('#top .brandmark');
 if(brand){brand.href='/p/'+encodeURIComponent(org.slug);brand.innerHTML=`${org.logo_url?`<img src="${esc(org.logo_url)}" alt="" width="40" height="40">`:''}<span>${esc(pick(org,'name'))}</span>`;}
 const footer=document.querySelector('footer.site');
 if(footer)footer.innerHTML=`<span>${text(pick(recipe.home||{},'footer')||pick(org,'name'))}</span><a href="/" class="tenant-powered">${a('بواسطة زيمارا منيو','Powered by ZIMARA Menu')}</a>`;
}

export function renderHome(main,data,recipe,products=[]){
 if(editorMode&&deferInlineRender(main,()=>renderHome(main,data,recipe,products)))return true;
 const {org,profile:p,branches,loyalty}=data;
 if(!recipe?.home?.enabled){if(editorMode)installInlinePreview(main,recipe);return false;}
 const name=pick(org,'name'),menuUrl=branches.length?'/m/'+encodeURIComponent(branches[0].slug):null;
 const blocks=(recipe.home.blocks||[]).filter(b=>b.visible!==false);
 const firstHero=blocks.find(b=>b.type==='hero')?.id;
 const title=(b,fallback)=>pick(b,'title')||fallback;
 const heading=(b,fallback)=>`<h2${inline(b,'title')}>${text(title(b,fallback))}</h2>${pick(b,'body')?`<p class="site-block-copy"${inline(b,'body')}>${text(pick(b,'body'))}</p>`:''}`;
 const button=(b,fallback=menuUrl,label=a('افتح المنيو','Explore the menu'))=>(b.url||fallback)?`<a class="btn" href="${esc(b.url||fallback)}"><span${inline(b,'label')}>${text(pick(b,'label')||label)}</span> <span aria-hidden="true">${icon('arrowUpRight',16)}</span></a>`:'';
 const media=(b)=>b.image||p.banners?.[0]?.image_url;
 const render={
  hero:b=>`<div class="site-hero-media">${image(media(b),pick(b,'title')||name,true,inline(b,'image'))||`<span class="site-monogram" aria-hidden="true">${esc([...name][0]||'')}</span>`}</div><div class="site-hero-copy"><p class="site-eyebrow">${a('أهلًا بك في','WELCOME TO')} ${esc(name)}</p>${org.logo_url?`<img class="site-hero-logo" src="${esc(org.logo_url)}" alt="" width="72" height="72">`:''}<${b.id===firstHero?'h1 id="org-name"':'h2'}${inline(b,'title')}>${text(title(b,name))}</${b.id===firstHero?'h1':'h2'}><p class="site-block-copy"${inline(b,'body')}>${text(pick(b,'body')||pick(p,'description'))}</p><div class="site-hero-actions">${button(b)}${loyalty?`<a class="site-text-link" href="/j/${esc(org.slug)}">${a('بطاقة الولاء','Loyalty card')} ${icon('arrowUpRight',16)}</a>`:''}</div></div>`,
  text:b=>`<div>${heading(b,a('حكايتنا','Our story'))}</div>${!pick(b,'body')&&pick(p,'description')?`<p class="site-block-copy"${inline(b,'body')}>${text(pick(p,'description'))}</p>`:''}`,
  image:b=>`${image(b.image,pick(b,'title'),false,inline(b,'image'))}${pick(b,'title')||pick(b,'body')?`<div class="site-image-caption">${heading(b,'')}</div>`:''}`,
  gallery:b=>`${heading(b,a('من مكاننا','A look inside'))}<div class="site-gallery">${(b.items?.length?b.items:(p.banners||[]).map(x=>({image:x.image_url,title_ar:x.alt_ar,title_en:x.alt_en}))).map((x,index)=>({...x,inlineIndex:index})).filter(x=>x.image).map(x=>`<figure>${image(x.image,pick(x,'title'),false,b.items?.length?inline(b,'image',x.inlineIndex):'')}${pick(x,'title')?`<figcaption${b.items?.length?inline(b,'title',x.inlineIndex):''}>${text(pick(x,'title'))}</figcaption>`:''}</figure>`).join('')||`<p class="site-empty">${a('صور المكان تُضاف من محرر الصفحة.','Add your place’s photos in the page editor.')}</p>`}</div>`,
  menu:b=>`${heading(b,a('اختياراتك تبدأ هنا','Find your favourites'))}<div class="site-menu-links">${branches.map(branch=>`<a href="/m/${esc(branch.slug)}"><span>${a('المنيو','MENU')}</span><h3>${esc(pick(branch,'name'))}</h3><span aria-hidden="true">${icon('arrowUpRight',16)}</span></a>`).join('')}</div>`,
  featured:b=>`${heading(b,a('من اختياراتنا','From our menu'))}<div class="site-featured">${products.slice(0,6).map(item=>`<a href="${esc(menuUrl||'#')}"><div class="site-product-media">${image(item.image_url,pick(item,'name'))||`<span aria-hidden="true">${esc([...pick(item,'name')][0]||'')}</span>`}</div><div><h3>${esc(pick(item,'name'))}</h3><p>${esc(pick(item,'desc'))}</p><strong>${esc(money(item.price))}</strong></div></a>`).join('')||`<p class="site-empty">${a('تظهر أصناف المنيو المنشورة هنا.','Published menu items appear here.')}</p>`}</div>`,
  branches:b=>`${heading(b,a('نلقاك هنا','Find us here'))}<div class="site-places">${branches.map(branch=>`<article><h3>${esc(pick(branch,'name'))}</h3><p>${text(branch.settings.address)}</p><div class="site-hero-actions"><a href="/m/${esc(branch.slug)}">${a('منيو الفرع','Branch menu')} ${icon('arrowUpRight',16)}</a>${branch.settings.maps_url?`<a href="${esc(branch.settings.maps_url)}" target="_blank" rel="noopener">${a('الاتجاهات','Directions')} ${icon('arrowUpRight',16)}</a>`:''}</div></article>`).join('')}</div>`,
  hours:b=>`${heading(b,a('أوقاتنا','Opening hours'))}<div class="site-hours">${branches.filter(branch=>branch.settings.hours?.length).map(branch=>`<article><h3>${esc(pick(branch,'name'))}</h3><dl>${branch.settings.hours.map(day=>`<div><dt>${a(['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'],['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'])[day.day]}</dt><dd>${day.closed?a('مغلق','Closed'):`<bdi>${esc(day.open)} – ${esc(day.close)}</bdi>`}</dd></div>`).join('')}</dl></article>`).join('')||`<p class="site-empty">${a('أضف أوقات العمل من إعدادات الفروع.','Add opening hours in branch settings.')}</p>`}</div>`,
  social:b=>`${heading(b,a('خلّنا قريبين','Stay close'))}<div class="site-social">${p.phone?`<a href="tel:${esc(p.phone.replace(/[^+\d]/g,''))}"><bdi>${esc(p.phone)}</bdi></a>`:''}${(p.social_links||[]).map(link=>`<a href="${esc(link.url)}" target="_blank" rel="noopener">${esc(link.label)} ${icon('arrowUpRight',16)}</a>`).join('')}${(b.items||[]).filter(x=>x.url).map(x=>`<a href="${esc(x.url)}">${text(pick(x,'title'))} ${icon('arrowUpRight',16)}</a>`).join('')}</div>`,
  loyalty:b=>loyalty?`${heading(b,a('لكل زيارة، شيء أجمل','A little more with every visit'))}<p class="site-block-copy">${a(`اجمع ${loyalty.stamps_required} أختام. مكافأتك: ${esc(pick(loyalty,'reward'))}.`,`Collect ${loyalty.stamps_required} stamps. Your reward: ${esc(pick(loyalty,'reward'))}.`)}</p><div class="site-stamps" aria-hidden="true">${Array.from({length:Math.min(10,loyalty.stamps_required)},()=>icon('circle',28)).join('')}</div>${button(b,'/j/'+org.slug,a('احصل على بطاقة الولاء','Get your loyalty card'))}`:'',
  faq:b=>`${heading(b,a('تسأل؟ نجاوبك.','Your questions, answered.'))}<div class="site-faq">${(b.items||[]).map((x,index)=>`<details><summary${inline(b,'title',index)}>${text(pick(x,'title'))}</summary><p${inline(b,'body',index)}>${text(pick(x,'body'))}</p></details>`).join('')}</div>`,
  cta:b=>`${heading(b,a('نشوفك قريب','See you soon'))}${button(b)}`,
 };
 main.className='site-home';
 main.innerHTML=(!firstHero?`<h1 class="site-page-title" id="org-name">${esc(name)}</h1>`:'')+blocks.filter(b=>render[b.type]).map(b=>`<section class="site-block site-${esc(b.type)}" data-block-id="${esc(b.id)}" data-align="${b.align==='center'?'center':'start'}" data-tone="${['surface','brand','quiet'].includes(b.tone)?b.tone:'surface'}" data-variant="${['standard','split','cover','columns'].includes(b.variant)?b.variant:'standard'}">${render[b.type](b)}</section>`).join('');
 tenantChrome(org,recipe);if(editorMode){main.querySelectorAll('[data-block-id]').forEach(section=>{section.tabIndex=0;section.setAttribute('aria-label',a('تعديل القسم: ','Edit section: ')+(section.querySelector('h1,h2')?.textContent||''));});installInlinePreview(main,recipe);paintEditorSelection();}return true;
}

export function applyMenuContent(main,recipe,org){
 if(editorMode&&deferInlineRender(main,()=>applyMenuContent(main,recipe,org)))return;
 const config=recipe?.menu||{},title=main.querySelector('#menu-title'),about=main.querySelector('.menu-about:not(.menu-full-name)');
 if(title){if(editorMode){title.dataset.inlineBlock='';title.dataset.inlineField='title_'+(lang==='ar'?'ar':'en');}if(!title.dataset.original)title.dataset.original=title.textContent;title.textContent=pick(config,'title')||title.dataset.original;}
 if(about){if(about.dataset.original===undefined)about.dataset.original=about.textContent;about.textContent=pick(config,'description')||about.dataset.original;}
 else if(pick(config,'description'))main.querySelector('.menu-sheet')?.insertAdjacentHTML('beforeend',`<p class="menu-about">${text(pick(config,'description'))}</p>`);
 main.querySelector('.tenant-announcement')?.remove();
 const announcement=pick(config,'announcement');
 if(announcement)main.insertAdjacentHTML('afterbegin',`<aside class="tenant-announcement">${config.announcement_url?`<a href="${esc(config.announcement_url)}"><span data-announcement-text>${text(announcement)}</span> ${icon('arrowUpRight',16)}</a>`:text(announcement)}</aside>`);
 if(editorMode){const description=main.querySelector('.menu-about:not(.menu-full-name)');if(description){description.dataset.inlineBlock='';description.dataset.inlineField='description_'+(lang==='ar'?'ar':'en');}const notice=main.querySelector('.tenant-announcement');if(notice){const node=notice.querySelector('[data-announcement-text]')||notice;node.dataset.inlineBlock='';node.dataset.inlineField='announcement_'+(lang==='ar'?'ar':'en');}installInlinePreview(main,recipe);}
 if(org)tenantChrome(org,recipe);
}
