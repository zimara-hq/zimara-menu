// The preview sends field names, never executable paths or HTML. Both ends
// resolve those names against the current recipe before accepting a change.
const HOME_TEXT = /^(title|body|label)_(ar|en)$/;
const ITEM_TEXT = /^(title|body)_(ar|en)$/;
const MENU_TEXT = /^(title|description|announcement)_(ar|en)$/;
const ID = /^[a-zA-Z0-9_-]{1,50}$/;
const states = new WeakMap();
const clone = value => structuredClone(value);
const copy = (ar,en) => globalThis.document?.documentElement?.lang === 'en' ? en : ar;

function targetFor(recipe, message, image = false) {
 if (!recipe || !message || typeof message !== 'object') return null;
 const {blockId,field,index} = message;
 if (typeof field !== 'string') return null;
 if (blockId === null) {
  if (image || index !== undefined || !MENU_TEXT.test(field || '') || !recipe.menu) return null;
  return {target:recipe.menu,limit:field.startsWith('description')?800:200};
 }
 if (typeof blockId !== 'string' || !ID.test(blockId)) return null;
 const block = recipe.home?.blocks?.find(b => b.id === blockId && b.visible !== false);
 if (!block) return null;
 if (index !== undefined) {
  if (!Number.isInteger(index) || index < 0 || index >= 12 || !block.items?.[index]) return null;
  if (image ? field !== 'image' || block.type !== 'gallery' : !ITEM_TEXT.test(field || '') || !['faq','gallery','social'].includes(block.type)) return null;
  return {target:block.items[index],limit:field.startsWith('body')?1000:180};
 }
 if (image ? field !== 'image' || !['hero','image'].includes(block.type) : !HOME_TEXT.test(field || '')) return null;
 return {target:block,limit:field.startsWith('body')?3000:180};
}

export function mountStudioInline({frame,getRecipe,onChange,onImage,onSelect,onStatus}) {
 const pending=new Map();let disposed=false,changeWork=Promise.resolve();
 const validPreview=()=>{try{const url=new URL(frame?.src,location.origin);return url.origin===location.origin&&url.searchParams.has('design_preview')&&Boolean(frame?.contentWindow);}catch{return false;}};
 const failure=(message,code)=>{const error=new Error(message);error.code=code;onStatus?.(message);return error;};
 const settle=(nonce,error)=>{const request=pending.get(nonce);if(!request)return;pending.delete(nonce);clearTimeout(request.timer);if(error)request.reject(error);else request.resolve();};
 const rejectPending=error=>{for(const nonce of pending.keys())settle(nonce,error);};
 const receive = event => {
  if (event.origin !== location.origin || event.source !== frame?.contentWindow) return;
  if (disposed || !validPreview()) return;
  const message=event.data;
  if (!message || typeof message !== 'object' || typeof message.type !== 'string') return;
  if (message.type === 'zm-inline-flushed') {
   if(typeof message.nonce!=='string'||!pending.has(message.nonce))return;
   if(message.ok!==true){settle(message.nonce,failure(copy('تعذّر إتمام النص في المعاينة. أنهِ الكتابة أو صحّح النص ثم أعد المحاولة.','The preview could not finish editing. Finish typing or correct the text, then try again.'),'inline_flush_invalid'));return;}
   // Messages from a single child arrive in order. Its commit has already
   // entered onChange before this acknowledgement; await async callbacks too.
   changeWork.then(()=>settle(message.nonce),()=>settle(message.nonce,failure(copy('تعذّر تطبيق النص. أعد تعديل الحقل ثم حاول الحفظ مجددًا.','The text could not be applied. Edit the field again, then retry saving.'),'inline_flush_change')));
   return;
  }
  if (message.type === 'zm-block-select') {
   if (typeof message.id === 'string' && getRecipe()?.home?.blocks?.some(b=>b.id===message.id&&b.visible!==false)) onSelect?.(message.id);
   return;
  }
  if (message.type === 'zm-inline-image') {
   if (targetFor(getRecipe(),message,true)) onImage?.({blockId:message.blockId,field:message.field,...(message.index!==undefined?{index:message.index}:{})});
   return;
  }
  if (message.type !== 'zm-inline-commit') return;
  const current=getRecipe(), resolved=targetFor(current,message);
  if (!resolved || typeof message.value !== 'string' || message.value.length > resolved.limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(message.value)) {
   const error=failure(copy('تعذّر تطبيق النص. اختر حقلاً موجودًا والتزم بطوله المسموح.','The text could not be applied. Choose an existing field and keep within its character limit.'),'inline_commit_invalid');
   rejectPending(error);
   return;
  }
  if (resolved.target[message.field] === message.value) return;
  const next=clone(current);
  targetFor(next,message).target[message.field]=message.value;
  try {
   const result=Promise.resolve(onChange?.(next,{blockId:message.blockId,field:message.field,value:message.value,...(message.index!==undefined?{index:message.index}:{})}));
   changeWork=Promise.all([changeWork.catch(()=>{}),result]).then(()=>{});
   changeWork.catch(()=>rejectPending(failure(copy('تعذّر تطبيق النص. أعد تعديل الحقل ثم حاول الحفظ مجددًا.','The text could not be applied. Edit the field again, then retry saving.'),'inline_flush_change')));
  } catch {
   const error=failure(copy('تعذّر تطبيق النص. أعد تعديل الحقل ثم حاول الحفظ مجددًا.','The text could not be applied. Edit the field again, then retry saving.'),'inline_flush_change');
   changeWork=Promise.reject(error);changeWork.catch(()=>{});rejectPending(error);
  }
 };
 window.addEventListener('message',receive);
 const cleanup=()=>{if(disposed)return;disposed=true;window.removeEventListener('message',receive);if(pending.size)rejectPending(failure(copy('أُغلق محرر المعاينة قبل إتمام النص. افتح المحرر وحاول مجددًا.','The preview editor closed before editing finished. Open the editor and try again.'),'inline_flush_disposed'));};
 cleanup.flush=({timeoutMs=3000}={})=>{
  if(disposed)return Promise.reject(failure(copy('أُغلق محرر المعاينة. افتح المحرر وحاول مجددًا.','The preview editor is closed. Open the editor and try again.'),'inline_flush_disposed'));
  if(!validPreview())return Promise.reject(failure(copy('المعاينة غير جاهزة. انتظر ظهور الصفحة ثم أعد المحاولة.','The preview is not ready. Wait for the page to appear, then try again.'),'inline_flush_unavailable'));
  const nonce=crypto.randomUUID();
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>settle(nonce,failure(copy('لم تستجب المعاينة لحفظ النص. انتظر ظهور الصفحة ثم أعد المحاولة.','The preview did not respond while saving text. Wait for the page to appear, then try again.'),'inline_flush_timeout')),Math.max(20,Math.min(5000,Number(timeoutMs)||3000)));
   pending.set(nonce,{resolve,reject,timer});
   try{frame.contentWindow.postMessage({type:'zm-inline-flush',nonce},location.origin);}catch{settle(nonce,failure(copy('تعذّر الاتصال بالمعاينة. أعد فتحها ثم حاول الحفظ.','The preview could not be reached. Reopen it, then retry saving.'),'inline_flush_unavailable'));}
  });
 };
 return cleanup;
}

export function deferInlineRender(main, render) {
 const state=states.get(main);
 if (!state?.active) return false;
 state.pending=render;
 return true;
}

// Runs only in a same-origin preview iframe. Ordinary guests never receive
// contenteditable, interception of navigation, or the editing stylesheet.
export function installInlinePreview(main, recipe) {
 if (!new URLSearchParams(location.search).has('design_preview') || window.parent === window) return;
 try { if (window.parent.location.origin !== location.origin) return; } catch { return; }
 let state=states.get(main);
 if (state) { state.recipe=recipe; return; }
 state={recipe,active:null,pending:null}; states.set(main,state);
 const doc=main.ownerDocument;
 if (!doc.querySelector('link[data-studio-inline]')) {
  const link=doc.createElement('link');link.rel='stylesheet';link.href='/studio-inline.css';link.dataset.studioInline='1';doc.head.append(link);
 }
 const send=data=>window.parent.postMessage(data,location.origin);
 const metadata=node=>({blockId:node.dataset.inlineBlock || null,field:node.dataset.inlineField,...(node.dataset.inlineIndex!==undefined?{index:Number(node.dataset.inlineIndex)}:{})});
 const mark=()=>{
  main.querySelectorAll('[data-inline-field]').forEach(node=>{
   const message=metadata(node),isImage=node.dataset.inlineImage==='true';
   const resolved=targetFor(state.recipe,message,isImage);
   if (!resolved) return;
   node.tabIndex=0;
   if (isImage) {
    node.setAttribute('role','button');node.setAttribute('aria-label',copy('استبدال الصورة','Replace image'));node.title=copy('اضغط لاستبدال الصورة','Click to replace image');
   } else {
    node.setAttribute('contenteditable','plaintext-only');node.setAttribute('role','textbox');node.setAttribute('aria-multiline','false');
    const label={title:copy('العنوان','title'),body:copy('النص','text'),label:copy('نص الزر','button text'),description:copy('الوصف','description'),announcement:copy('الإعلان','announcement')}[message.field.split('_')[0]]||copy('النص','text');
    node.setAttribute('aria-label',copy(`تعديل ${label}`,`Edit ${label}`));node.setAttribute('aria-description',copy(`Enter لتطبيق النص، Escape للإلغاء. الحد ${resolved.limit} حرفًا.`,`Enter applies text; Escape cancels. Maximum ${resolved.limit} characters.`));node.title=copy('اضغط للكتابة · Enter تطبيق · Escape إلغاء','Click to type · Enter to apply · Escape to cancel');node.dataset.inlinePlaceholder=copy('اكتب النص هنا','Type text here');
   }
  });
 };
 state.mark=mark;
 const choose=node=>{const blockId=node.closest('[data-block-id]')?.dataset.blockId;if(blockId){main.querySelectorAll('[data-block-id]').forEach(el=>el.dataset.editorSelected=String(el.dataset.blockId===blockId));send({type:'zm-block-select',id:blockId});}};
 const finish=cancel=>{
  const active=state.active;if(!active)return;
  const {node,original}=active;
  state.active=null;delete main.dataset.inlineEditing;
  if(cancel)node.textContent=original;
  else {
   const value=(node.textContent||'').replace(/\r\n?/g,'\n');
   const message={...metadata(node),value},resolved=targetFor(state.recipe,message);
   if(resolved&&value.length<=resolved.limit){if(value!==original)send({type:'zm-inline-commit',...message});}
   else {node.textContent=original;node.setAttribute('aria-invalid','true');}
  }
  const pending=state.pending;state.pending=null;
  if(pending)queueMicrotask(pending);
 };
 window.addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==window.parent||event.data?.type!=='zm-inline-flush'||!new URLSearchParams(location.search).has('design_preview'))return;
  const {nonce}=event.data;if(typeof nonce!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(nonce))return;
  // Never acknowledge an invalid or unfinished composition as saved content.
  const active=state.active;
  if(active){
   const value=active.node.textContent||'',resolved=targetFor(state.recipe,metadata(active.node));
   if(state.composing||!resolved||value.length>resolved.limit||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)){
    active.node.setAttribute('aria-invalid','true');send({type:'zm-inline-flushed',nonce,ok:false});return;
   }
   finish(false);active.node.blur();
  }
  send({type:'zm-inline-flushed',nonce,ok:true});
 });
 main.addEventListener('compositionstart',()=>{state.composing=true;});
 main.addEventListener('compositionend',()=>{state.composing=false;});
 main.addEventListener('focusin',event=>{
  const node=event.target.closest('[data-inline-field]:not([data-inline-image])');
  if(!node||!main.contains(node)||!node.isContentEditable)return;
  if(state.active?.node===node)return;
  finish(false);state.active={node,original:node.textContent||''};main.dataset.inlineEditing='true';node.removeAttribute('aria-invalid');
 });
 main.addEventListener('focusout',event=>{if(state.active?.node===event.target)finish(false);});
 main.addEventListener('click',event=>{
  const node=event.target.closest('[data-inline-field]');
  choose(event.target);
  if(event.target.closest('a'))event.preventDefault();
  if(node?.dataset.inlineImage==='true'){event.preventDefault();const message=metadata(node);if(targetFor(state.recipe,message,true))send({type:'zm-inline-image',...message});}
 });
 main.addEventListener('keydown',event=>{
  if(event.isComposing)return;
  const node=event.target.closest('[data-inline-field]');
  if(node?.dataset.inlineImage==='true'&&['Enter',' '].includes(event.key)){event.preventDefault();node.click();return;}
  if(state.active?.node===node&&['Enter','Escape'].includes(event.key)){
   event.preventDefault();event.stopPropagation();finish(event.key==='Escape');node.blur();return;
  }
  if(event.target.matches('[data-block-id]')&&['Enter',' '].includes(event.key)){event.preventDefault();choose(event.target);}
 });
 main.addEventListener('paste',event=>{
  const active=state.active;if(!active||!active.node.contains(event.target))return;
  event.preventDefault();const selection=doc.getSelection();if(!selection?.rangeCount)return;
  const pasted=event.clipboardData?.getData('text/plain')||'',resolved=targetFor(state.recipe,metadata(active.node));
  if(!resolved)return;
  const available=resolved.limit-(active.node.textContent.length-selection.toString().length);
  const range=selection.getRangeAt(0);range.deleteContents();const text=doc.createTextNode(pasted.slice(0,Math.max(0,available)));range.insertNode(text);range.setStartAfter(text);range.collapse(true);selection.removeAllRanges();selection.addRange(range);
 });
 main.addEventListener('beforeinput',event=>{
  if(!state.active||!state.active.node.contains(event.target)||event.isComposing)return;
  const resolved=targetFor(state.recipe,metadata(state.active.node));
  if(resolved&&event.data&&event.inputType.startsWith('insert')&&state.active.node.textContent.length-(doc.getSelection()?.toString().length||0)+event.data.length>resolved.limit)event.preventDefault();
 });
 mark();
 // Rendering replaces children, not main; one delegated listener set survives.
 state.observer=new MutationObserver(mark);state.observer.observe(main,{childList:true,subtree:true});
}
