import {api,esc,lang,makeT,topbar} from './common.js';
const a=(ar,en)=>lang==='ar'?ar:en,main=document.querySelector('#main');
topbar(document.querySelector('#top'),makeT({ar:{title:'التجربة الحية'},en:{title:'Live demo'}}));
const fragment=new URLSearchParams(location.hash.slice(1));let token=fragment.get('room'),room=null;
const q=lang==='en'?'?lang=en':'',studioMode=new URLSearchParams(location.search).get('view')==='studio';
async function openRole(role){
 if(!room||!token)return;
 const status=main.querySelector('#status');if(status)status.textContent=a('نجهّز شاشتك…','Preparing your screen…');
 try{
  if(role==='display'){const d=await api('/api/demo/'+token+'/display',{method:'POST',body:{}});location.assign(d.url+q);}
  else{await api('/api/demo/'+token+'/session',{method:'POST',body:{role:role==='cashier'?'branch':'owner'}});location.assign('/app'+q+(new URLSearchParams(location.search).get('view')==='studio'&&role!=='cashier'?'#design':''));}
 return true;}catch(e){if(status)status.textContent=e.status===410?a('انتهت الغرفة. أنشئ تجربة جديدة.','This room expired. Start a new demo.'):a('تعذر فتح الشاشة. حاول مجددًا.','Unable to open the screen. Try again.');return false;}
}
function render(){
 main.innerHTML=`<section class="card demo-intro"><span class="pill">${a('تجربة متزامنة · بيانات اصطناعية','Connected demo · synthetic data')}</span><h1>${a('كل الشاشات.<br>في غرفة واحدة.','Every screen.<br>One connected room.')}</h1><p class="muted">${a('أنشئ غرفة مستقلة، وافتح الكاشير والعرض والعميل على أجهزة مختلفة لتشوف الرحلة كاملة. لا مدفوعات ولا رسائل خارجية في هذه التجربة.','Create an isolated room and open cashier, display and customer screens on separate devices. No payments or external messages are sent.')}</p>${!room?`<button class="btn" id="create">${a('أنشئ تجربتي الحية','Create my live demo')}</button>`:`<p>${a('الغرفة جاهزة لمدة ساعتين. كل من معه رابط الغرفة يشارك صلاحيات التجربة فقط. استخدم أجهزة أو متصفحات مستقلة للكاشير والمدير؛ تغيير الدور في نفس المتصفح يغيّر الجلسة المشتركة.','Your room lasts two hours. Anyone with its link shares demo-only access. Use separate browsers/devices for cashier and manager; changing role in one browser changes its shared session.')}</p>`}<p id="status" role="status" aria-live="polite"></p></section>${room?`<div class="grid"><article class="card"><h2>${a('الكاشير','Cashier')}</h2><p>${a('أنشئ نداءً من رقم الفاتورة، ثم جرّب الجاهزية والاستلام.','Create a pager from an invoice number, then try ready and collected.')}</p><button class="btn" data-role="cashier">${a('افتح الكاشير','Open cashier')}</button><label>${a('رابط هذا الدور لجهاز آخر','This role link for another device')}<input readonly class="share-link" value="${esc(roleUrl('cashier'))}"></label><button class="btn ghost" data-copy="cashier">${a('نسخ رابط الكاشير','Copy cashier link')}</button></article><article class="card"><h2>${a('شاشة العرض','Counter display')}</h2><p>${a('ضعها أمام العميل. رمز النداء يظهر هنا فقط، ويختفي بعد الربط.','Place it in front of the customer. The pager QR appears here and disappears after linking.')}</p><button class="btn" data-role="display">${a('افتح شاشة العرض','Open display')}</button><label>${a('رابط العرض لجهاز آخر','Display link for another device')}<input readonly class="share-link" value="${esc(roleUrl('display'))}"></label><button class="btn ghost" data-copy="display">${a('نسخ رابط العرض','Copy display link')}</button></article><article class="card"><h2>${a('إدارة المنشأة','Business manager')}</h2><p>${a('عدّل المنيو والهوية والفروع وبرنامج الولاء.','Edit the menu, identity, branches and loyalty program.')}</p><button class="btn outline" data-role="owner">${a('افتح الإدارة','Open manager')}</button><label>${a('رابط الإدارة التجريبية','Demo manager link')}<input readonly class="share-link" value="${esc(roleUrl('owner'))}"></label><button class="btn ghost" data-copy="owner">${a('نسخ رابط الإدارة','Copy manager link')}</button></article><article class="card"><h2>${a('روابط العميل العامة','Public customer links')}</h2><p>${a('المنيو العام والصفحة التعريفية بلا رمز نداء. افتح بطاقة الولاء ثم أضف أختامًا من الكاشير.','Public menu and profile have no pager QR. Open a loyalty card, then add stamps from the cashier.')}</p><div class="tools"><a class="btn outline" href="/m/${esc(room.branch_slug)}${q}">${a('المنيو العام','Public menu')}</a><a class="btn outline" href="/p/${esc(room.org_slug)}${q}">${a('البروفايل','Profile')}</a><a class="btn outline" href="/j/${esc(room.org_slug)}${q}">${a('بطاقة الولاء','Loyalty card')}</a></div></article></div><div class="card"><h2>${a('جرّب الرحلة بالترتيب','Try the full journey')}</h2><ol><li>${a('افتح الكاشير والعرض في جهازين أو نافذتين مستقلتين.','Open cashier and display in two independent browsers or devices.')}</li><li>${a('أنشئ نداءً. يظهر رمز QR في شاشة العرض.','Create a pager. A QR appears on the display.')}</li><li>${a('امسح الرمز بالجوال. يختفي من العرض بعد الربط.','Scan with the customer phone. The display code disappears.')}</li><li>${a('فعّل الصوت في صفحة العميل. اضغط نداء، ثم شفت التنبيه، ثم الاستلام والتقييم.','Enable sound on the customer page. Call ready, acknowledge, collect and rate.')}</li></ol><a href="/demo${q}" class="text-link">${a('إنشاء غرفة جديدة','Create a new room')}</a></div>`:''}`;
 if(room){const guide=main.querySelectorAll('.card');const finalGuide=guide[guide.length-1];if(finalGuide&&finalGuide.querySelector('ol'))main.querySelector('.grid').before(finalGuide);}
 main.querySelectorAll('[data-copy]').forEach(button=>button.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(roleUrl(button.dataset.copy));main.querySelector('#status').textContent=a('تم نسخ الرابط. افتحه في الجهاز الآخر.','Link copied. Open it on the other device.');}catch{const input=button.parentElement.querySelector('input');input?.focus();input?.select();main.querySelector('#status').textContent=a('حددنا الرابط. انسخه من خيارات جهازك.','Link selected. Copy it using your device controls.');}}));
 if(studioMode){main.classList.add('studio-demo');const intro=main.querySelector('.demo-intro');intro.querySelector('h1').innerHTML=a('موقعك يبدأ<br>بفكرتك.','Your site starts<br>with your idea.');intro.querySelector('.pill').textContent=a('استوديو زيمارا منيو · تجربة مستقلة','ZIMARA Menu studio · isolated demo');intro.querySelector('p.muted').textContent=a('جرّب المحرر على موقع مقهى توضيحي. عدّل الرئيسية والمنيو والهوية، وشاهد فكرتك قبل نشرها. لا مدفوعات أو رسائل خارجية.','Try the editor on an illustrative café site. Shape the homepage, menu and identity; preview before publishing. No payments or external messages.');const create=intro.querySelector('#create');if(create)create.textContent=a('افتح استوديو التجربة','Open the demo studio');if(room){const resume=document.createElement('button');resume.type='button';resume.className='btn';resume.dataset.role='owner';resume.textContent=a('واصل التصميم','Continue designing');intro.querySelector('#status').before(resume);const all=document.createElement('a');all.href='/demo'+q+'#room='+encodeURIComponent(token);all.className='text-link';all.textContent=a('استكشف الكاشير وبقية الشاشات ','Explore cashier and other screens ');intro.append(all);}const copy=document.createElement('div');copy.className='studio-demo-copy';copy.append(...intro.childNodes);const visual=document.createElement('div');visual.className='studio-demo-visual';visual.innerHTML='<img src="/editorial/counter.webp" alt="'+a('صورة مقهى توضيحية','Illustrative café photograph')+'"><span>'+a('مساحتك. بتفاصيلك.','Your space. Your details.')+'</span>';intro.append(copy,visual);}
 main.querySelector('#create')?.addEventListener('click',async e=>{e.target.disabled=true;main.querySelector('#status').textContent=a('ننشئ بيانات تجربة مستقلة…','Creating isolated sample data…');try{const d=await api('/api/demo',{method:'POST',body:new URLSearchParams(location.search).get('view')==='studio'?{mode:'studio'}:{}});token=d.token;room=d;history.replaceState(null,'',location.pathname+location.search+'#room='+encodeURIComponent(token));if(studioMode){const opened=await openRole('owner');if(!opened)render();}else render();}catch(err){main.querySelector('#status').textContent=err.status===429?a('وصلت حد التجارب المؤقت. جرّب لاحقًا.','Temporary demo limit reached. Try later.'):a('تعذر بدء التجربة. أعد المحاولة.','Unable to start. Please retry.');e.target.disabled=false;}});
 main.querySelectorAll('[data-role]').forEach(b=>b.addEventListener('click',()=>openRole(b.dataset.role)));
 main.querySelectorAll('.share-link').forEach(input=>input.addEventListener('focus',()=>input.select()));
}
function roleUrl(role){return location.origin+'/demo'+q+'#room='+encodeURIComponent(token)+'&role='+role;}
// Studio entry is a bootstrap operation: keep its room bearer in the fragment
// until the owner session is ready, then replace it with the editor URL.
const studioQuery='?lang='+lang;
let studioBusy=false;
async function enterStudio(){
 if(studioBusy)return;
 studioBusy=true;
 main.innerHTML=`<section class="card"><h1>${a('نفتح الاستوديو…','Opening the studio…')}</h1><p id="status" role="status" aria-live="polite">${a('نجهّز تجربة مستقلة ببيانات توضيحية…','Preparing an isolated studio with sample data…')}</p><button class="btn" id="studio-retry" hidden>${a('إعادة المحاولة','Retry')}</button> <a class="text-link" id="studio-connected" href="/demo${studioQuery}">${a('استكشف التجربة المتصلة','Explore the connected demo')}</a></section>`;
 const retry=main.querySelector('#studio-retry');
 retry.addEventListener('click',enterStudio);
 try{
  if(token)room=await api('/api/demo/'+encodeURIComponent(token));
  else{
   room=await api('/api/demo',{method:'POST',body:{mode:'studio'}});
   token=room.token;
   const saved=new URLSearchParams();saved.set('room',token);
   if(fragment.get('role'))saved.set('role',fragment.get('role'));
   history.replaceState(null,'',location.pathname+location.search+'#'+saved);
  }
  const role=fragment.get('role')||'owner';
  main.querySelector('#status').textContent=a('نجهّز شاشتك…','Preparing your screen…');
  if(role==='display'){
   const display=await api('/api/demo/'+encodeURIComponent(token)+'/display',{method:'POST',body:{}});
   location.replace(display.url+studioQuery);
  }else{
   await api('/api/demo/'+encodeURIComponent(token)+'/session',{method:'POST',body:{role:role==='cashier'?'branch':'owner'}});
   location.replace('/app'+studioQuery+(role==='cashier'?'':'#design'));
  }
 }catch(error){
  if(error.status===410){
   token=null;room=null;
   const saved=new URLSearchParams();if(fragment.get('role'))saved.set('role',fragment.get('role'));
   history.replaceState(null,'',location.pathname+location.search+(saved.size?'#'+saved:''));
  }
  main.querySelector('#status').textContent=error.status===429?a('وصلت حد التجارب المؤقت. أعد المحاولة لاحقًا.','Temporary demo limit reached. Retry later.'):error.status===410?a('انتهت هذه الغرفة أو أُلغيت. أعد المحاولة لفتح تجربة جديدة.','This room expired or was revoked. Retry to open a new studio.'):a('تعذر فتح الاستوديو. تحقق من الاتصال وأعد المحاولة.','Unable to open the studio. Check your connection and retry.');
  retry.hidden=false;
  studioBusy=false;
 }
}
if(studioMode)enterStudio();
else if(token){api('/api/demo/'+encodeURIComponent(token)).then(d=>{room=d;if(fragment.get('role'))return openRole(fragment.get('role'));render();}).catch(()=>{token=null;room=null;render();main.querySelector('#status').textContent=a('انتهت الغرفة السابقة. أنشئ تجربة جديدة.','The previous room expired. Create a new demo.');});}else render();
