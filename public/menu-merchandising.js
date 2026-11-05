// Additive merchant controls. Existing item fields and canonical design ownership stay in their editors.
import {api,esc,lang,pick} from './common.js';
import {uploadImage} from './uploads.js';
const a=(ar,en)=>lang==='ar'?ar:en;
const dietary=[['vegan','نباتي بالكامل','Vegan'],['vegetarian','نباتي','Vegetarian'],['gluten_free','خالٍ من الغلوتين (تصريح منك)','Gluten-free (your explicit declaration)']];
export function merchandisingFields(item,items,prefix){
 return `<details class="item-more"><summary>${a('الصور والخيارات الغذائية والمقترحات','Gallery, dietary labels & complements')}</summary><div class="stack" data-merchandising>
 <fieldset class="opt-group"><legend>${a('تصنيفات غذائية مؤكدة فقط','Only confirmed dietary labels')}</legend>${dietary.map(([key,ar,en])=>`<label class="check"><input type="checkbox" data-dietary="${key}" value="${key}" ${item.dietary?.includes(key)?'checked':''}> ${a(ar,en)}</label>`).join('')}</fieldset>
 <fieldset class="stack"><legend>${a('معرض الصور (حتى 6)','Gallery (up to 6)')}</legend><p class="small muted">${a('رفع الصور ينشئ نسخ WebP متجاوبة حسب حجم الصورة. الروابط الخارجية تبقى كما هي.','Uploads create responsive WebP sizes where the source is large enough. External links stay unchanged.')}</p>${Array.from({length:6},(_,n)=>{const entry=item.gallery?.[n];return `<div data-gallery-row data-variants="${esc(JSON.stringify(entry?.variants||[]))}" data-original-url="${esc(entry?.url||'')}"><label for="${prefix}-gallery-${n}">${a('رابط الصورة','Photo URL')} ${n+1}</label><input id="${prefix}-gallery-${n}" data-gallery-url type="url" dir="ltr" value="${esc(entry?.url||'')}"><label class="btn ghost">${a('رفع الصورة','Upload photo')} ${n+1}<input class="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" data-gallery-upload></label><p class="small muted" role="status" data-gallery-status></p></div>`;}).join('')}</fieldset>
 <fieldset class="stack"><legend>${a('أصناف مكملة تختارها (حتى 3)','Manual complementary items (up to 3)')}</legend><p class="small muted">${a('تظهر عند عدم توفر بيانات طلبات كافية.','Used when there is insufficient order history.')}</p>${Array.from({length:3},(_,n)=>`<label>${a('مقترح','Complement')} ${n+1}<select data-complement><option value="">${a('بدون','None')}</option>${items.filter(i=>i.id!==item.id).map(i=>`<option value="${esc(i.id)}" ${item.complementary_ids?.[n]===i.id?'selected':''}>${esc(pick(i,'name'))}</option>`).join('')}</select></label>`).join('')}</fieldset></div></details>`;
}
export function readMerchandising(form){
 if(form.querySelector('[data-merchandising][data-uploading]'))throw new Error('upload_in_progress');
 const gallery=[...form.querySelectorAll('[data-gallery-row]')].flatMap(row=>{const url=row.querySelector('[data-gallery-url]').value.trim();return url?[{url,variants:url===row.dataset.originalUrl?JSON.parse(row.dataset.variants):[]}]:[];});
 return {gallery,dietary:[...form.querySelectorAll('[data-dietary]:checked')].map(i=>i.value),complementary_ids:[...new Set([...form.querySelectorAll('[data-complement]')].map(i=>i.value).filter(Boolean))]};
}
async function responsiveUpload(file){
 const bitmap=await createImageBitmap(file);try{
 const variants=[];
 for(const width of [320,640,960].filter(w=>w<=bitmap.width)){
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=Math.max(1,Math.round(bitmap.height*width/bitmap.width));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',0.84));if(!blob||blob.type!=='image/webp')throw new Error('webp_unavailable');variants.push({url:await uploadImage(blob),width});
 }
 return {url:variants.at(-1)?.url||await uploadImage(file),variants};
 }finally{bitmap.close();}
}
export function wireMerchandising(root){
 root.querySelectorAll('[data-gallery-upload]').forEach(input=>input.addEventListener('change',async()=>{
 const file=input.files[0];if(!file)return;const row=input.closest('[data-gallery-row]'),box=input.closest('[data-merchandising]'),status=row.querySelector('[data-gallery-status]');
 // Serialise uploads in this form, and keep Save blocked until all variants are ready.
 if(box.dataset.uploading)return;box.dataset.uploading='true';const controls=[...box.closest('form').querySelectorAll('button[type=submit],[data-gallery-upload]')];controls.forEach(c=>c.disabled=true);status.textContent=a('جارٍ رفع الصورة…','Uploading…');
 try{const media=await responsiveUpload(file);row.querySelector('[data-gallery-url]').value=media.url;row.dataset.originalUrl=media.url;row.dataset.variants=JSON.stringify(media.variants);row.querySelector('input').dispatchEvent(new Event('input',{bubbles:true}));status.textContent=a('تم الرفع. اضغط حفظ لتطبيق الصورة.','Uploaded. Press Save to apply.');}
 catch{status.textContent=a('تعذر رفع الصورة. جرّب ملف PNG أو JPG أو WebP أصغر.','Upload failed. Try a smaller PNG, JPG or WebP.');}
 finally{delete box.dataset.uploading;controls.forEach(c=>c.disabled=false);input.value='';}
 }));
}
const days=[['الأحد','Sunday'],['الاثنين','Monday'],['الثلاثاء','Tuesday'],['الأربعاء','Wednesday'],['الخميس','Thursday'],['الجمعة','Friday'],['السبت','Saturday']];
export async function mountMenuSchedules(root,branches,categories){
 if(!branches.length||!categories.length)return;
 const panel=document.createElement('details');panel.className='card stack';panel.innerHTML=`<summary>${a('جدولة أقسام المنيو لكل فرع','Category schedules by branch')}</summary><p>${a('توقيت الرياض Asia/Riyadh. إذا كانت النهاية قبل البداية تستمر الفترة لليوم التالي. بدون جدول يتبع القسم توفره المعتاد.','Asia/Riyadh time. An end before the start continues into the next day. Without a schedule the category follows its normal availability.')}</p><label>${a('الفرع','Branch')}<select data-schedule-branch>${branches.map(b=>`<option value="${esc(b.id)}">${esc(pick(b,'name'))}</option>`).join('')}</select></label><div data-schedules></div><p role="status" data-schedules-status></p>`;root.append(panel);
 const select=panel.querySelector('select'),body=panel.querySelector('[data-schedules]');let generation=0;
 async function load(){const version=++generation,branchId=select.value;body.innerHTML='';try{const {schedules}=await api(`/api/owner/branches/${encodeURIComponent(branchId)}/menu-schedules`);if(version!==generation||!panel.isConnected)return;
 body.innerHTML=categories.map((cat,n)=>{const schedule=schedules.find(s=>s.category_id===cat.id);return `<form class="stack opt-group" data-category-schedule="${esc(cat.id)}"><h4>${esc(pick(cat,'name'))}</h4><fieldset class="opt-group"><legend>${a('أيام بداية الفترة','Days the interval starts')}</legend><div class="allergen-grid">${days.map(([ar,en],day)=>`<label class="check"><input type="checkbox" data-schedule-day="${day}" value="${day}" ${schedule?.days.includes(day)?'checked':''}> ${a(ar,en)}</label>`).join('')}</div></fieldset><div class="row"><label>${a('البداية','Start')}<input type="time" name="start" required value="${esc(schedule?.start||'')}"></label><label>${a('النهاية','End')}<input type="time" name="end" required value="${esc(schedule?.end||'')}"></label></div><div class="row"><button type="submit" class="btn ghost">${a('حفظ الجدول','Save schedule')}</button><button type="button" class="btn ghost" data-schedule-clear>${a('إزالة الجدول','Clear schedule')}</button></div><p role="status"></p></form>`;}).join('');
 body.querySelectorAll('form').forEach(form=>{const status=form.querySelector('[role=status]');const save=async(schedule)=>{const buttons=[...form.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);status.textContent=a('جارٍ الحفظ…','Saving…');try{await api(`/api/owner/branches/${encodeURIComponent(branchId)}/menu-schedules/${encodeURIComponent(form.dataset.categorySchedule)}`,{method:'PUT',body:{schedule}});if(!schedule){form.reset();form.querySelectorAll('input').forEach(i=>{if(i.type==='checkbox')i.checked=false;else i.value='';});}status.textContent=schedule?a('حُفظ الجدول.','Schedule saved.'):a('أزيل الجدول.','Schedule cleared.');}catch{status.textContent=a('تعذر الحفظ. راجع البيانات وحاول مجددًا.','Could not save. Check the values and retry.');}finally{buttons.forEach(b=>b.disabled=false);}};
 form.onsubmit=e=>{e.preventDefault();const checked=[...form.querySelectorAll('input:checked')].map(i=>Number(i.value));if(!checked.length){status.textContent=a('اختر يومًا واحدًا على الأقل.','Choose at least one day.');return;}save({days:checked,start:form.elements.start.value,end:form.elements.end.value});};form.querySelector('[data-schedule-clear]').onclick=()=>save(null);});
 }catch{if(version===generation)panel.querySelector('[data-schedules-status]').textContent=a('تعذر تحميل الجداول. اختر الفرع للمحاولة مجددًا.','Could not load schedules. Select the branch to retry.');}}
 select.onchange=load;await load();
}
