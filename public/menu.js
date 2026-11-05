import { discoverItems } from './menu-discovery.js';
import {applyMenuContent} from './tenant-pages.js';
import {applyTenantTheme,bannerGallery,coverImage} from './tenant-theme.js';
import { applyDesign, listenForPreview } from './design-engine.js';
import { api, esc, lang, makeT, money, pick, setBrandColor, topbar, announce } from './common.js';
import { renderAddons, trackPurchase } from './addons-public.js';

const a = (ar, en) => (lang === 'ar' ? ar : en);
const t = makeT({
  ar: { search: 'ابحث عن صنف', soldout: 'نفد', kcal: '{n} سعرة', notFound: 'هذا المنيو غير متاح حاليًا. تأكد من الرابط وحاول مجددًا.', empty: 'لا توجد أصناف تطابق بحثك.', loyalty: 'بطاقة الولاء', clear: 'مسح' },
  en: { search: 'Search items', soldout: 'Sold out', kcal: '{n} kcal', notFound: 'This menu is currently unavailable. Check the link and try again.', empty: 'No matching items.', loyalty: 'Loyalty card', clear: 'Clear' },
});
const svg = (d, s = 18) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON = {
  pin: svg('<path d="M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>', 16),
  phone: svg('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>', 16),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', 20),
  gift: svg('<rect x="3" y="8" width="18" height="13" rx="2"/><path d="M12 8v13M3 12h18M12 8S9 3 7 5s5 3 5 3 3-5 5-3-5 3-5 3"/>', 22),
  store: svg('<path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6"/>', 22),
  plus: svg('<path d="M12 5v14M5 12h14"/>', 18),
  dish: svg('<path d="M3 15h18M5 15a7 7 0 0 1 14 0M12 6V4M2 19h20"/>', 40),
};

const slug = decodeURIComponent(location.pathname.split('/')[2] || '');
const main = document.getElementById('main');
let loyalty = null, data, profile = null, q = '', settings = { orders_enabled: false }, cart = new Map(), orderToken = null, orderTimer = null, orderKey = crypto.randomUUID(), orderNote = '', quoteNeedsReview = false;
// Checkout choices survive re-renders; a table number comes from the table's QR (?table=7).
const checkout = { type: null, table: '', name: '', phone: '', address: '', car: '', coupon: '', discount: 0, couponFor: 0 };
let ordering = { types: ['pickup'], tables: 0, whatsapp: null, delivery_fee: 0, delivery_min: 0 };
try {
  cart = new Map(JSON.parse(sessionStorage.getItem('zm_cart_' + slug) || '[]'));
  orderToken = sessionStorage.getItem('zm_order_' + slug);
  const urlTable = new URLSearchParams(location.search).get('table');
  if (urlTable && /^\d{1,3}$/.test(urlTable)) sessionStorage.setItem('zm_table_' + slug, urlTable);
  checkout.table = sessionStorage.getItem('zm_table_' + slug) || '';
  Object.assign(checkout, JSON.parse(sessionStorage.getItem('zm_checkout') || '{}'), { coupon: '', discount: 0 });
} catch {}
const filters = { dietary: '', maxPrice: null, maxCalories: null, sort: '' };
let availabilityTimer, sectionObserver;
const canCart = () => settings.orders_enabled || Boolean(ordering.whatsapp);
const TYPE = { dine_in: ['🍽 محلي', '🍽 Dine-in'], pickup: ['🛍 استلام', '🛍 Pickup'], delivery: ['🛵 توصيل', '🛵 Delivery'], car: ['🚗 سيارة', '🚗 Curbside'] };
const saveCheckout = () => { try { const { name, phone, address, car } = checkout; sessionStorage.setItem('zm_checkout', JSON.stringify({ name, phone, address, car })); } catch {} };

function openNow(hours) {
  if (!hours?.length) return null;
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Riyadh', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  const v = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(v.weekday);
  const time = v.hour + ':' + v.minute;
  const today = hours.find((h) => h.day === day), prev = hours.find((h) => h.day === (day + 6) % 7);
  if (prev && !prev.closed && prev.open > prev.close && time < prev.close) return true;
  if (!today) return null;
  if (today.closed) return false;
  return today.open < today.close ? time >= today.open && time < today.close : time >= today.open;
}

function itemCard(i, index = 0) {
  const inCart = countFor(i.id);
  const canAdd = canCart() && i.available;
  const photo=profile?.theme?.show_images!==false&&document.documentElement.dataset.dHideImages!=='1'&&document.documentElement.dataset.dLayout!=='text'&&i.image_url;
  return `<article class="dish ${i.available ? '' : 'soldout'} ${photo ? 'has-photo' : ''}">
    <div class="dish-text">
      ${i.badges?.length ? `<p class="dish-badges">${i.badges.filter(k => k !== 'popular' || i.orders_today > 0).map((k) => BADGE[k] ? `<span class="badge-${k}">${esc(a(...BADGE[k]))}</span>` : '').join('')}</p>` : ''}
      <h3><button type="button" class="dish-detail" data-detail="${esc(i.id)}">${esc(pick(i, 'name'))}</button></h3>
      ${pick(i, 'desc') ? `<p class="dish-desc">${esc(pick(i, 'desc'))}</p>` : ''}
      <p class="dish-meta"><span class="dish-price">${i.options?.length && i.options[0].required ? a('من ', 'From ') : ''}${esc(money(i.price))}</span>${i.compare_price > i.price ? `<s class="dish-was">${esc(money(i.compare_price))}</s><span class="dish-off">${a('خصم', 'Save')} ${Math.round((1 - i.price / i.compare_price) * 100)}٪</span>` : ''}${profile?.theme?.show_calories!==false && i.calories != null ? `<span class="dish-kcal">${esc(t('kcal', { n: i.calories }))}</span>` : ''}${i.caffeine_mg != null ? `<span class="dish-kcal">${a('كافيين', 'Caffeine')} ${i.caffeine_mg} ${a('ملغ', 'mg')}</span>` : ''}${i.sodium_mg != null ? `<span class="dish-kcal">${a('صوديوم', 'Sodium')} ${i.sodium_mg} ${a('ملغ', 'mg')}</span>` : ''}${i.available ? '' : `<span class="dish-out">${esc(t('soldout'))}</span>`}</p>
      ${i.allergens?.length ? `<p class="dish-allergens"><span class="visually-hidden">${a('مسببات الحساسية:', 'Allergens:')}</span>${i.allergens.map((k) => `<span class="allergen">${esc(allergenName(k))}</span>`).join('')}</p>` : ''}
    </div>
    ${photo ? `<div class="dish-photo"><img src="${esc(i.image_url)}" alt="" loading="${index < 2 ? 'eager' : 'lazy'}" ${index === 0 ? 'fetchpriority="high"' : ''} ${mediaAttrs(i.gallery?.[0])} width="320" height="240">${canAdd ? addBtn(i, inCart) : ''}</div>` : canAdd ? `<div class="dish-photo no-photo">${addBtn(i, inCart)}</div>` : ''}
  </article>`;
}
const BADGE = {
  new: ['جديد', 'New'], popular: ['الأكثر طلبًا', 'Popular'], chef: ['اختيار الشيف', "Chef's pick"], spicy: ['حار 🌶', 'Spicy 🌶'],
  vegan: ['نباتي صرف', 'Vegan'], vegetarian: ['نباتي', 'Vegetarian'], healthy: ['صحي', 'Healthy'], limited: ['لفترة محدودة', 'Limited time'],
};
const ALLERGEN = {
  gluten: ['غلوتين', 'Gluten'], crustaceans: ['قشريات', 'Crustaceans'], eggs: ['بيض', 'Eggs'], fish: ['سمك', 'Fish'],
  peanuts: ['فول سوداني', 'Peanuts'], soy: ['صويا', 'Soy'], milk: ['حليب', 'Milk'], tree_nuts: ['مكسرات', 'Tree nuts'],
  celery: ['كرفس', 'Celery'], mustard: ['خردل', 'Mustard'], sesame: ['سمسم', 'Sesame'], sulphites: ['كبريتيت', 'Sulphites'],
  lupin: ['ترمس', 'Lupin'], molluscs: ['رخويات', 'Molluscs'],
};
const allergenName = (k) => a(...(ALLERGEN[k] || [k, k]));
function mediaAttrs(media) {
  const variants = media?.variants?.filter(v => [320,640,960].includes(v.width));
  return variants?.length ? `srcset="${variants.map(v => esc(v.url)+' '+v.width+'w').join(', ')}" sizes="(max-width: 600px) 45vw, 320px"` : '';
}
// A cart line is "itemId" or "itemId|choiceA,choiceB" so the same dish with different options stays separate.
const lineKey = (id, opts = []) => (opts.length ? id + '|' + [...opts].sort().join(',') : id);
const splitKey = (k) => { const [id, o = ''] = k.split('|'); return { id, opts: o ? o.split(',') : [] }; };
function lineOf(k) {
  const { id, opts } = splitKey(k);
  const item = data.items.find((i) => i.id === id);
  if (!item) return null;
  const picked = [];
  let unit = item.price;
  for (const g of item.options || []) for (const ch of g.choices) if (opts.includes(ch.id)) { picked.push({ g, ch }); unit += ch.price; }
  if (picked.length !== opts.length) return null;
  return { item, opts, picked, unit };
}
const countFor = (id) => [...cart].reduce((n, [k, q]) => (splitKey(k).id === id ? n + q : n), 0);
const addBtn = (i, n) => `<button class="dish-add" type="button" data-add="${esc(i.id)}" aria-label="${esc(a('إضافة', 'Add') + ' ' + pick(i, 'name'))}">${n ? `<span>${n}</span>` : ICON.plus}</button>`;

function render(preserveInputs = false) {
  const active = document.activeElement;
  const restoreKey = active?.dataset?.add ? 'add' : active?.dataset?.detail ? 'detail' : null;
  const restoreId = restoreKey && active.dataset[restoreKey];
  const items = discoverItems(data.items, data.categories, { ...filters, query: q });
  const cats = data.categories.filter((c) => items.some((i) => i.category_id === c.id));
  main.querySelector('#list').innerHTML = cats.length
    ? cats.map((c) => `<section class="menu-section" id="c-${esc(c.id)}" aria-labelledby="h-${esc(c.id)}"><h2 id="h-${esc(c.id)}">${esc(pick(c, 'name'))}</h2><div class="dish-list">${items.filter((i) => i.category_id === c.id).map(i=>itemCard(i,items.indexOf(i))).join('')}</div></section>`).join('')
    : `<p class="empty">${esc(t('empty'))}</p>`;
  main.querySelectorAll('[data-detail]').forEach(b => b.onclick = () => openOptions(data.items.find(i => i.id === b.dataset.detail), b));
  main.querySelector('#result-count') && (main.querySelector('#result-count').textContent = a(`${items.length} صنف`, `${items.length} items`));
  main.querySelectorAll('.menu-cats a').forEach(b => b.hidden = !cats.some(c => '#c-' + c.id === b.getAttribute('href')));
  watchSections();
  if (restoreKey) (main.querySelector(`[data-${restoreKey}="${CSS.escape(restoreId)}"]`) || main.querySelector('#q'))?.focus({preventScroll:true});
  main.querySelectorAll('[data-add]').forEach((b) => (b.onclick = () => {
    const item = data.items.find((i) => i.id === b.dataset.add);
    if (item?.options?.length) return openOptions(item, b);
    addLine(lineKey(b.dataset.add));
  }));
  main.querySelector('#clear-q').hidden = !q;
  renderCart(preserveInputs);
}

function addLine(key) {
  const n = cart.get(key) || 0;
  if (n >= 20) return;
  cart.set(key, n + 1);
  saveCart();
  render();
  announce(a('أضيف إلى الطلب', 'Added to order'));
}

// Size and extras picker. Prices shown here are a preview; the server prices the order.
function openOptions(item, opener) {
  const dlg = document.createElement('dialog');
  dlg.className = 'options-sheet';
  dlg.dataset.itemId = item.id;
  dlg.setAttribute('aria-labelledby', 'opt-title');
  const groups = item.options || [];
  const allowed = canCart() && item.available;
  const gallery = item.gallery?.length ? item.gallery : item.image_url ? [{url:item.image_url}] : [];
  dlg.innerHTML = `<form method="dialog" class="stack">
    <header class="row-between"><h2 id="opt-title">${esc(pick(item, 'name'))}</h2><button class="btn ghost sm" value="cancel" type="submit" aria-label="${a('إغلاق', 'Close')}">✕</button></header>
    ${gallery.length ? `<div class="detail-gallery" tabindex="0" aria-label="${a('صور الصنف','Item photos')}">${gallery.map(m => `<img src="${esc(m.url)}" ${mediaAttrs(m)} alt="${esc(pick(item,'name'))}" width="640" height="480" loading="lazy">`).join('')}</div>` : ''}
    <p>${esc(pick(item,'desc') || '')}</p><p><strong>${esc(money(item.price))}</strong>${item.calories != null ? ' · '+esc(t('kcal',{n:item.calories})) : ''}</p>
    <p class="detail-allergens"><strong>${a('مسببات الحساسية','Allergens')}: </strong>${item.allergens?.length ? item.allergens.map(k=>esc(allergenName(k))).join('، ') : a('غير محددة — اسأل الموظف','Not specified — ask the staff')}</p>
    <div class="detail-complements" aria-live="polite"></div>
    ${groups.map((g, gi) => `<fieldset class="opt-group"><legend>${esc(pick(g, 'name'))} <small class="muted">${g.required ? a('مطلوب', 'Required') : a('اختياري', 'Optional')}${g.multi ? ' · ' + a(`حتى ${g.max}`, `up to ${g.max}`) : ''}</small></legend>
      ${g.choices.map((ch, ci) => `<label class="opt-choice"><input type="${g.multi ? 'checkbox' : 'radio'}" ${!allowed ? 'disabled' : ''} name="g${gi}" value="${esc(ch.id)}" ${!g.multi && g.required && ci === 0 ? 'checked' : ''}><span>${esc(pick(ch, 'name'))}</span><b>${ch.price ? '+' + esc(money(ch.price)) : ''}</b></label>`).join('')}</fieldset>`).join('')}
    <p class="msg error" id="opt-error" hidden></p>
    ${allowed ? '<button class="btn" type="submit" value="add" id="opt-add"></button>' : ''}
  </form>`;
  document.body.append(dlg);
  const form = dlg.querySelector('form');
  const chosen = () => [...form.querySelectorAll('input:checked')].map((x) => x.value);
  const update = () => {
    groups.forEach((g, gi) => {
      if (!g.multi) return;
      const boxes = [...form.querySelectorAll(`[name=g${gi}]`)];
      const n = boxes.filter((x) => x.checked).length;
      boxes.forEach((x) => (x.disabled = !allowed || (!x.checked && n >= g.max)));
    });
    const line = lineOf(lineKey(item.id, chosen()));
    if (allowed) dlg.querySelector('#opt-add').textContent = `${a('أضف للطلب', 'Add to order')} · ${money(line ? line.unit : item.price)}`;
  };
  form.addEventListener('change', update);
  update();
  dlg.addEventListener('close', () => {
    if (dlg.returnValue === 'add' && allowed && data.items.find(i => i.id === item.id)?.available) {
      const missing = groups.find((g, gi) => g.required && !form.querySelector(`[name=g${gi}]:checked`));
      if (missing) {
        const err = dlg.querySelector('#opt-error');
        err.hidden = false;
        err.textContent = a(`اختر ${pick(missing, 'name')} أولاً.`, `Choose a ${pick(missing, 'name')} first.`);
        dlg.showModal();
        return;
      }
      addLine(lineKey(item.id, chosen()));
    }
    dlg.remove();
    if(opener?.isConnected)opener.focus();
    else if(opener?.dataset?.add || opener?.dataset?.detail){const key=opener.dataset.add?'add':'detail';main.querySelector(`[data-${key}="${CSS.escape(opener.dataset[key])}"]`)?.focus({preventScroll:true});}
  });
  dlg.showModal();
  api('/api/public/menu/' + slug + '/recommendations/' + encodeURIComponent(item.id)).then(r => {
    if (!dlg.isConnected || !r.items?.length || !['orders','merchant'].includes(r.source)) return;
    const box=dlg.querySelector('.detail-complements');
    box.innerHTML=`<h3>${r.source==='orders' ? a('يُطلب معه عادةً','Often ordered together') : a('اقتراح المنشأة','Selected by the business')}</h3><p class="small muted">${r.source==='orders' ? a(`بناءً على ${r.sample_size} طلبات`, `Based on ${r.sample_size} orders`) : a('اختيارات المنشأة لتكملة الصنف','Merchant selections to complement this item')}</p>${r.items.filter(i=>i.available).map(i=>`<button type="button" class="btn ghost" data-complement="${esc(i.id)}">${esc(pick(i,'name'))} · ${esc(money(i.price))}</button>`).join('')}`;
    box.querySelectorAll('[data-complement]').forEach(b=>b.onclick=()=>{const next=data.items.find(i=>i.id===b.dataset.complement);if(next){dlg.close();openOptions(next,opener);}});
  }).catch(()=>{});
}

function saveCart() {
  try { sessionStorage.setItem('zm_cart_' + slug, JSON.stringify([...cart])); } catch {}
  orderKey = crypto.randomUUID();
}

// Up to three suggestions from sections not yet in the cart, popular ones first.
function suggestions(selected) {
  const inCart = new Set(selected.map((x) => x.line.item.id));
  const cats = new Set(selected.map((x) => x.line.item.category_id));
  const score = (i) => (i.orders_today > 0 ? 2 : 0) + (i.badges?.includes('chef') ? 1 : 0) + (cats.has(i.category_id) ? -5 : 0);
  return data.items.filter((i) => i.available && !inCart.has(i.id) && !i.options?.some((g) => g.required)).sort((x, y) => score(y) - score(x)).slice(0, 3);
}

function cartQuote() {
  return JSON.stringify([[...cart].map(([key, quantity]) => { const line = lineOf(key); return [key, quantity, line?.unit, Boolean(line?.item.available)]; }), checkout.type === 'delivery' ? ordering.delivery_fee : 0]);
}

function renderCart(preserveInputs = false) {
  const box = main.querySelector('#cart');
  const focused = box.contains(document.activeElement) ? document.activeElement : null;
  const inputNodes = preserveInputs ? [...box.querySelectorAll('input[id],textarea[id],select[id]')] : [];
  const caret = focused && typeof focused.selectionStart === 'number' ? [focused.selectionStart, focused.selectionEnd] : null;
  if (!canCart()) { box.hidden = true; return; }
  const selected = [...cart].map(([key, quantity]) => ({ key, line: lineOf(key), quantity })).filter((x) => x.line && x.line.item.available);
  const unavailable = [...cart].filter(([key]) => !lineOf(key)?.item.available);
  box.hidden = !selected.length && !unavailable.length;
  if (!selected.length) {box.innerHTML = `<p role="status">${a('أصناف طلبك لم تعد متاحة حاليًا. احتفظنا باختياراتك حتى تتوفر.','Your selected items are currently unavailable. Your choices are saved until they return.')}</p>`;return;}
  const types = settings.orders_enabled ? ordering.types : [];
  if (!types.includes(checkout.type)) checkout.type = types.includes('dine_in') && checkout.table ? 'dine_in' : types[0] || null;
  const subtotal = selected.reduce((sum, x) => sum + x.line.unit * x.quantity, 0);
  if (checkout.couponFor !== subtotal) { checkout.coupon = ''; checkout.discount = 0; }
  const fee = checkout.type === 'delivery' ? ordering.delivery_fee : 0;
  const total = subtotal - checkout.discount + fee;
  const short = checkout.type === 'delivery' && subtotal < ordering.delivery_min;
  const field = (k, label, attrs = '') => `<label for="co-${k}">${label}</label><input id="co-${k}" data-co="${k}" value="${esc(checkout[k])}" ${attrs}>`;
  const ups = suggestions(selected);
  const details = checkout.type === 'dine_in'
    ? (ordering.tables ? `<label for="co-table">${a('رقم الطاولة', 'Table number')}</label><select id="co-table" data-co="table"><option value="">${a('اختر', 'Choose')}</option>${Array.from({ length: ordering.tables }, (_, i) => `<option ${String(i + 1) === String(checkout.table) ? 'selected' : ''}>${i + 1}</option>`).join('')}</select>` : field('table', a('رقم الطاولة (اختياري)', 'Table (optional)'), 'maxlength="10" inputmode="numeric"'))
    : checkout.type === 'delivery'
      ? field('name', a('الاسم', 'Name'), 'maxlength="60" autocomplete="name" required') + field('phone', a('الجوال', 'Mobile'), 'dir="ltr" inputmode="tel" autocomplete="tel" placeholder="05xxxxxxxx" required') + field('address', a('العنوان', 'Address'), 'maxlength="300" autocomplete="street-address" required')
      : checkout.type === 'car'
        ? field('car', a('السيارة (النوع واللون)', 'Car (model and colour)'), 'maxlength="60" placeholder="' + a('مثال: كامري بيضاء', 'e.g. white Camry') + '" required') + field('phone', a('الجوال (اختياري)', 'Mobile (optional)'), 'dir="ltr" inputmode="tel" autocomplete="tel"')
        : checkout.type === 'pickup' ? field('name', a('اسمك (اختياري)', 'Your name (optional)'), 'maxlength="60" autocomplete="given-name"') : '';
  box.innerHTML = `${unavailable.length ? `<p class="msg" role="status">${a('بعض الأصناف لم تعد متاحة واستُبعدت من الإجمالي. احتفظنا باختياراتك المتاحة.','Some items are unavailable and excluded from the total. Your available choices are retained.')}</p>` : ''}<h2>${a('طلبك', 'Your order')}</h2>${selected.map(({ key, line: { item: i, picked, unit }, quantity: n }) => `<div class="cart-row"><div><strong>${esc(pick(i, 'name'))}</strong>${picked.length ? `<p class="small muted">${picked.map((p) => esc(pick(p.ch, 'name'))).join('، ')}</p>` : ''}<p class="small muted">${esc(money(unit * n))}</p></div><div class="quantity-controls"><button class="btn ghost sm" type="button" data-minus="${esc(key)}" aria-label="${esc(a('تقليل', 'Decrease') + ' ' + pick(i, 'name'))}">−</button><span>${n}</span><button class="btn ghost sm" type="button" data-plus="${esc(key)}" aria-label="${esc(a('زيادة', 'Increase') + ' ' + pick(i, 'name'))}">+</button></div></div>`).join('')}
    ${ups.length ? `<div class="upsell"><p class="small"><strong>${a('يكمّل طلبك', 'Goes well with it')}</strong></p><div class="upsell-row">${ups.map((i) => `<button type="button" class="upsell-item" data-upsell="${esc(i.id)}">${i.image_url ? `<img src="${esc(i.image_url)}" alt="" width="44" height="44" loading="lazy">` : ''}<span>${esc(pick(i, 'name'))}<small>+ ${esc(money(i.price))}</small></span></button>`).join('')}</div></div>` : ''}
    ${types.length > 1 ? `<div class="seg order-types" role="radiogroup" aria-label="${a('طريقة الطلب', 'How to order')}">${types.map((k) => `<button type="button" role="radio" aria-checked="${k === checkout.type}" data-type="${k}">${a(...TYPE[k])}</button>`).join('')}</div>` : ''}
    ${details ? `<div class="stack checkout-fields">${details}</div>` : ''}
    ${settings.orders_enabled ? `<div class="coupon-row"><label class="visually-hidden" for="co-coupon">${a('كود الخصم', 'Discount code')}</label><input id="co-coupon" placeholder="${a('عندك كود خصم؟', 'Have a code?')}" dir="ltr" maxlength="20" value="${esc(checkout.coupon)}"><button type="button" class="btn ghost sm" id="apply-coupon">${a('طبّق', 'Apply')}</button></div><p class="small" id="coupon-msg" role="status">${checkout.discount ? a(`تم تطبيق الخصم ✓`, 'Discount applied ✓') : ''}</p>` : ''}
    <div class="cart-sum">${checkout.discount || fee ? `<div class="cart-row"><span>${a('المجموع', 'Subtotal')}</span><span>${esc(money(subtotal))}</span></div>` : ''}${checkout.discount ? `<div class="cart-row"><span>${a('الخصم', 'Discount')}</span><span>−${esc(money(checkout.discount))}</span></div>` : ''}${fee ? `<div class="cart-row"><span>${a('التوصيل', 'Delivery')}</span><span>${esc(money(fee))}</span></div>` : ''}
    <div class="cart-row"><strong>${a('الإجمالي', 'Total')}</strong><strong>${esc(money(total))}</strong></div></div>
    ${short ? `<p class="msg error">${a(`أقل طلب للتوصيل ${money(ordering.delivery_min)}.`, `Minimum for delivery is ${money(ordering.delivery_min)}.`)}</p>` : ''}
    ${quoteNeedsReview ? `<p class="msg" role="status">${a('تغيّر سعر أو توفر بعض الأصناف. راجع الإجمالي الجديد قبل إرسال الطلب.','Some prices or availability changed. Review the new total before sending your order.')}</p><button type="button" class="btn ghost" id="review-prices">${a('راجعت الطلب والإجمالي الجديد','I reviewed the order and new total')}</button>` : ''}
    <label for="order-note">${a('ملاحظة (اختياري)', 'Note (optional)')}</label>
    <textarea id="order-note" rows="2" maxlength="300" placeholder="${a('مثال: بدون سكر', 'e.g. no sugar')}">${esc(orderNote)}</textarea>
    ${settings.orders_enabled ? `<p class="small muted">${checkout.type === 'delivery' ? a('الدفع عند الاستلام.', 'Pay on delivery.') : a('الدفع عند الكاشير.', 'Pay at the counter.')}</p><button type="button" class="btn" id="send-order" ${short || quoteNeedsReview ? 'disabled' : ''}>${a('أرسل الطلب', 'Send order')}</button>` : ''}
    ${ordering.whatsapp ? `<a class="btn ${settings.orders_enabled ? 'ghost' : ''} wa-order" id="wa-order" target="_blank" rel="noopener">${a('اطلب عبر واتساب', 'Order on WhatsApp')}</a>` : ''}
    <div id="order-message" role="status"></div>`;
  for (const old of inputNodes) {
    const fresh = old.id && box.querySelector('#' + CSS.escape(old.id));
    if (!fresh || fresh.tagName !== old.tagName) continue;
    if (old.tagName === 'SELECT') { const value = old.value; old.innerHTML = fresh.innerHTML; old.value = value; }
    fresh.replaceWith(old);
  }
  box.querySelector('#review-prices')?.addEventListener('click', () => { quoteNeedsReview = false; renderCart(true); box.querySelector('#send-order')?.focus({preventScroll:true}); });
  const wa = box.querySelector('#wa-order');
  const waLink = () => {
    const lines = selected.map(({ line: { item, picked, unit }, quantity: n }) => `• ${n}× ${pick(item, 'name')}${picked.length ? ' (' + picked.map((p) => pick(p.ch, 'name')).join('، ') + ')' : ''} · ${money(unit * n)}`);
    const extra = [checkout.type ? a(...TYPE[checkout.type]) : '', checkout.table ? a('طاولة ', 'Table ') + checkout.table : '', checkout.name, checkout.address, checkout.car, orderNote.trim()].filter(Boolean);
    const text = `${a('طلب جديد من المنيو', 'New order from the menu')} · ${pick(data.branch, 'name')}\n${lines.join('\n')}\n${a('الإجمالي', 'Total')}: ${money(total)}${extra.length ? '\n' + extra.join('\n') : ''}`;
    return `https://wa.me/${ordering.whatsapp}?text=${encodeURIComponent(text)}`;
  };
  if (wa) { wa.setAttribute('aria-disabled', String(quoteNeedsReview)); wa.addEventListener('click', e => { if (quoteNeedsReview) e.preventDefault(); }); wa.href = waLink(); wa.addEventListener('focus', () => (wa.href = waLink())); wa.addEventListener('pointerdown', () => (wa.href = waLink())); }
  box.querySelector('#order-note').oninput = (e) => { orderNote = e.target.value; orderKey = crypto.randomUUID(); };
  box.querySelectorAll('[data-co]').forEach((inp) => { inp[inp.tagName === 'SELECT' ? 'onchange' : 'oninput'] = () => { checkout[inp.dataset.co] = inp.value.trim(); orderKey = crypto.randomUUID(); saveCheckout(); }; });
  box.querySelectorAll('[data-type]').forEach((b) => (b.onclick = () => { checkout.type = b.dataset.type; orderKey = crypto.randomUUID(); renderCart(); box.querySelector(`[data-type="${checkout.type}"]`)?.focus(); }));
  box.querySelectorAll('[data-upsell]').forEach((b) => (b.onclick = () => addLine(lineKey(b.dataset.upsell))));
  box.querySelector('#apply-coupon')?.addEventListener('click', async (e) => {
    const code = box.querySelector('#co-coupon').value.trim(), msg = box.querySelector('#coupon-msg');
    if (!code) return;
    e.target.disabled = true;
    try {
      const r = await api('/api/public/coupons/' + slug + '/check', { method: 'POST', body: { code, subtotal } });
      Object.assign(checkout, { coupon: r.code, discount: r.discount, couponFor: subtotal });
      orderKey = crypto.randomUUID();
      renderCart();
      announce(a('تم تطبيق الخصم', 'Discount applied'));
    } catch (err) {
      const k = err?.data?.error;
      msg.className = 'small error-text';
      msg.textContent = k === 'coupon_expired' ? a('الكود منتهي.', 'This code has expired.') : k === 'coupon_used_up' ? a('الكود استُخدم بالكامل.', 'This code is used up.') : k === 'coupon_min_total' ? a('السلة أقل من الحد المطلوب للكود.', 'Your cart is below this code’s minimum.') : err?.status === 429 ? a('محاولات كثيرة. انتظر شوي.', 'Too many tries. Wait a moment.') : a('الكود غير صحيح.', 'Invalid code.');
      e.target.disabled = false;
    }
  });
  box.querySelectorAll('[data-minus]').forEach((b) => (b.onclick = () => { const n = cart.get(b.dataset.minus) || 0; if (n <= 1) cart.delete(b.dataset.minus); else cart.set(b.dataset.minus, n - 1); saveCart(); render(); }));
  box.querySelectorAll('[data-plus]').forEach((b) => (b.onclick = () => { cart.set(b.dataset.plus, Math.min(20, (cart.get(b.dataset.plus) || 0) + 1)); saveCart(); render(); }));
  box.querySelector('#send-order')?.addEventListener('click', async (e) => {
    if (quoteNeedsReview) return;
    const missing = [...box.querySelectorAll('.checkout-fields [required]')].find((x) => !x.value.trim()) || (checkout.type === 'dine_in' && ordering.tables && !checkout.table ? box.querySelector('#co-table') : null);
    if (missing) { box.querySelector('#order-message').innerHTML = `<p class="msg error">${a('كمّل البيانات المطلوبة.', 'Please complete the required details.')}</p>`; missing.focus(); return; }
    e.target.disabled = true;
    const c = checkout;
    try {
      const d = await api('/api/public/orders/' + slug, { method: 'POST', body: {
        idem_key: orderKey, note: orderNote.trim() || undefined, order_type: c.type || undefined,
        table: c.type === 'dine_in' && c.table ? c.table : undefined,
        name: ['delivery', 'pickup'].includes(c.type) && c.name ? c.name : undefined,
        phone: ['delivery', 'car'].includes(c.type) && c.phone ? c.phone : undefined,
        address: c.type === 'delivery' ? c.address : undefined, car: c.type === 'car' ? c.car : undefined,
        coupon: c.discount ? c.coupon : undefined,
        expected_total: total,
        items: selected.map((x) => ({ item_id: x.line.item.id, quantity: x.quantity, options: x.line.opts })),
      } });
      orderToken = d.order.token;
      trackPurchase(d.order.total);
      try { sessionStorage.setItem('zm_order_' + slug, orderToken); } catch {}
      cart.clear();
      quoteNeedsReview = false;
      orderNote = '';
      Object.assign(checkout, { coupon: '', discount: 0 });
      saveCart();
      render();
      pollOrder();
    } catch (err) {
      const k = err?.data?.error;
      if (k === 'price_changed') { quoteNeedsReview = true; await refreshAvailability(); renderCart(true); announce(a('تغيّر الإجمالي. راجع الطلب والسعر الجديد.','The total changed. Review your order and its new price.')); return; }
      const why = k === 'invalid_phone' ? a('رقم الجوال لازم يبدأ بـ 05.', 'The mobile number must start with 05.') : k === 'delivery_min_total' ? a('السلة أقل من حد التوصيل.', 'Below the delivery minimum.') : k?.startsWith?.('coupon_') ? a('كود الخصم ما عاد صالح. احذفه وأرسل مرة ثانية.', 'The discount code is no longer valid. Remove it and resend.') : a('تعذر إرسال الطلب. قد تغيّر السعر أو التوفر؛ حدّث المنيو ثم حاول مجددًا.', 'Could not send the order. Prices or availability may have changed; refresh the menu and retry.');
      if (k?.startsWith?.('coupon_')) Object.assign(checkout, { coupon: '', discount: 0 });
      box.querySelector('#order-message').innerHTML = `<p class="msg error">${why}</p>`;
      e.target.disabled = false;
    }
  });
  if (focused) {
    const target = focused.id ? box.querySelector('#' + CSS.escape(focused.id)) : null;
    if (target && !target.disabled) { target.focus({preventScroll:true}); if (caret && typeof target.setSelectionRange === 'function') target.setSelectionRange(...caret); }
    else box.querySelector('#review-prices')?.focus({preventScroll:true});
  }
}

async function pollOrder() {
  clearTimeout(orderTimer);
  if (!orderToken) return;
  const box = main.querySelector('#order-status');
  try {
    const d = await api('/api/public/order/' + encodeURIComponent(orderToken));
    box.hidden = false;
    box.innerHTML = d.ticket
      ? `<p class="msg">${a('قبل الكاشير طلبك. افتح صفحة النداء لمتابعته.', 'The cashier accepted your order. Open the pager page to follow it.')}</p><a class="btn" href="/t/${esc(d.ticket.token)}">${a('متابعة الطلب رقم', 'Track order')} ${esc(d.ticket.number)}</a>`
      : d.order.status === 'rejected'
        ? `<p class="msg error">${a('تعذر قبول طلبك. راجع الكاشير لمعرفة التفاصيل.', 'Your order could not be accepted. Please check with the cashier.')}</p>`
        : `<p class="msg">${a('تم إرسال طلبك. بانتظار مراجعة الكاشير.', 'Order sent. Waiting for the cashier to review.')}</p>`;
    if (d.order.status === 'pending') orderTimer = setTimeout(pollOrder, 4000);
  } catch {
    box.hidden = false;
    box.innerHTML = `<p class="msg error">${a('نحاول استعادة حالة طلبك…', 'Restoring your order status…')}</p>`;
    orderTimer = setTimeout(pollOrder, 8000);
  }
}

// Highlight the category chip of the section being read, and keep it in view.
function watchSections() {
  const chips = new Map([...main.querySelectorAll('.menu-cats a')].map((x) => [x.getAttribute('href').slice(1), x]));
  if (!chips.size || !('IntersectionObserver' in window)) return;
  sectionObserver?.disconnect();
  const io = sectionObserver = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      chips.forEach((c) => c.removeAttribute('aria-current'));
      const chip = chips.get(e.target.id);
      if (chip) {
        chip.setAttribute('aria-current', 'true');
        // Do not move the page while browsing or typing; native category scrolling stays under user control.
      }
    }
  }, { rootMargin: '-140px 0px -65% 0px' });
  main.querySelectorAll('.menu-section').forEach((s) => io.observe(s));
}

let merchantOrg;
try {
  data = await api('/api/public/menu/' + slug);
  if (data.ordering) ordering = data.ordering;
  setBrandColor(data.branch.brand_color);
  const name = lang === 'ar' ? data.branch.org_name_ar : data.branch.org_name_en;
  try {
    const p = await api('/api/public/profile/' + data.branch.org_slug);
    profile = p.profile;
    merchantOrg=p.org;
    applyTenantTheme(profile);
    applyDesign(data.design);
    settings = p.branches.find((b) => b.slug === slug)?.settings || settings;
    loyalty = p.loyalty;
  } catch {}
  topbar(document.getElementById('top'), t, { subtitle: name });
  document.title = `${name} · ${t('brand')}`;
  main.className = 'wrap menu-wrap';
  document.body.classList.add('menu-page');
  optimizeMenuFonts();

  const cover = profile?.banners?.[0];
  const status = openNow(settings.hours);
  const address = settings.address || profile?.address;
  const hasItems = data.items.length > 0;
  const info = [
    status === null ? '' : `<span class="status-pill ${status ? 'open' : 'closed'}"><span class="dot" aria-hidden="true"></span>${status ? a('مفتوح الآن', 'Open now') : a('مغلق الآن', 'Closed now')}</span>`,
    address ? `<span class="info-chip">${ICON.pin}${settings.maps_url ? `<a href="${esc(settings.maps_url)}" target="_blank" rel="noopener">${esc(address)}</a>` : esc(address)}</span>` : '',
    profile?.phone ? `<a class="info-chip" href="tel:${esc(profile.phone.replace(/[^+\d]/g, ''))}">${ICON.phone}<bdi>${esc(profile.phone)}</bdi></a>` : '',
  ].join('');

  main.innerHTML = `
    <header class="menu-cover ${cover ? 'has-photo' : ''}">${coverImage(cover)}</header>
    <section class="menu-sheet" aria-labelledby="menu-title">
      <div class="menu-id">
        ${data.branch.logo_url ? `<img class="menu-logo" src="${esc(data.branch.logo_url)}" alt="" width="84" height="84">` : `<span class="menu-logo menu-monogram" aria-hidden="true">${esc([...name][0] || 'Z')}</span>`}
        <div><h1 id="menu-title">${esc(name)}</h1>${data.branches?.length > 1 ? `<label class="visually-hidden" for="branch-pick">${a('الفرع', 'Branch')}</label><select id="branch-pick" class="branch-pick">${data.branches.map((b) => `<option value="${esc(b.slug)}" ${b.slug === slug ? 'selected' : ''}>${esc(pick(b, 'name'))}</option>`).join('')}</select>` : `<p class="menu-branch">${esc(pick(data.branch, 'name'))}</p>`}</div>
      </div>
      <details class="menu-description" id="menu-business-details"><summary aria-label="${a('معلومات المنشأة والاسم الكامل','Business information and full name')}">${a('عن المنشأة','About us')}</summary><p class="menu-about menu-full-name" id="menu-full-name">${esc(name)}</p>${profile && pick(profile, 'description') ? `<p class="menu-about">${esc(pick(profile,'description'))}</p>` : ''}</details>
      ${info ? `<div class="menu-info">${info}</div>` : ''}
      ${data.waitlist ? `<a class="btn ghost sm wl-join-link" id="wl-join-link" href="/q/${esc(slug)}">⏳ ${a('سجّل في قائمة الانتظار', 'Join the waitlist')}</a>` : ''}
    </section>
    ${profile?.banners?.length > 1 ? `<details class="menu-gallery-disclosure"><summary>${a('صور المنشأة','Business photos')}</summary>${bannerGallery(profile.banners)}</details>` : ''}
    ${hasItems ? `
    <div class="menu-sticky">
      <div class="search-field"><span class="search-ico">${ICON.search}</span><label class="visually-hidden" for="q">${esc(t('search'))}</label><input id="q" type="search" placeholder="${esc(t('search'))}" autocomplete="off"><button id="clear-q" type="button" class="btn ghost sm" hidden>${esc(t('clear'))}</button></div>
      ${data.categories.length > 1 ? `<nav class="menu-cats" aria-label="${a('أقسام المنيو', 'Menu sections')}">${data.categories.filter((c) => data.items.some((i) => i.category_id === c.id)).map((c) => `<a href="#c-${esc(c.id)}">${esc(pick(c, 'name'))}</a>`).join('')}</nav>` : ''}
      <details class="discovery-filters"><summary>${a('تصفية وترتيب','Filter & sort')}</summary><div class="filter-fields">
      <label>${a('التفضيل الغذائي','Dietary')}<select id="filter-dietary"><option value="">${a('الكل','All')}</option><option value="vegan">${a('نباتي صرف','Vegan')}</option><option value="vegetarian">${a('نباتي','Vegetarian')}</option><option value="gluten_free">${a('خالٍ من الغلوتين','Gluten free')}</option></select></label>
      <label>${a('أعلى سعر (ر.س)','Max price (SAR)')}<input id="filter-price" type="number" min="0" step="1" inputmode="decimal"></label>
      <label>${a('أعلى سعرات','Max kcal')}<input id="filter-calories" type="number" min="0" step="1" inputmode="numeric"></label>
      <label>${a('ترتيب','Sort')}<select id="filter-sort"><option value="">${a('ترتيب المنيو','Menu order')}</option><option value="popular">${a('الأكثر طلبًا اليوم','Most ordered today')}</option><option value="price">${a('السعر الأقل','Lowest price')}</option></select></label></div></details>
      <p id="result-count" class="small muted" role="status" aria-live="polite"></p>
    </div>
    <div id="order-status" class="card" hidden></div>
    <div class="menu-layout"><div id="list"></div><aside class="card cart-panel" id="cart" hidden aria-label="${a('طلبك', 'Your order')}"></aside></div>`
    : `<div class="card menu-empty" role="status"><span class="empty-ico">${ICON.dish}</span><h2>${a('المنيو قيد التجهيز', 'The menu is being prepared')}</h2><p class="muted">${a('نجهّز أصنافنا الآن. تعرّف علينا وعلى فروعنا وطرق التواصل.', 'Items are on their way. Meanwhile, get to know us and our branches.')}</p><a class="btn" href="/p/${esc(data.branch.org_slug)}">${a('عن المنشأة', 'About us')}</a></div><div id="order-status" hidden></div><div id="list" hidden></div><div id="cart" hidden></div><button id="clear-q" hidden></button>`}
    <section class="menu-more" aria-label="${a('المزيد من المنشأة', 'More from the business')}">
      ${loyalty ? `<a class="more-card" href="/j/${esc(data.branch.org_slug)}"><span class="more-ico">${ICON.gift}</span><span><strong>${esc(t('loyalty'))}</strong><small>${a(`اجمع ${loyalty.stamps_required} أختام واحصل على ${esc(loyalty.reward_ar)}`, `Collect ${loyalty.stamps_required} stamps, get ${esc(loyalty.reward_en)}`)}</small></span></a>` : ''}
      ${hasItems ? `<a class="more-card" href="/p/${esc(data.branch.org_slug)}"><span class="more-ico">${ICON.store}</span><span><strong>${a('عن المنشأة', 'About the business')}</strong><small>${a('الفروع، الموقع وطرق التواصل', 'Branches, location and contact')}</small></span></a>` : ''}
    </section>
    <p class="powered small muted">${a('منيو رقمي من', 'Digital menu by')} <a href="/">${esc(t('brand'))}</a></p>`;

  main.querySelector('#branch-pick')?.addEventListener('change', (e) => location.assign('/m/' + encodeURIComponent(e.target.value)));
  if (hasItems) {
    main.querySelector('#q').oninput = (e) => { q = e.target.value.trim().toLowerCase(); render(); };
    main.querySelector('#clear-q').onclick = () => { q = ''; main.querySelector('#q').value = ''; render(); main.querySelector('#q').focus(); };
    for(const [id,key,mult] of [['dietary','dietary',0],['price','maxPrice',100],['calories','maxCalories',1],['sort','sort',0]]) main.querySelector('#filter-'+id).addEventListener('input',e=>{filters[key]=mult ? (e.target.value==='' ? null : Number(e.target.value)*mult) : e.target.value;render();});
    applyMenuContent(main,data.design,merchantOrg);
  render();
    watchSections();
  }
  main.setAttribute('aria-busy','false');
  installMenuNameFitting();
  try { renderAddons(data.addons, { main, orgSlug: data.branch.org_slug }); } catch {}
  if (orderToken) pollOrder();
  availabilityTimer = setInterval(refreshAvailability, 30000);
  document.addEventListener('visibilitychange', () => {if(!document.hidden) refreshAvailability();});
  window.addEventListener('online', refreshAvailability);
} catch {
  topbar(document.getElementById('top'), t);
  main.setAttribute('aria-busy','false');
  main.className = 'wrap narrow';
  main.innerHTML = `<div class="card"><h1>${a('المنيو غير متاح', 'Menu unavailable')}</h1><p class="muted">${esc(t('notFound'))}</p><button class="btn" id="retry-menu" type="button">${a('إعادة المحاولة', 'Try again')}</button></div>`;
  main.querySelector('#retry-menu').onclick = () => location.reload();
}

listenForPreview(recipe=>{applyMenuContent(main,recipe,merchantOrg);optimizeMenuFonts();render();});

function installMenuNameFitting() {
 const heading=main.querySelector('#menu-title');
 if(!heading)return;
 let scheduled,lastWidth;
 const fit=()=>{
  const style=getComputedStyle(heading),maximum=parseFloat(style.fontSize),available=heading.clientWidth;
  if(!available)return;
  const measured=heading.scrollWidth;
  const size=Math.max(Math.min(14,maximum),Math.min(maximum,maximum*available/Math.max(1,measured)));
  if(size<maximum)heading.style.fontSize=(Math.floor(size*100)/100)+'px';
  heading.title=heading.textContent;
  heading.dataset.nameClipped=String(measured*size/maximum>available+1);
  const full=main.querySelector('#menu-full-name');if(full&&full.textContent!==heading.textContent)full.textContent=heading.textContent;
 };
 // Let the browser lay out the maximum CSS size before measuring native text overflow.
 // Canvas font initialization and reset/read in one task blocked the first paint.
 const queue=()=>{cancelAnimationFrame(scheduled);scheduled=requestAnimationFrame(()=>{heading.style.removeProperty('font-size');scheduled=requestAnimationFrame(fit);});};
 new ResizeObserver(entries=>{const width=entries[0].contentRect.width;if(width!==lastWidth){lastWidth=width;queue();}}).observe(heading.parentElement);
 new MutationObserver(queue).observe(heading,{childList:true,characterData:true,subtree:true});
 document.fonts.ready.then(queue);queue();
}

function optimizeMenuFonts(){
 const root=document.documentElement;
 for(const prop of ['--font','--tenant-heading-font']){
 const family=getComputedStyle(root).getPropertyValue(prop);
 if(family)root.style.setProperty(prop,family.replace(/Plus Jakarta Sans/g,'MenuJakarta').replace(/\bTajawal\b/g,'MenuTajawal'));
 }
}

async function refreshAvailability(){
 if(document.hidden || !navigator.onLine || !data) return;
 try {const fresh=await api('/api/public/menu/'+slug);
 const changed=JSON.stringify([fresh.items,fresh.categories,fresh.ordering])!==JSON.stringify([data.items,data.categories,data.ordering]);
 if(!changed)return;
 const previousQuote = cartQuote();
 data.items=fresh.items;data.categories=fresh.categories;data.discovery=fresh.discovery;data.ordering=fresh.ordering;
 if(fresh.ordering) ordering=fresh.ordering;
 if(cart.size && previousQuote !== cartQuote()) quoteNeedsReview = true;
 const unavailable=[...cart.keys()].some(k=>!data.items.find(i=>i.id===splitKey(k).id)?.available);
 const dialog=document.querySelector('.options-sheet[open]');
 if(dialog&&!data.items.find(i=>i.id===dialog.dataset.itemId)?.available){dialog.querySelector('#opt-add')?.setAttribute('disabled','');announce(a('هذا الصنف لم يعد متاحًا','This item is no longer available'));}
 render(true); if(unavailable)announce(a('بعض أصناف طلبك لم تعد متاحة؛ احتفظنا باختياراتك المتاحة','Some order items are unavailable; your available choices are retained'));
 }catch{}
}
