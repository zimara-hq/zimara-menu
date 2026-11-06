import {lang} from './common.js';
const a=(ar,en)=>lang==='ar'?ar:en;
const arrow='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
// Reuse destinations actually present in the merchant's page; hidden sections
// and deliberately absent destinations do not acquire a new navigation owner.
export function visitorActions(main,{services=false}={}){
 document.querySelector('#visitor-actions')?.remove();document.body.classList.remove('has-visitor-actions');
 if(new URLSearchParams(location.search).has('design_preview')&&window.parent!==window)return;
 const menu=[...main.querySelectorAll('a[href]')].find(link=>link.getAttribute('href').startsWith('/m/'));
 if(!menu)return;
 const direction=[...main.querySelectorAll('a[href]')].find(link=>/^(https:\/\/)(maps\.app\.goo\.gl|(?:www\.)?google\.[a-z.]+\/maps|maps\.google\.[a-z.]+)(?:[/?]|$)/i.test(link.href));
 const call=main.querySelector('a[href^="tel:"]'),secondary=direction||call;
 const nav=document.createElement('nav');nav.id='visitor-actions';nav.className='visitor-actions';nav.setAttribute('aria-label',a('روابط الزيارة السريعة','Quick visit actions'));
 const mainLink=document.createElement('a');mainLink.className='visitor-primary';mainLink.href=menu.getAttribute('href');mainLink.textContent=services?a('تصفّح الخدمات','Browse services'):a('تصفّح المنيو','Browse menu');mainLink.insertAdjacentHTML('beforeend',arrow);nav.append(mainLink);
 if(secondary){const link=document.createElement('a');link.className='visitor-secondary';link.href=secondary.getAttribute('href');link.textContent=direction?a('الاتجاهات','Directions'):a('اتصل بنا','Call us');if(direction){link.target='_blank';link.rel='noopener';}nav.append(link);}
 document.body.append(nav);document.body.classList.add('has-visitor-actions');
}
