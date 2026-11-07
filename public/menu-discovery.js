// Pure discovery: missing nutrition never becomes a zero or a dietary claim.
export function discoverItems(items, categories, filters = {}) {
  const closed = new Set(categories.filter(c => c.scheduled_available === false).map(c => c.id));
  const query = (filters.query || '').trim().toLocaleLowerCase();
  const result = items.filter(i => i.available && !closed.has(i.category_id)
    && (!query || [i.name_ar,i.name_en,i.desc_ar,i.desc_en].filter(Boolean).join(' ').toLocaleLowerCase().includes(query))
    && (!filters.dietary || i.dietary?.includes(filters.dietary))
    && (filters.maxPrice == null || i.price <= filters.maxPrice)
    && (filters.maxCalories == null || (i.calories != null && i.calories <= filters.maxCalories)));
  if (filters.sort === 'popular') result.sort((a,b) => (b.orders_today || 0) - (a.orders_today || 0));
  if (filters.sort === 'price') result.sort((a,b) => a.price - b.price);
  return result;
}

// Server hints and the rendered image must use the same bounded media sizes.
export function responsiveMedia(media) {
  const variants=media?.variants?.filter(v=>[320,640,960].includes(v.width))||[];
  return {srcset:variants.map(v=>v.url+' '+v.width+'w').join(', '),sizes:variants.length?'(max-width: 600px) 45vw, 320px':''};
}
export function initialMenuImages(data) {
  if(data.profile_data?.profile?.theme?.show_images===false || data.design?.layout==='text' || data.design?.show?.images===false)return [];
  const visible=discoverItems(data.items,data.categories);
  return data.categories.flatMap(category=>visible.filter(item=>item.category_id===category.id)).filter(item=>item.image_url).slice(0,4).map(item=>({src:item.image_url,...responsiveMedia(item.gallery?.[0])}));
}

// Public display strings only; checkout totals still come from server pricing.
const priceFormatters=new Map();
export function publicPriceLabels(items) {
  const amounts=new Set([0]);
  for(const item of items)for(const amount of [item.price,item.compare_price])if(Number.isSafeInteger(amount)&&amount>=0)amounts.add(amount);
  return Object.fromEntries(['ar','en'].map(lang=>{
    if(!priceFormatters.has(lang))priceFormatters.set(lang,new Intl.NumberFormat(lang==='ar'?'ar-SA-u-nu-latn':'en-SA',{style:'currency',currency:'SAR'}));
    return [lang,Object.fromEntries([...amounts].map(amount=>[amount,priceFormatters.get(lang).format(amount/100)]))];
  }));
}

export function firstMenuImage(data){return initialMenuImages(data)[0]||null;}
