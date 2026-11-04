import {esc,lang} from './common.js';
import {workspaceIcon} from './workspace.js';

const a=(ar,en)=>lang==='ar'?ar:en;
const terms={
  overview:['البداية ملخص تجهيز','home setup overview'],
  menu:['اصناف أقسام اسعار صور','items categories prices photos'],
  brand:['شعار الوان خط خطوط هوية','logo colours font fonts branding'],
  design:['قالب تصميم معاينة نشر','template preview publish design'],
  profile:['بنرات تواصل وصف صفحة','banners social description page'],
  branches:['كاشير فريق فروع تقييم','cashier team branch review'],
  settings:['ساعات موقع طلب لعبة','hours location ordering game'],
  devices:['شاشة ايباد باركود','display ipad qr device'],
  subscription:['باقة فاتورة اشتراك دفع','plan invoice billing payment'],
  integrations:['رواء فودكس بريد ربط','rewaa foodics email connect'],
  account:['امن أمان كلمة مرور تحقق','security password authentication'],
  loyalty:['ختم مكافأة زيارة ولاء','stamp reward visit loyalty'],
  import:['اكسل ملف استيراد','excel csv file import'],
};
const normalize=value=>value.normalize('NFKD').replace(/[\u064B-\u065F\u0670]/g,'').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/(^|\s)ال(?=[\u0621-\u064a])/g,'$1').toLocaleLowerCase().trim();

// Read-only navigation: use only the destinations already allowed for this role.
export function installWorkspaceFinder({trigger,views,navigate}) {
  function open(){
    if(document.querySelector('dialog[open]'))return;
    // Native close events are queued; a rapid reopen must not duplicate IDs.
    document.querySelectorAll('dialog.workspace-finder:not([open])').forEach(previous=>previous.remove());
    const dialog=document.createElement('dialog');
    dialog.className='app-dialog workspace-finder';
    dialog.setAttribute('aria-labelledby','finder-title');
    dialog.innerHTML=`<div class="finder-heading"><div><span class="eyebrow">ZIMARA / ${a('مساحتك','YOUR WORKSPACE')}</span><h2 id="finder-title">${a('كل أدواتك، أقرب.','Every tool. Within reach.')}</h2></div><button type="button" class="btn ghost sm" id="finder-close">${a('إغلاق','Close')}</button></div><label for="workspace-query">${a('ابحث عن قسم أو مهمة','Find a section or task')}</label><div class="finder-input"><input type="search" id="workspace-query" autocomplete="off" placeholder="${a('جرّب: الخط، الفاتورة، ساعات العمل…','Try: fonts, invoices, opening hours…')}" aria-controls="finder-results"><button type="button" class="btn ghost sm" id="finder-clear" hidden>${a('مسح','Clear')}</button></div><p id="finder-count" class="small muted" role="status" aria-live="polite"></p><div id="finder-results" class="finder-results"></div><p class="finder-hint small muted">${a('الأسهم للتنقل · Enter للفتح · Esc للإغلاق','Arrow keys to browse · Enter to open · Esc to close')}</p>`;
    document.body.append(dialog);
    const input=dialog.querySelector('input'),results=dialog.querySelector('#finder-results'),clear=dialog.querySelector('#finder-clear');
    const render=()=>{
      const query=normalize(input.value);
      const matches=views.filter(([key,label])=>query.split(/\s+/).every(word=>normalize([label,...(terms[key]||[])].join(' ')).includes(word)));
      clear.hidden=!input.value;
      dialog.querySelector('#finder-count').textContent=a(`${matches.length} قسم متاح لصلاحيتك`,`${matches.length} sections available to your role`);
      results.innerHTML=matches.length?matches.map(([key,label])=>`<button type="button" class="finder-result" data-destination="${esc(key)}">${workspaceIcon(key)}<span>${esc(label)}</span><span aria-hidden="true">↗</span></button>`).join(''):`<div class="finder-empty"><h3>${a('ما لقينا القسم.','No matching sections.')}</h3><p>${a('جرّب كلمة أقصر أو امسح البحث لعرض كل أدواتك.','Try a shorter word or clear the search to see all your tools.')}</p></div>`;
    };
    input.addEventListener('input',event=>{if(!event.isComposing)render();});
    input.addEventListener('compositionend',render);
    clear.onclick=()=>{input.value='';render();input.focus();};
    dialog.querySelector('#finder-close').onclick=()=>dialog.close();
    results.onclick=event=>{const button=event.target.closest('[data-destination]');if(!button)return;const key=button.dataset.destination;dialog.close();navigate(key);};
    dialog.addEventListener('keydown',event=>{
      if(event.isComposing)return;
      if(event.key==='Escape'){event.preventDefault();dialog.close();return;}
      const buttons=[...results.querySelectorAll('button')],index=buttons.indexOf(document.activeElement);
      if(event.key==='ArrowDown'||event.key==='ArrowUp'){
        event.preventDefault();
        if(!buttons.length)return;
        const next=index<0?(event.key==='ArrowDown'?0:buttons.length-1):(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;
        buttons[next].focus();
      }else if(event.key==='Enter'&&event.target===input){event.preventDefault();buttons[0]?.click();}
    });
    dialog.addEventListener('close',()=>{dialog.remove();trigger.focus();},{once:true});
    render();dialog.showModal();input.focus();
  }
  trigger.onclick=open;
  document.addEventListener('keydown',event=>{
    if(event.isComposing||event.altKey||event.repeat||!(event.metaKey||event.ctrlKey)||event.key.toLowerCase()!=='k')return;
    if(event.target.closest('input,textarea,select,[contenteditable="true"]'))return;
    event.preventDefault();open();
  });
}
