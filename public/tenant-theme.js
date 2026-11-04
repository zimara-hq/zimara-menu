import {esc,lang,applyTenantFont,pick} from './common.js';

export function applyTenantTheme(profile = {}) {
  const theme=profile.theme||{},root=document.documentElement;
  root.dataset.tenantCustomFont=(theme.font==='custom'||!theme.font)&&profile.font_url?'1':'0';
  for(const [key,values] of Object.entries({layout:['list','cards'],corners:['soft','square'],cover:['wide','compact']}))
    root.dataset['tenant'+key[0].toUpperCase()+key.slice(1)]=values.includes(theme[key])?theme[key]:values[0];
  if(theme.font==='system')root.style.setProperty('--font','system-ui, sans-serif');
  else if(theme.font==='custom'||!theme.font)applyTenantFont(profile.font_url);
}

export function bannerGallery(banners=[]){
  if(banners.length<2)return '';
  return `<section class="tenant-gallery" aria-label="${lang==='ar'?'صور المنشأة':'Business photos'}">${banners.slice(1).map(b=>{
    const img=`<img src="${esc(b.image_url)}" alt="${esc(pick(b,'alt'))}" loading="lazy" width="600" height="340">`;
    return b.href?`<a href="${esc(b.href)}" target="_blank" rel="noopener" aria-label="${esc(pick(b,'alt')||(lang==='ar'?'عرض المزيد':'Learn more'))}">${img}</a>`:`<div>${img}</div>`;
  }).join('')}</section>`;
}

export function coverImage(b){
  if(!b)return '';
  const img=`<img src="${esc(b.image_url)}" alt="${esc(pick(b,'alt'))}" width="1240" height="440">`;
  return b.href?`<a href="${esc(b.href)}" target="_blank" rel="noopener" aria-label="${esc(pick(b,'alt')||(lang==='ar'?'عرض المزيد':'Learn more'))}">${img}</a>`:img;
}
