import {applyTenantTheme,bannerGallery,coverImage} from './tenant-theme.js';
import { api, esc, lang, makeT, money, pick, setBrandColor, topbar, announce } from './common.js';

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
let loyalty = null, data, profile = null, q = '', settings = { orders_enabled: false }, cart = new Map(), orderToken = null, orderTimer = null, orderKey = crypto.randomUUID(), orderNote = '';
try {
  cart = new Map(JSON.parse(sessionStorage.getItem('zm_cart_' + slug) || '[]'));
  orderToken = sessionStorage.getItem('zm_order_' + slug);
} catch {}

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

function itemCard(i) {
  const inCart = countFor(i.id);
  const canAdd = settings.orders_enabled && i.available;
  const photo=profile?.theme?.show_images!==false&&i.image_url;
  return `<article class="dish ${i.available ? '' : 'soldout'} ${photo ? 'has-photo' : ''}">
    <div class="dish-text">
      <h3>${esc(pick(i, 'name'))}</h3>
      ${pick(i, 'desc') ? `<p class="dish-desc">${esc(pick(i, 'desc'))}</p>` : ''}
      <p class="dish-meta"><span class="dish-price">${i.options?.length && i.options[0].required ? a('من ', 'From ') : ''}${esc(money(i.price))}</span>${i.compare_price > i.price ? `<s class="dish-was">${esc(money(i.compare_price))}</s><span class="dish-off">${a('خصم', 'Save')} ${Math.round((1 - i.price / i.compare_price) * 100)}٪</span>` : ''}${profile?.theme?.show_calories!==false && i.calories != null ? `<span class="dish-kcal">${esc(t('kcal', { n: i.calories }))}</span>` : ''}${i.caffeine_mg != null ? `<span class="dish-kcal">${a('كافيين', 'Caffeine')} ${i.caffeine_mg} ${a('ملغ', 'mg')}</span>` : ''}${i.sodium_mg != null ? `<span class="dish-kcal">${a('صوديوم', 'Sodium')} ${i.sodium_mg} ${a('ملغ', 'mg')}</span>` : ''}${i.available ? '' : `<span class="dish-out">${esc(t('soldout'))}</span>`}</p>
      ${i.allergens?.length ? `<p class="dish-allergens"><span class="visually-hidden">${a('مسببات الحساسية:', 'Allergens:')}</span>${i.allergens.map((k) => `<span class="allergen">${esc(allergenName(k))}</span>`).join('')}</p>` : ''}
    </div>
    ${photo ? `<div class="dish-photo"><img src="${esc(i.image_url)}" alt="" loading="lazy" width="112" height="112">${canAdd ? addBtn(i, inCart) : ''}</div>` : canAdd ? `<div class="dish-photo no-photo">${addBtn(i, inCart)}</div>` : ''}
  </article>`;
}
const ALLERGEN = {
  gluten: ['غلوتين', 'Gluten'], crustaceans: ['قشريات', 'Crustaceans'], eggs: ['بيض', 'Eggs'], fish: ['سمك', 'Fish'],
  peanuts: ['فول سوداني', 'Peanuts'], soy: ['صويا', 'Soy'], milk: ['حليب', 'Milk'], tree_nuts: ['مكسرات', 'Tree nuts'],
  celery: ['كرفس', 'Celery'], mustard: ['خردل', 'Mustard'], sesame: ['سمسم', 'Sesame'], sulphites: ['كبريتيت', 'Sulphites'],
  lupin: ['ترمس', 'Lupin'], molluscs: ['رخويات', 'Molluscs'],
};
const allergenName = (k) => a(...(ALLERGEN[k] || [k, k]));
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

function render() {
  const items = data.items.filter((i) => !q || (i.name_ar + ' ' + i.name_en + ' ' + i.desc_ar + ' ' + i.desc_en).toLowerCase().includes(q));
  const cats = data.categories.filter((c) => items.some((i) => i.category_id === c.id));
  main.querySelector('#list').innerHTML = cats.length
    ? cats.map((c) => `<section class="menu-section" id="c-${esc(c.id)}" aria-labelledby="h-${esc(c.id)}"><h2 id="h-${esc(c.id)}">${esc(pick(c, 'name'))}</h2><div class="dish-list">${items.filter((i) => i.category_id === c.id).map(itemCard).join('')}</div></section>`).join('')
    : `<p class="empty">${esc(t('empty'))}</p>`;
  main.querySelectorAll('[data-add]').forEach((b) => (b.onclick = () => {
    const item = data.items.find((i) => i.id === b.dataset.add);
    if (item?.options?.length) return openOptions(item, b);
    addLine(lineKey(b.dataset.add));
  }));
  main.querySelector('#clear-q').hidden = !q;
  renderCart();
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
  dlg.setAttribute('aria-labelledby', 'opt-title');
  const groups = item.options;
  dlg.innerHTML = `<form method="dialog" class="stack">
    <header class="row-between"><h2 id="opt-title">${esc(pick(item, 'name'))}</h2><button class="btn ghost sm" value="cancel" type="submit" aria-label="${a('إغلاق', 'Close')}">✕</button></header>
    ${groups.map((g, gi) => `<fieldset class="opt-group"><legend>${esc(pick(g, 'name'))} <small class="muted">${g.required ? a('مطلوب', 'Required') : a('اختياري', 'Optional')}${g.multi ? ' · ' + a(`حتى ${g.max}`, `up to ${g.max}`) : ''}</small></legend>
      ${g.choices.map((ch, ci) => `<label class="opt-choice"><input type="${g.multi ? 'checkbox' : 'radio'}" name="g${gi}" value="${esc(ch.id)}" ${!g.multi && g.required && ci === 0 ? 'checked' : ''}><span>${esc(pick(ch, 'name'))}</span><b>${ch.price ? '+' + esc(money(ch.price)) : ''}</b></label>`).join('')}</fieldset>`).join('')}
    <p class="msg error" id="opt-error" hidden></p>
    <button class="btn" type="submit" value="add" id="opt-add"></button>
  </form>`;
  document.body.append(dlg);
  const form = dlg.querySelector('form');
  const chosen = () => [...form.querySelectorAll('input:checked')].map((x) => x.value);
  const update = () => {
    groups.forEach((g, gi) => {
      if (!g.multi) return;
      const boxes = [...form.querySelectorAll(`[name=g${gi}]`)];
      const n = boxes.filter((x) => x.checked).length;
      boxes.forEach((x) => (x.disabled = !x.checked && n >= g.max));
    });
    const line = lineOf(lineKey(item.id, chosen()));
    dlg.querySelector('#opt-add').textContent = `${a('أضف للطلب', 'Add to order')} · ${money(line ? line.unit : item.price)}`;
  };
  form.addEventListener('change', update);
  update();
  dlg.addEventListener('close', () => {
    if (dlg.returnValue === 'add') {
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
    opener?.focus();
  });
  dlg.showModal();
}

function saveCart() {
  try { sessionStorage.setItem('zm_cart_' + slug, JSON.stringify([...cart])); } catch {}
  orderKey = crypto.randomUUID();
}

function renderCart() {
  const box = main.querySelector('#cart');
  if (!settings.orders_enabled) { box.hidden = true; return; }
  const selected = [...cart].map(([key, quantity]) => ({ key, line: lineOf(key), quantity })).filter((x) => x.line && x.line.item.available);
  box.hidden = !selected.length;
  if (!selected.length) return;
  const total = selected.reduce((sum, x) => sum + x.line.unit * x.quantity, 0);
  box.innerHTML = `<h2>${a('طلبك', 'Your order')}</h2>${selected.map(({ key, line: { item: i, picked, unit }, quantity: n }) => `<div class="cart-row"><div><strong>${esc(pick(i, 'name'))}</strong>${picked.length ? `<p class="small muted">${picked.map((p) => esc(pick(p.ch, 'name'))).join('، ')}</p>` : ''}<p class="small muted">${esc(money(unit * n))}</p></div><div class="quantity-controls"><button class="btn ghost sm" type="button" data-minus="${esc(key)}" aria-label="${esc(a('تقليل', 'Decrease') + ' ' + pick(i, 'name'))}">−</button><span>${n}</span><button class="btn ghost sm" type="button" data-plus="${esc(key)}" aria-label="${esc(a('زيادة', 'Increase') + ' ' + pick(i, 'name'))}">+</button></div></div>`).join('')}
    <div class="cart-row"><strong>${a('الإجمالي', 'Total')}</strong><strong>${esc(money(total))}</strong></div>
    <label for="order-note">${a('ملاحظة للكاشير (اختياري)', 'Note for the cashier (optional)')}</label>
    <textarea id="order-note" rows="2" maxlength="300" placeholder="${a('مثال: بدون سكر', 'e.g. no sugar')}">${esc(orderNote)}</textarea>
    <p class="small muted">${a('الدفع عند الكاشير.', 'Pay at the counter.')}</p>
    <button type="button" class="btn" id="send-order">${a('إرسال الطلب للكاشير', 'Send order to cashier')}</button><div id="order-message" role="status"></div>`;
  box.querySelector('#order-note').oninput = (e) => { orderNote = e.target.value; orderKey = crypto.randomUUID(); };
  box.querySelectorAll('[data-minus]').forEach((b) => (b.onclick = () => { const n = cart.get(b.dataset.minus) || 0; if (n <= 1) cart.delete(b.dataset.minus); else cart.set(b.dataset.minus, n - 1); saveCart(); render(); }));
  box.querySelectorAll('[data-plus]').forEach((b) => (b.onclick = () => { cart.set(b.dataset.plus, Math.min(20, (cart.get(b.dataset.plus) || 0) + 1)); saveCart(); render(); }));
  box.querySelector('#send-order').addEventListener('click', async (e) => {
    e.target.disabled = true;
    try {
      const d = await api('/api/public/orders/' + slug, { method: 'POST', body: { idem_key: orderKey, note: orderNote.trim() || undefined, items: selected.map((x) => ({ item_id: x.line.item.id, quantity: x.quantity, options: x.line.opts })) } });
      orderToken = d.order.token;
      try { sessionStorage.setItem('zm_order_' + slug, orderToken); } catch {}
      cart.clear();
      orderNote = '';
      saveCart();
      render();
      pollOrder();
    } catch {
      box.querySelector('#order-message').innerHTML = `<p class="msg error">${a('تعذر إرسال الطلب. قد تغيّر السعر أو التوفر؛ حدّث المنيو ثم حاول مجددًا.', 'Could not send the order. Prices or availability may have changed; refresh the menu and retry.')}</p>`;
      e.target.disabled = false;
    }
  });
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
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      chips.forEach((c) => c.removeAttribute('aria-current'));
      const chip = chips.get(e.target.id);
      if (chip) {
        chip.setAttribute('aria-current', 'true');
        chip.scrollIntoView({ block: 'nearest', inline: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      }
    }
  }, { rootMargin: '-140px 0px -65% 0px' });
  main.querySelectorAll('.menu-section').forEach((s) => io.observe(s));
}

try {
  data = await api('/api/public/menu/' + slug);
  setBrandColor(data.branch.brand_color);
  const name = lang === 'ar' ? data.branch.org_name_ar : data.branch.org_name_en;
  try {
    const p = await api('/api/public/profile/' + data.branch.org_slug);
    profile = p.profile;
    applyTenantTheme(profile);
    settings = p.branches.find((b) => b.slug === slug)?.settings || settings;
    loyalty = p.loyalty;
  } catch {}
  topbar(document.getElementById('top'), t, { subtitle: name });
  document.title = `${name} · ${t('brand')}`;
  main.className = 'wrap menu-wrap';
  document.body.classList.add('menu-page');

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
        <div><h1 id="menu-title">${esc(name)}</h1><p class="menu-branch">${esc(pick(data.branch, 'name'))}</p></div>
      </div>
      ${profile && pick(profile, 'description') ? `<p class="menu-about">${esc(pick(profile, 'description'))}</p>` : ''}
      ${info ? `<div class="menu-info">${info}</div>` : ''}
    </section>
    ${bannerGallery(profile?.banners)}
    ${hasItems ? `
    <div class="menu-sticky">
      <div class="search-field"><span class="search-ico">${ICON.search}</span><label class="visually-hidden" for="q">${esc(t('search'))}</label><input id="q" type="search" placeholder="${esc(t('search'))}" autocomplete="off"><button id="clear-q" type="button" class="btn ghost sm" hidden>${esc(t('clear'))}</button></div>
      ${data.categories.length > 1 ? `<nav class="menu-cats" aria-label="${a('أقسام المنيو', 'Menu sections')}">${data.categories.filter((c) => data.items.some((i) => i.category_id === c.id)).map((c) => `<a href="#c-${esc(c.id)}">${esc(pick(c, 'name'))}</a>`).join('')}</nav>` : ''}
    </div>
    <div id="order-status" class="card" hidden></div>
    <div class="menu-layout"><div id="list"></div><aside class="card cart-panel" id="cart" hidden aria-label="${a('طلبك', 'Your order')}"></aside></div>`
    : `<div class="card menu-empty" role="status"><span class="empty-ico">${ICON.dish}</span><h2>${a('المنيو قيد التجهيز', 'The menu is being prepared')}</h2><p class="muted">${a('نجهّز أصنافنا الآن. تعرّف علينا وعلى فروعنا وطرق التواصل.', 'Items are on their way. Meanwhile, get to know us and our branches.')}</p><a class="btn" href="/p/${esc(data.branch.org_slug)}">${a('عن المنشأة', 'About us')}</a></div><div id="order-status" hidden></div><div id="list" hidden></div><div id="cart" hidden></div><button id="clear-q" hidden></button>`}
    <section class="menu-more" aria-label="${a('المزيد من المنشأة', 'More from the business')}">
      ${loyalty ? `<a class="more-card" href="/j/${esc(data.branch.org_slug)}"><span class="more-ico">${ICON.gift}</span><span><strong>${esc(t('loyalty'))}</strong><small>${a(`اجمع ${loyalty.stamps_required} أختام واحصل على ${esc(loyalty.reward_ar)}`, `Collect ${loyalty.stamps_required} stamps, get ${esc(loyalty.reward_en)}`)}</small></span></a>` : ''}
      ${hasItems ? `<a class="more-card" href="/p/${esc(data.branch.org_slug)}"><span class="more-ico">${ICON.store}</span><span><strong>${a('عن المنشأة', 'About the business')}</strong><small>${a('الفروع، الموقع وطرق التواصل', 'Branches, location and contact')}</small></span></a>` : ''}
    </section>
    <p class="powered small muted">${a('منيو رقمي من', 'Digital menu by')} <a href="/">${esc(t('brand'))}</a></p>`;

  if (hasItems) {
    main.querySelector('#q').oninput = (e) => { q = e.target.value.trim().toLowerCase(); render(); };
    main.querySelector('#clear-q').onclick = () => { q = ''; main.querySelector('#q').value = ''; render(); main.querySelector('#q').focus(); };
    render();
    watchSections();
  }
  if (orderToken) pollOrder();
} catch {
  topbar(document.getElementById('top'), t);
  main.className = 'wrap narrow';
  main.innerHTML = `<div class="card"><h1>${a('المنيو غير متاح', 'Menu unavailable')}</h1><p class="muted">${esc(t('notFound'))}</p><button class="btn" id="retry-menu" type="button">${a('إعادة المحاولة', 'Try again')}</button></div>`;
  main.querySelector('#retry-menu').onclick = () => location.reload();
}
