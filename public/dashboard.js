import {branchesView} from './branches.js';
import {canLeaveWorkspace} from './forms.js';
import {identityView,fontEditor} from './identity.js';
import {profileEditor} from './profile-editor.js';
import {overviewView,workspaceIcon} from './workspace.js';
import { ApiError, api, chime, esc, lang, makeT, money, pick, qrSvg, relTime, setBrandColor, topbar, unlockAudio, requestValue, announce, toggleLang } from './common.js';

import { imageField, wireImageFields } from './uploads.js';
import { addonsView } from './addons-store.js';
import { templatesView, domainView } from './studio-extras.js';
import { designStudio } from './design-studio.js';
import { couponsView } from './ordering-admin.js';
import { waitlistBoard } from './waitlist-board.js';
import { loyaltyAdmin } from './loyalty-admin.js';
import { importView, subscriptionView, integrationsView, devicesView, menuOrdersView, branchSettingsView, mfaView, dataControlsView, adminLegalView } from './dashboard-panels.js';

const t = makeT({
  ar: {
    admin: 'إدارة زيمارا', owner: 'إدارة المنشأة', branch: 'الكاشير',
    orgs: 'المنشآت', admins: 'المدراء', account: 'حسابي', branches: 'الفروع', menu: 'المنيو', loyalty: 'الولاء', stats: 'الإحصائيات', brandTab: 'الهوية',
    orders: 'الطلبات', display: 'شاشة العرض', availability: 'التوفر',
    nameAr: 'الاسم بالعربي', nameEn: 'الاسم بالإنجليزي', email: 'البريد', password: 'كلمة المرور (10 أحرف على الأقل)', name: 'الاسم',
    newOrg: 'منشأة جديدة', ownerAcc: 'حساب مالك المنشأة', create: 'إنشاء', active: 'مفعّلة', inactive: 'موقوفة', toggle: 'إيقاف/تفعيل',
    adminsMax: 'الحد الأقصى {m} حسابات إدارية ({n} مستخدم).', newAdmin: 'مدير جديد', disable: 'تعطيل', enable: 'تفعيل', resetPw: 'تغيير كلمة المرور',
    newBranch: 'فرع جديد', branchAcc: 'حساب الفرع', review: 'رابط تقييم Google (اختياري)', menuQr: 'QR المنيو', open: 'فتح',
    cats: 'الأقسام', items: 'الأصناف', newCat: 'قسم جديد', newItem: 'صنف جديد', price: 'السعر (ريال)', kcal: 'السعرات', image: 'رابط الصورة (https)', descAr: 'الوصف بالعربي', descEn: 'الوصف بالإنجليزي', category: 'القسم', hidden: 'مخفي', sort: 'الترتيب',
    stampsReq: 'عدد الأختام للمكافأة', rewardAr: 'المكافأة بالعربي', rewardEn: 'المكافأة بالإنجليزي', joinQr: 'QR الاشتراك في بطاقة الولاء', programOn: 'البرنامج مفعّل',
    color: 'لون الهوية', logo: 'رابط الشعار (https)',
    tickets: 'الطلبات', collected: 'المستلمة', avgPrep: 'متوسط التحضير', maxPrep: 'أطول تحضير', avgPickup: 'متوسط الاستلام بعد النداء', rating: 'التقييم', cards: 'البطاقات', stampsN: 'الأختام', redeemed: 'المكافآت', last30: 'آخر 30 يوم',
    number: 'رقم الفاتورة (اختياري)', newTicket: 'طلب جديد', scanMe: 'امسح الرمز لمتابعة طلبك', print: 'طباعة', preparing: 'قيد التحضير', ready: 'جاهز — بانتظار الاستلام',
    markReady: 'جاهز', realert: 'تنبيه عاجل', collect: 'تم الاستلام', cancelT: 'إلغاء', seen: 'شاف التنبيه', notSeen: 'ما شاف التنبيه بعد', linked: 'العميل مربوط', notLinked: 'لم يمسح الرمز', noPush: 'بدون إشعار', alertsN: 'تنبيهات: {n}',
    stale: 'تحدّث الطلب من جهاز ثاني، عرضنا آخر حالة.', inUse: 'هذا الرقم مستخدم لطلب مفتوح.', none: 'لا يوجد',
    readyNow: 'جاهز للاستلام', latest: 'آخر طلب', fullscreen: 'ملء الشاشة', soundOn: 'تفعيل صوت الشاشة',
    cardCode: 'رمز بطاقة العميل', find: 'بحث', scan: 'مسح بالكاميرا', addStamp: 'إضافة ختم', redeemBtn: 'استبدال المكافأة', stampsOf: '{n} أختام · المطلوب {m}', notEnough: 'الأختام غير كافية.', cardNF: 'البطاقة غير موجودة.',
    available: 'متوفر', soldout: 'نفد', current: 'كلمة المرور الحالية', next: 'كلمة المرور الجديدة', changed: 'تم تغيير كلمة المرور',
    pushOff: 'التنبيه يصل للعميل بالصوت والاهتزاز على صفحة طلبه. اطلب من العميل إبقاء الصفحة مفتوحة.',
    walletSoon: 'Apple Wallet وGoogle Wallet غير مفعّلتين. تحتاجان إصدار البطاقات والشهادات واختبار الأجهزة الفعلية.',
  },
  en: {
    admin: 'ZIMARA admin', owner: 'Business admin', branch: 'Cashier',
    orgs: 'Businesses', admins: 'Admins', account: 'My account', branches: 'Branches', menu: 'Menu', loyalty: 'Loyalty', stats: 'Stats', brandTab: 'Branding',
    orders: 'Orders', display: 'Display', availability: 'Availability',
    nameAr: 'Arabic name', nameEn: 'English name', email: 'Email', password: 'Password (10+ characters)', name: 'Name',
    newOrg: 'New business', ownerAcc: 'Business owner account', create: 'Create', active: 'Active', inactive: 'Suspended', toggle: 'Suspend/resume',
    adminsMax: 'Up to {m} admin accounts ({n} used).', newAdmin: 'New admin', disable: 'Disable', enable: 'Enable', resetPw: 'Change password',
    newBranch: 'New branch', branchAcc: 'Branch account', review: 'Google review link (optional)', menuQr: 'Menu QR', open: 'Open',
    cats: 'Categories', items: 'Items', newCat: 'New category', newItem: 'New item', price: 'Price (SAR)', kcal: 'Calories', image: 'Image URL (https)', descAr: 'Arabic description', descEn: 'English description', category: 'Category', hidden: 'Hidden', sort: 'Order',
    stampsReq: 'Stamps per reward', rewardAr: 'Reward (Arabic)', rewardEn: 'Reward (English)', joinQr: 'Loyalty sign-up QR', programOn: 'Program active',
    color: 'Brand color', logo: 'Logo URL (https)',
    tickets: 'Orders', collected: 'Collected', avgPrep: 'Avg. prep', maxPrep: 'Longest prep', avgPickup: 'Avg. pickup after call', rating: 'Rating', cards: 'Cards', stampsN: 'Stamps', redeemed: 'Rewards', last30: 'Last 30 days',
    number: 'Invoice number (optional)', newTicket: 'New order', scanMe: 'Scan to follow your order', print: 'Print', preparing: 'Preparing', ready: 'Ready — awaiting pickup',
    markReady: 'Ready', realert: 'Urgent alert', collect: 'Collected', cancelT: 'Cancel', seen: 'Saw the alert', notSeen: 'Not seen yet', linked: 'Customer linked', notLinked: 'Not scanned', noPush: 'No push', alertsN: 'Alerts: {n}',
    stale: 'Updated on another device; showing the latest state.', inUse: 'This number is already open.', none: 'None',
    readyNow: 'Ready for pickup', latest: 'Latest order', fullscreen: 'Full screen', soundOn: 'Enable display sound',
    cardCode: 'Customer card code', find: 'Find', scan: 'Scan with camera', addStamp: 'Add stamp', redeemBtn: 'Redeem reward', stampsOf: '{n} stamps · {m} needed', notEnough: 'Not enough stamps.', cardNF: 'Card not found.',
    available: 'Available', soldout: 'Sold out', current: 'Current password', next: 'New password', changed: 'Password changed',
    pushOff: 'Customers are alerted by sound and vibration on their order page. Ask them to keep it open.',
    walletSoon: 'Apple Wallet and Google Wallet are not enabled. Pass issuance, credentials and real-device tests are still required.',
  },
});

const main = document.getElementById('main');
const top = document.getElementById('top');
let me;

const fd = (form) => Object.fromEntries(new FormData(form).entries());
const field = (name, label, attrs = '', prefix = 'f') => `<div><label for="${prefix}-${name}">${esc(label)}</label><input id="${prefix}-${name}" name="${name}" ${attrs}></div>`;
const errMsg=e=>e?.status===401?(lang==='ar'?'انتهت الجلسة. سجّل الدخول مجددًا.':'Your session expired. Sign in again.'):e?.status===403?(lang==='ar'?'قد لا تسمح باقتك أو صلاحيتك بهذا الإجراء.':'Your plan or role may not permit this action.'):t('error');
function flash(el, text, error = false) {
  el.innerHTML = `<p class="msg ${error ? 'error' : ''}" role="status">${esc(text)}</p>`;
}
const uuid = () => crypto.randomUUID();

function tabs(list, onPick) {
  addEventListener('hashchange', () => { const k = location.hash.slice(1); if (k !== current && list.some(([x]) => x === k)) show(k); });
  const nav = document.createElement('nav');
  nav.className = 'tabs';
  nav.setAttribute('role', 'tablist');
  nav.setAttribute('aria-label', lang==='ar'?'أقسام لوحة التحكم':'Workspace sections');
  const vertical=matchMedia('(min-width:850px)');
  const orient=()=>{nav.setAttribute('aria-orientation',vertical.matches?'vertical':'horizontal');requestAnimationFrame(()=>nav.querySelector('[aria-selected=true]')?.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'}));};orient();vertical.addEventListener('change',orient);
  const body = document.createElement('div');
  body.className = 'wrap';
  let current = list[0][0];
  try { current = sessionStorage.getItem('zm_tab_' + me.user.role) || current; } catch {}
  // Returning from the payment page, or a deep link like /app#subscription, opens that tab.
  const wanted = new URLSearchParams(location.search).has('billing') ? 'subscription' : location.hash.slice(1);
  if (wanted && list.some(([k]) => k === wanted)) current = wanted;
  if (!list.some(([k]) => k === current)) current = list[0][0];
  let navigating=false;
  async function show(k,force=false) {
    if(navigating||(!force&&k===current&&body.firstChild))return;
    navigating=true;
    if(!force&&!await canLeaveWorkspace()){history.replaceState(null,'',location.pathname+location.search+'#'+current);navigating=false;return;}
    current = k;
    try { sessionStorage.setItem('zm_tab_' + me.user.role, k); } catch {}
    if (location.hash.slice(1) !== k) history.replaceState(null, '', location.pathname + location.search + '#' + k);
    nav.querySelectorAll('button').forEach((b) => { b.setAttribute('aria-selected', String(b.dataset.k === k)); b.tabIndex = b.dataset.k === k ? 0 : -1; });
    const panel = document.createElement('section');
    panel.setAttribute('role', 'tabpanel');
    panel.id = 'panel-' + k;
    panel.innerHTML = `<p class="empty">${esc(t('loading'))}</p>`;
    body.replaceChildren(panel);
    panel.setAttribute('aria-labelledby', 'tab-' + k);
    onPick(k, panel);
    document.title=list.find(([key])=>key===k)[1]+' · '+t('brand');
    nav.querySelector('[aria-selected=true]')?.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
    navigating=false;
  }
  for (const [k, label] of list) {
    const b = document.createElement('button');
    b.type = 'button';
    b.role = 'tab';
    b.dataset.k = k;
    b.id = 'tab-' + k;
    b.setAttribute('aria-controls', 'panel-' + k);
    b.innerHTML = workspaceIcon(k) + `<span>${esc(label)}</span>`;
    b.onclick = () => show(k);
    b.addEventListener('keydown', (e) => {
      const buttons = [...nav.querySelectorAll('button')];
      let index = buttons.indexOf(b);
      if (e.key === 'ArrowDown' || e.key === (lang==='ar'?'ArrowLeft':'ArrowRight')) index = (index + 1) % buttons.length;
      else if (e.key === 'ArrowUp' || e.key === (lang==='ar'?'ArrowRight':'ArrowLeft')) index = (index - 1 + buttons.length) % buttons.length;
      else if (e.key === 'Home') index = 0;
      else if (e.key === 'End') index = buttons.length - 1;
      else return;
      e.preventDefault(); buttons[index].focus(); buttons[index].click();
    });
    nav.append(b);
  }
  main.replaceChildren(nav, body);
  show(current,true);
}

// ---------- shared: my account ----------
function accountView(el) {
  el.innerHTML = `<form novalidate class="card stack narrow" id="pw"><h2>${esc(t('account'))}</h2><p class="muted">${esc(me.user.email)}</p>
    ${field('current', t('current'), 'type="password" autocomplete="current-password" required')}
    ${field('next', t('next'), 'type="password" autocomplete="new-password" minlength="10" required')}
    <div id="m"></div><button class="btn">${esc(t('save'))}</button></form><div class="card narrow" id="account-security"></div>${me.user.role === 'owner' ? '<div class="card" id="account-data"></div>' : ''}`;
  if (me.user.role === 'owner') dataControlsView(el.querySelector('#account-data')).catch(e => flash(el.querySelector('#account-data'), errMsg(e), true));
  mfaView(el.querySelector('#account-security')).catch(e => flash(el.querySelector('#account-security'), errMsg(e), true));
  el.querySelector('#pw').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api('/api/me/password', { method: 'POST', body: fd(e.target) });
      flash(el.querySelector('#m'), t('changed'));
      e.target.reset();
    } catch (err) {
      flash(el.querySelector('#m'), errMsg(err), true);
    }
  };
}

// ---------- platform admin ----------
async function adminOrgs(el) {
  const { orgs } = await api('/api/admin/orgs');
  el.innerHTML = `
    <form novalidate class="card stack" id="new"><h2>${esc(t('newOrg'))}</h2>
      <div class="row">${field('name_ar', t('nameAr'), 'required')}${field('name_en', t('nameEn'), 'required')}</div>
      <h3>${esc(t('ownerAcc'))}</h3>
      <div class="row">${field('o_name', t('name'), 'required')}${field('o_email', t('email'), 'type="email" required')}${field('o_password', t('password'), 'type="password" minlength="10" required autocomplete="new-password"')}</div>
      <div id="m"></div><button class="btn">${esc(t('create'))}</button></form>
    <div class="card"><h2>${esc(t('orgs'))}</h2>${orgs.length ? `<table><tr><th>${esc(t('name'))}</th><th>${esc(t('branches'))}</th><th>${esc(t('email'))}</th><th></th></tr>${orgs
      .map((o) => `<tr><td>${esc(pick(o, 'name'))}<br><span class="small muted">${esc(o.slug)}</span></td><td>${o.branches}</td><td>${esc(o.owner_email || '')}</td>
        <td><span class="pill">${esc(t(o.active ? 'active' : 'inactive'))}</span> <button class="btn ghost sm" data-org="${esc(o.id)}" data-active="${o.active}" type="button">${esc(t('toggle'))}</button></td></tr>`)
      .join('')}</table>` : `<p class="empty">${esc(t('none'))}</p>`}</div>`;
  el.querySelector('#new').onsubmit = async (e) => {
    e.preventDefault();
    const v = fd(e.target);
    try {
      await api('/api/admin/orgs', { method: 'POST', body: { name_ar: v.name_ar, name_en: v.name_en, owner: { name: v.o_name, email: v.o_email, password: v.o_password } } });
      adminOrgs(el);
    } catch (err) {
      flash(el.querySelector('#m'), errMsg(err), true);
    }
  };
  el.querySelectorAll('[data-org]').forEach((b) => (b.onclick = async () => {
    await api('/api/admin/orgs/' + b.dataset.org, { method: 'PATCH', body: { active: b.dataset.active !== '1' } });
    adminOrgs(el);
  }));
}

async function adminAdmins(el) {
  const { admins, max } = await api('/api/admin/admins');
  el.innerHTML = `
    <div class="card"><h2>${esc(t('admins'))}</h2><p class="muted">${esc(t('adminsMax', { m: max, n: admins.length }))}</p>
      <table>${admins.map((a) => `<tr><td>${esc(a.name)}</td><td>${esc(a.email)}</td><td>${a.id === me.user.id ? '' : `<button class="btn ghost sm" data-u="${esc(a.id)}" data-d="${a.disabled}" type="button">${esc(t(a.disabled ? 'enable' : 'disable'))}</button>`}</td></tr>`).join('')}</table></div>
    ${admins.length < max ? `<form novalidate class="card stack" id="new"><h2>${esc(t('newAdmin'))}</h2><div class="row">${field('name', t('name'), 'required')}${field('email', t('email'), 'type="email" required')}${field('password', t('password'), 'type="password" minlength="10" required autocomplete="new-password"')}</div><div id="m"></div><button class="btn">${esc(t('create'))}</button></form>` : ''}`;
  el.querySelector('#new')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/api/admin/admins', { method: 'POST', body: fd(e.target) });
      adminAdmins(el);
    } catch (err) {
      flash(el.querySelector('#m'), errMsg(err), true);
    }
  });
  el.querySelectorAll('[data-u]').forEach((b) => (b.onclick = async () => {
    await api('/api/admin/users/' + b.dataset.u, { method: 'PATCH', body: { disabled: b.dataset.d !== '1' } });
    adminAdmins(el);
  }));
}

// ---------- owner ----------
function qrBlock(link, title) {
  return `<div class="stack" style="text-align:center"><div class="qr">${qrSvg(link, 6)}</div><p class="small"><a href="${esc(link)}" target="_blank" rel="noopener">${esc(title)}</a></p></div>`;
}

const ownerBranches=el=>branchesView(el,me);

const ICON = {
  edit: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m14 6 4 4"/></svg>',
  trash: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  eye: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  plus: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  menu: '<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>',
};
const A = (ar, en) => (lang === 'ar' ? ar : en);

const BADGES = [
  ['new', 'جديد', 'New'], ['popular', 'الأكثر طلبًا', 'Popular'], ['chef', 'اختيار الشيف', "Chef's pick"], ['spicy', 'حار', 'Spicy'],
  ['vegan', 'نباتي صرف', 'Vegan'], ['vegetarian', 'نباتي', 'Vegetarian'], ['healthy', 'صحي', 'Healthy'], ['limited', 'لفترة محدودة', 'Limited time'],
];
const ALLERGENS = [
  ['gluten', 'غلوتين (قمح)', 'Gluten'], ['crustaceans', 'قشريات', 'Crustaceans'], ['eggs', 'بيض', 'Eggs'], ['fish', 'سمك', 'Fish'],
  ['peanuts', 'فول سوداني', 'Peanuts'], ['soy', 'صويا', 'Soy'], ['milk', 'حليب', 'Milk'], ['tree_nuts', 'مكسرات', 'Tree nuts'],
  ['celery', 'كرفس', 'Celery'], ['mustard', 'خردل', 'Mustard'], ['sesame', 'سمسم', 'Sesame'], ['sulphites', 'كبريتيت', 'Sulphites'],
  ['lupin', 'ترمس', 'Lupin'], ['molluscs', 'رخويات', 'Molluscs'],
];
let groupSerial = 0;
function groupEditor(g = {}) {
  const n = ++groupSerial;
  const kind = g.multi ? 'multi' : g.required === false ? 'one' : 'required';
  const lines = (g.choices || []).map((c) => [c.name_ar, c.name_en, c.price ? c.price / 100 : 0].join(' | ')).join('\n');
  const ids = esc(JSON.stringify(Object.fromEntries((g.choices || []).map((c) => [c.name_ar, c.id]))));
  return `<div class="option-group-editor" data-group-id="${esc(g.id || '')}" data-choice-ids="${ids}">
    <div class="row"><div><label for="og${n}-ar">${A('اسم المجموعة', 'Group name')}</label><input id="og${n}-ar" data-g="name_ar" maxlength="60" value="${esc(g.name_ar || '')}" placeholder="${A('الحجم', 'Size')}"></div>
    <div><label for="og${n}-en">${A('بالإنجليزي', 'In English')}</label><input id="og${n}-en" data-g="name_en" maxlength="60" dir="ltr" value="${esc(g.name_en || '')}" placeholder="Size"></div>
    <div><label for="og${n}-kind">${A('طريقة الاختيار', 'Selection')}</label><select id="og${n}-kind" data-g="kind"><option value="required" ${kind === 'required' ? 'selected' : ''}>${A('اختيار واحد مطلوب', 'One, required')}</option><option value="one" ${kind === 'one' ? 'selected' : ''}>${A('اختيار واحد اختياري', 'One, optional')}</option><option value="multi" ${kind === 'multi' ? 'selected' : ''}>${A('أكثر من اختيار', 'Several')}</option></select></div>
    <div><label for="og${n}-max">${A('الحد الأعلى', 'Max picks')}</label><input id="og${n}-max" data-g="max" type="number" min="1" max="20" value="${g.max || ''}"></div></div>
    <label for="og${n}-choices">${A('الخيارات (سطر لكل خيار)', 'Choices (one per line)')}</label>
    <textarea id="og${n}-choices" data-g="choices" rows="3" placeholder="${A('صغير | Small | 0', 'صغير | Small | 0')}">${esc(lines)}</textarea>
    <button class="btn ghost sm" type="button" data-del-group>${A('حذف المجموعة', 'Remove group')}</button></div>`;
}
function readGroups(form) {
  return [...form.querySelectorAll('.option-group-editor')].map((box) => {
    const get = (k) => box.querySelector(`[data-g="${k}"]`).value.trim();
    const kind = get('kind');
    let known = {};
    try { known = JSON.parse(box.dataset.choiceIds || '{}'); } catch {}
    const choices = get('choices').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
      const [ar, en, price] = l.split('|').map((x) => x.trim());
      const c = { name_ar: ar, name_en: en || ar, price: Math.round(Number(String(price || '0').replace(/[^\d.]/g, '') || 0) * 100) };
      if (known[ar]) c.id = known[ar];
      return c;
    });
    const g = { name_ar: get('name_ar'), name_en: get('name_en') || get('name_ar'), required: kind === 'required', multi: kind === 'multi', choices };
    if (box.dataset.groupId) g.id = box.dataset.groupId;
    if (kind === 'multi' && get('max')) g.max = Math.min(Number(get('max')), choices.length);
    return g;
  }).filter((g) => g.name_ar && g.choices.length);
}

async function ownerMenu(el) {
  const [{ categories, items }, { branches }] = await Promise.all([api('/api/owner/menu'), api('/api/owner/branches')]);
  const branch = branches[0];
  const catOpts = (sel) => categories.map((c) => `<option value="${esc(c.id)}" ${c.id === sel ? 'selected' : ''}>${esc(pick(c, 'name'))}</option>`).join('');
  const itemForm = (i = {}, p = 'f') => `
    <div class="row"><div><label for="${p}-category_id">${esc(t('category'))}</label><select id="${p}-category_id" name="category_id" required>${catOpts(i.category_id)}</select></div>
      ${field('price', t('price'), `type="number" min="0" step="0.01" inputmode="decimal" required value="${i.price != null ? i.price / 100 : ''}"`, p)}${field('calories', t('kcal'), `type="number" min="0" inputmode="numeric" value="${i.calories ?? ''}"`, p)}</div>
    <div class="row">${field('name_ar', t('nameAr'), `required value="${esc(i.name_ar || '')}"`, p)}${field('name_en', t('nameEn'), `required value="${esc(i.name_en || '')}"`, p)}</div>
    <div class="row">${field('desc_ar', t('descAr'), `value="${esc(i.desc_ar || '')}"`, p)}${field('desc_en', t('descEn'), `value="${esc(i.desc_en || '')}"`, p)}</div>
    ${imageField('image_url', A('صورة الصنف', 'Item photo'), i.image_url || '', p)}
    <fieldset class="opt-group"><legend>${A('شارات تظهر على الصنف (حتى 3)', 'Badges on the dish (up to 3)')}</legend><div class="allergen-grid">${BADGES.map(([k, ar, en]) => `<label class="check"><input type="checkbox" data-badge value="${k}" ${i.badges?.includes(k) ? 'checked' : ''}> ${esc(A(ar, en))}</label>`).join('')}</div></fieldset>
    <details class="item-more"${i.compare_price || i.allergens?.length || i.options?.length || i.caffeine_mg != null || i.sodium_mg != null ? ' open' : ''}><summary>${A('عرض وأحجام ومعلومات غذائية', 'Offer, sizes and nutrition')}</summary><div class="stack">
      <div class="row">${field('compare_price', A('السعر قبل الخصم (اختياري)', 'Price before discount (optional)'), `type="number" min="0" step="0.01" inputmode="decimal" value="${i.compare_price != null ? i.compare_price / 100 : ''}"`, p)}${field('caffeine_mg', A('الكافيين (ملغ)', 'Caffeine (mg)'), `type="number" min="0" inputmode="numeric" value="${i.caffeine_mg ?? ''}"`, p)}${field('sodium_mg', A('الصوديوم (ملغ)', 'Sodium (mg)'), `type="number" min="0" inputmode="numeric" value="${i.sodium_mg ?? ''}"`, p)}</div>
      <fieldset class="opt-group"><legend>${A('مسببات الحساسية', 'Allergens')}</legend><div class="allergen-grid">${ALLERGENS.map(([k, ar, en]) => `<label class="check"><input type="checkbox" data-allergen value="${k}" ${i.allergens?.includes(k) ? 'checked' : ''}> ${esc(A(ar, en))}</label>`).join('')}</div></fieldset>
      <div class="stack" data-option-groups>${(i.options || []).map(groupEditor).join('')}</div>
      <button class="btn ghost sm" type="button" data-add-group>${A('+ إضافة أحجام أو إضافات', '+ Add sizes or extras')}</button>
      <p class="small muted">${A('مثال: مجموعة "الحجم" مطلوبة باختيار واحد، ومجموعة "إضافات" اختيارية بأكثر من اختيار. اكتب كل خيار في سطر: الاسم بالعربي | بالإنجليزي | السعر الإضافي.', 'Example: a required single-choice "Size" group and an optional multi-choice "Extras" group. One choice per line: Arabic | English | extra price.')}</p>
    </div></details>
    <div class="row form-foot">${field('sort', t('sort'), `type="number" min="0" value="${i.sort ?? 0}"`, p)}<label class="check"><input type="checkbox" name="hidden" ${i.active === 0 ? 'checked' : ''}> ${esc(A('إخفاء من المنيو', 'Hide from menu'))}</label></div>`;
  const toItem = (v, form) => ({
    category_id: v.category_id, name_ar: v.name_ar, name_en: v.name_en, desc_ar: v.desc_ar, desc_en: v.desc_en,
    price: Math.round(Number(v.price) * 100), calories: v.calories === '' ? null : Number(v.calories), image_url: v.image_url.trim() || null,
    compare_price: v.compare_price ? Math.round(Number(v.compare_price) * 100) : null,
    caffeine_mg: v.caffeine_mg === '' || v.caffeine_mg == null ? null : Number(v.caffeine_mg),
    sodium_mg: v.sodium_mg === '' || v.sodium_mg == null ? null : Number(v.sodium_mg),
    allergens: [...form.querySelectorAll('[data-allergen]:checked')].map((x) => x.value),
    badges: [...form.querySelectorAll('[data-badge]:checked')].map((x) => x.value).slice(0, 3),
    options: readGroups(form),
    sort: Number(v.sort || 0), active: !v.hidden,
  });
  el.addEventListener('click', (e) => {
    const add = e.target.closest('[data-add-group]');
    if (add) { add.previousElementSibling.insertAdjacentHTML('beforeend', groupEditor()); return; }
    const del = e.target.closest('[data-del-group]');
    if (del) del.closest('.option-group-editor').remove();
  });
  const intro = `<div class="section-intro row-between"><div><h2>${esc(t('menu'))}</h2><p>${A('أقسامك وأصنافك كما يراها العميل. أي تعديل يظهر فورًا في كل الفروع.', 'Your sections and items as customers see them. Changes appear instantly in every branch.')}</p></div>${branch ? `<a class="btn ghost sm" href="/m/${esc(branch.slug)}" target="_blank" rel="noopener">${A('معاينة المنيو', 'Preview menu')} ↗</a>` : ''}</div>`;

  if (!items.length && !categories.length) {
    el.innerHTML = `${intro}<div class="card empty-hero"><span class="empty-ico">${ICON.menu}</span><h3>${A('منيوك فاضي حاليًا', 'Your menu is empty')}</h3>
      <p class="muted">${A('ابدأ بمنيو نموذجي جاهز فيه أقسام وأصناف بالأسعار والسعرات، ثم عدّله أو احذف ما لا تحتاجه. أو أضف أول قسم بنفسك.', 'Start from a ready sample with sections, prices and calories, then edit or delete what you don’t need. Or add your first section yourself.')}</p>
      <div class="row center"><button class="btn" type="button" id="sample">${A('أضف منيو نموذجي', 'Add a sample menu')}</button><a class="btn ghost" href="#import">${A('استيراد من ملف', 'Import from a file')}</a></div><div id="sm" role="status"></div></div>
      <form novalidate class="card stack narrow" id="cat"><h3>${A('أو أضف أول قسم', 'Or add your first section')}</h3><div class="row">${field('c_ar', t('nameAr'), 'required placeholder="مثال: القهوة الساخنة"')}${field('c_en', t('nameEn'), 'required placeholder="Hot coffee"')}</div><button class="btn ghost" type="submit">${ICON.plus}${esc(t('newCat'))}</button></form>`;
  } else {
    el.innerHTML = `${intro}
      <div class="menu-toolbar">
        <details class="card add-card" ${categories.length && !items.length ? 'open' : ''}><summary class="btn">${ICON.plus}${esc(t('newItem'))}</summary>
          ${categories.length ? `<form novalidate class="stack" id="item">${itemForm()}<div id="m"></div><button class="btn" type="submit">${esc(t('add'))}</button></form>` : `<p class="muted">${A('أضف قسمًا أولًا.', 'Add a section first.')}</p>`}</details>
        <details class="card add-card"><summary class="btn ghost">${ICON.plus}${esc(t('newCat'))}</summary>
          <form novalidate class="row" id="cat">${field('c_ar', t('nameAr'), 'required')}${field('c_en', t('nameEn'), 'required')}<button class="btn" type="submit">${esc(t('add'))}</button></form></details>
      </div>
      ${categories.map((c, ci) => {
        const list = items.filter((i) => i.category_id === c.id);
        return `<section class="card menu-admin-cat" aria-labelledby="cat-${esc(c.id)}">
          <header class="cat-head"><div><h3 id="cat-${esc(c.id)}">${esc(pick(c, 'name'))}</h3><p class="small muted">${esc(lang === 'ar' ? c.name_en : c.name_ar)} · ${list.length} ${A('صنف', 'items')}${c.active ? '' : ` · <span class="pill">${esc(t('hidden'))}</span>`}</p></div>
            <div class="icon-actions">
              <button type="button" class="btn ghost sm" data-cat-toggle="${esc(c.id)}">${ICON.eye}<span>${c.active ? A('إخفاء', 'Hide') : A('إظهار', 'Show')}</span></button>
              <button type="button" class="btn ghost sm" data-cat-edit="${esc(c.id)}">${ICON.edit}<span>${A('تعديل', 'Edit')}</span></button>
              <button type="button" class="btn ghost sm danger-text" data-cat-del="${esc(c.id)}" ${list.length ? `aria-disabled="true" title="${esc(A('احذف أصناف القسم أو انقلها أولًا', 'Move or delete its items first'))}"` : ''}>${ICON.trash}<span>${A('حذف', 'Delete')}</span></button>
            </div></header>
          <form novalidate class="row cat-edit" data-cat-form="${esc(c.id)}" hidden>${field('name_ar', t('nameAr'), `required value="${esc(c.name_ar)}"`, 'c' + ci)}${field('name_en', t('nameEn'), `required value="${esc(c.name_en)}"`, 'c' + ci)}${field('sort', t('sort'), `type="number" min="0" value="${c.sort ?? ci}"`, 'c' + ci)}<button class="btn sm" type="submit">${esc(t('save'))}</button></form>
          <ul class="admin-items" role="list">${list.map((i) => {
            const n = items.indexOf(i);
            return `<li class="admin-item ${i.active ? '' : 'is-hidden'}">
              <div class="admin-item-row">
                ${i.image_url ? `<img src="${esc(i.image_url)}" alt="" width="56" height="56" loading="lazy">` : `<span class="thumb-empty" aria-hidden="true"></span>`}
                <div class="admin-item-text"><strong>${esc(pick(i, 'name'))}</strong><span class="small muted">${esc(pick(i, 'desc') || A('بدون وصف', 'No description'))}</span></div>
                <span class="admin-price">${esc(money(i.price))}</span>
                ${i.active ? '' : `<span class="pill">${esc(t('hidden'))}</span>`}
                ${i.is_sample ? `<span class="pill pending" title="${esc(A('يظهر للزوار بعد ما تعدّله', 'Shown to guests once you edit it'))}">${esc(A('تجريبي · مخفي', 'Sample · hidden'))}</span>` : ''}
                <div class="icon-actions">
                  <button type="button" class="btn ghost sm icon-only" data-item-edit="${n}" aria-label="${esc(A('تعديل', 'Edit') + ' ' + pick(i, 'name'))}" aria-expanded="false">${ICON.edit}</button>
                  <button type="button" class="btn ghost sm icon-only danger-text" data-item-del="${esc(i.id)}" data-name="${esc(pick(i, 'name'))}" aria-label="${esc(A('حذف', 'Delete') + ' ' + pick(i, 'name'))}">${ICON.trash}</button>
                </div>
              </div>
              <form novalidate class="stack item-edit" data-item="${esc(i.id)}" data-n="${n}" hidden>${itemForm(i, 'i' + n)}<div class="row"><button class="btn sm" type="submit">${esc(t('save'))}</button><button class="btn ghost sm" type="button" data-item-cancel="${n}">${esc(t('cancel'))}</button></div></form>
            </li>`;
          }).join('') || `<li class="muted small admin-empty">${A('لا توجد أصناف في هذا القسم بعد.', 'No items in this section yet.')}</li>`}</ul>
        </section>`;
      }).join('')}`;
  }
  wireImageFields(el);
  const reload = () => ownerMenu(el);
  el.querySelector('#sample')?.addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    try { await api('/api/owner/menu/sample', { method: 'POST', body: {} }); announce(A('أضفنا المنيو النموذجي. عدّله كما تحب.', 'Sample menu added. Edit it as you like.')); reload(); }
    catch (err) { flash(el.querySelector('#sm'), err.message === 'plan_items_limit' ? A('باقتك الحالية لا تسمح بعدد الأصناف هذا.', 'Your plan does not allow this many items.') : errMsg(err), true); e.currentTarget.disabled = false; }
  });
  el.querySelector('#cat').onsubmit = async (e) => {
    e.preventDefault();
    const v = fd(e.target);
    try { await api('/api/owner/categories', { method: 'POST', body: { name_ar: v.c_ar, name_en: v.c_en, sort: categories.length } }); announce(t('saved')); reload(); }
    catch (error) { announce(errMsg(error), true); }
  };
  el.querySelector('#item')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('/api/owner/items', { method: 'POST', body: toItem(fd(e.target), e.target) }); announce(A('أضيف الصنف.', 'Item added.')); reload(); }
    catch (err) { flash(el.querySelector('#m'), errMsg(err), true); }
  });
  const catBy = (id) => categories.find((c) => c.id === id);
  el.querySelectorAll('[data-cat-toggle]').forEach((b) => (b.onclick = async () => {
    const c = catBy(b.dataset.catToggle);
    b.disabled = true;
    try { await api('/api/owner/categories/' + c.id, { method: 'PATCH', body: { name_ar: c.name_ar, name_en: c.name_en, sort: c.sort ?? 0, active: !c.active } }); reload(); }
    catch (err) { announce(errMsg(err), true); b.disabled = false; }
  }));
  el.querySelectorAll('[data-cat-edit]').forEach((b) => (b.onclick = () => { const f = el.querySelector(`[data-cat-form="${b.dataset.catEdit}"]`); f.hidden = !f.hidden; if (!f.hidden) f.querySelector('input').focus(); }));
  el.querySelectorAll('[data-cat-form]').forEach((f) => (f.onsubmit = async (e) => {
    e.preventDefault();
    const c = catBy(f.dataset.catForm), v = fd(f);
    try { await api('/api/owner/categories/' + c.id, { method: 'PATCH', body: { name_ar: v.name_ar, name_en: v.name_en, sort: Number(v.sort || 0), active: Boolean(c.active) } }); announce(t('saved')); reload(); }
    catch (err) { announce(errMsg(err), true); }
  }));
  el.querySelectorAll('[data-cat-del]').forEach((b) => (b.onclick = async () => {
    if (b.getAttribute('aria-disabled') === 'true') { announce(A('القسم فيه أصناف. احذفها أو انقلها لقسم آخر أولًا.', 'This section has items. Move or delete them first.'), true); return; }
    if (!confirm(A('حذف هذا القسم؟', 'Delete this section?'))) return;
    try { await api('/api/owner/categories/' + b.dataset.catDel, { method: 'DELETE', body: {} }); announce(A('حُذف القسم.', 'Section deleted.')); reload(); }
    catch (err) { announce(errMsg(err), true); }
  }));
  el.querySelectorAll('[data-item-edit]').forEach((b) => (b.onclick = () => {
    const f = el.querySelector(`form[data-n="${b.dataset.itemEdit}"]`);
    f.hidden = !f.hidden; b.setAttribute('aria-expanded', String(!f.hidden));
    if (!f.hidden) f.querySelector('input[name=name_ar]').focus();
  }));
  el.querySelectorAll('[data-item-cancel]').forEach((b) => (b.onclick = () => { el.querySelector(`form[data-n="${b.dataset.itemCancel}"]`).hidden = true; }));
  el.querySelectorAll('form[data-item]').forEach((f) => (f.onsubmit = async (e) => {
    e.preventDefault();
    try { await api('/api/owner/items/' + f.dataset.item, { method: 'PATCH', body: toItem(fd(f), f) }); announce(t('saved')); reload(); }
    catch (err) { announce(errMsg(err), true); }
  }));
  el.querySelectorAll('[data-item-del]').forEach((b) => (b.onclick = async () => {
    if (!confirm(A(`حذف «${b.dataset.name}» نهائيًا من المنيو؟`, `Delete “${b.dataset.name}” from the menu?`))) return;
    b.disabled = true;
    try { await api('/api/owner/items/' + b.dataset.itemDel, { method: 'DELETE', body: {} }); announce(A('حُذف الصنف.', 'Item deleted.')); reload(); }
    catch (err) { announce(errMsg(err), true); b.disabled = false; }
  }));
}

const ownerOverview=el=>overviewView(el,me);

async function ownerStats(el) {
  const s = await api('/api/owner/stats');
  const min = (ms) => (ms == null ? '—' : relTime(ms));
  const sum = (k) => s.branches.reduce((n, b) => n + (b[k] || 0), 0);
  const prep = s.branches.filter((b) => b.avg_prep_ms != null);
  const tiles = [
    [t('tickets'), sum('tickets')], [t('collected'), sum('collected')],
    [t('avgPrep'), prep.length ? min(prep.reduce((n, b) => n + b.avg_prep_ms, 0) / prep.length) : '—'], [t('cards'), s.loyalty.cards],
  ];
  el.innerHTML = `<div class="section-intro"><h2>${esc(t('stats'))}</h2><p>${esc(t('last30'))}</p></div>
    <div class="kpi-row">${tiles.map(([l, v]) => `<div class="card kpi"><span class="small muted">${esc(l)}</span><strong>${esc(v)}</strong></div>`).join('')}</div>
    <div class="card"><h3>${A('حسب الفرع', 'By branch')}</h3><table>
    <tr><th>${esc(t('branches'))}</th><th>${esc(t('tickets'))}</th><th>${esc(t('collected'))}</th><th>${esc(t('avgPrep'))}</th><th>${esc(t('maxPrep'))}</th><th>${esc(t('avgPickup'))}</th><th>${esc(t('rating'))}</th></tr>
    ${s.branches.map((b) => `<tr><td>${esc(pick(b, 'name'))}</td><td>${b.tickets}</td><td>${b.collected ?? 0}</td><td>${min(b.avg_prep_ms)}</td><td>${min(b.max_prep_ms)}</td><td>${min(b.avg_pickup_ms)}</td><td>${b.avg_rating ? b.avg_rating.toFixed(1) + ' ★ (' + b.ratings + ')' : '—'}</td></tr>`).join('')}
    </table></div>
    <div class="card"><h2>${esc(t('loyalty'))}</h2><p>${esc(t('cards'))}: <strong>${s.loyalty.cards}</strong> · ${esc(t('stampsN'))}: <strong>${s.loyalty.stamps}</strong> · ${esc(t('redeemed'))}: <strong>${s.loyalty.redeemed}</strong></p></div>`;
}

async function ownerBrand(el) {
  await identityView(el,me);
  const uploads=document.createElement('section');uploads.className='card';el.append(uploads);await fontEditor(uploads,el);
}

// ---------- branch: cashier & prep board ----------
let boardTimer = null;
let lastIssued = null;

async function branchOrders(el) {
  clearTimeout(boardTimer);
  el.innerHTML = `
    ${me.pushConfigured ? '' : `<p class="msg small">${esc(t('pushOff'))}</p>`}
    <div class="board">
      <div class="card stack"><h2>${esc(t('newTicket'))}</h2>
        <form novalidate class="row" id="nt"><div><label for="num">${esc(t('number'))}</label><input id="num" name="number" maxlength="64" autocomplete="off"></div><button class="btn big">${esc(t('newTicket'))}</button></form>
        <div id="m"></div><div id="issued"></div></div>
      <div class="card"><h2>${esc(t('ready'))}</h2><div class="tickets" id="ready"></div></div>
    </div>
    <div class="card"><h2>${esc(t('preparing'))}</h2><div class="tickets" id="prep"></div></div>`;
  const showIssued = () => {
    if (!lastIssued) return;
    const link = `${location.origin}/t/${lastIssued.token}`;
    el.querySelector('#issued').innerHTML = `<div style="text-align:center" class="stack" id="ticketprint"><div class="ticket-num">${esc(lastIssued.number)}</div><div class="qr">${qrSvg(link, 6)}</div><p>${esc(t('scanMe'))}</p></div><button class="btn ghost sm" id="pr" type="button">${esc(t('print'))}</button>`;
    el.querySelector('#pr').onclick = () => printTicket(lastIssued, link);
  };
  showIssued();
  let issueKey = uuid();
  el.querySelector('#nt').onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    try {
      lastIssued = await api('/api/branch/tickets', { method: 'POST', body: { invoice_number: e.target.number.value.trim() || undefined, idem_key: issueKey } });
      try { sessionStorage.setItem('zm_last_ticket_' + me.user.id, JSON.stringify(lastIssued)); } catch {}
      issueKey = uuid();
      e.target.reset();
      el.querySelector('#m').innerHTML = '';
      showIssued();
      refresh();
    } catch (err) {
      flash(el.querySelector('#m'), err.message === 'number_in_use' ? t('inUse') : errMsg(err), true);
    } finally {
      btn.disabled = false;
    }
  };
  async function act(tk, action, btn) {
    btn.disabled = true;
    try {
      await api(`/api/branch/tickets/${tk.id}/${action}`, { method: 'POST', body: { version: tk.version } });
    } catch (err) {
      if (err.status === 409) flash(el.querySelector('#m'), t('stale'), true);
      else flash(el.querySelector('#m'), errMsg(err), true);
    }
    refresh();
  }
  let seenPrep = null;
  // Keep the cashier screen awake while the board is open, and re-acquire after tab switches.
  let wake = null;
  const holdWake = async () => { try { if ('wakeLock' in navigator && document.visibilityState === 'visible') wake = await navigator.wakeLock.request('screen'); } catch {} };
  holdWake();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && (!wake || wake.released)) holdWake(); });
  async function refresh() {
    clearTimeout(boardTimer);
    try {
      const { tickets, now } = await api('/api/branch/tickets');
      if (lastIssued && (!tickets.some(tk => tk.token === lastIssued.token) || tickets.some(tk => tk.token === lastIssued.token && (tk.linked_at || ['collected','cancelled'].includes(tk.status))))) { lastIssued = null; el.querySelector('#issued').textContent = ''; try { sessionStorage.removeItem('zm_last_ticket_' + me.user.id); } catch {} }
      const row = (tk) => {
        const late = tk.status === 'ready' && !tk.seen_at && now - tk.ready_at > 2 * 60 * 1000;
        const age = relTime(now - (tk.status === 'ready' ? tk.ready_at : tk.created_at));
        const info = tk.status === 'ready'
          ? `${esc(t(tk.seen_at ? 'seen' : 'notSeen'))} · ${esc(t('alertsN', { n: tk.alerts_sent }))}`
          : esc(t(tk.linked_at ? 'linked' : 'notLinked'));
        const btns = tk.status === 'preparing'
          ? `<button class="btn ok" data-a="ready" type="button">${esc(t('markReady'))}</button><button class="btn ghost sm" data-a="collect" type="button">${esc(t('collect'))}</button><button class="btn danger sm" data-a="cancel" type="button">${esc(t('cancelT'))}</button>`
          : `<button class="btn warn sm" data-a="realert" type="button">${esc(t('realert'))}</button><button class="btn ok" data-a="collect" type="button">${esc(t('collect'))}</button>`;
        return `<div class="ticket ${late ? 'late' : ''}" data-id="${esc(tk.id)}"><span class="n">${esc(tk.number)}</span><span class="small">${info}<br><span class="muted">${esc(age)}</span>${tk.invoice_number ? `<br><span class="muted">${lang === 'ar' ? 'فاتورة' : 'Invoice'} ${esc(tk.invoice_number)}</span>` : ''}</span><span class="row" style="flex:0 1 auto">${btns}</span></div>`;
      };
      const open = tickets.filter((x) => x.status === 'preparing' || x.status === 'ready');
      // Tickets opened elsewhere (Rewaa sale, menu order) ring the cashier once; the first load is silent.
      const prepIds = open.filter((x) => x.status === 'preparing').map((x) => x.id);
      if (seenPrep && prepIds.some((i) => !seenPrep.has(i) && i !== lastIssued?.id)) { try { chime(1); } catch {} }
      seenPrep = new Set([...(seenPrep || []), ...prepIds]);
      for (const [id, st] of [['prep', 'preparing'], ['ready', 'ready']]) {
        const list = open.filter((x) => x.status === st);
        const box = el.querySelector('#' + id);
        if (!box) return;
        box.innerHTML = list.map(row).join('') || `<p class="empty">${esc(t('none'))}</p>`;
        box.querySelectorAll('[data-a]').forEach((b) => {
          const tk = list.find((x) => x.id === b.closest('.ticket').dataset.id);
          b.onclick = () => act(tk, b.dataset.a, b);
        });
      }
    } catch {}
    if (el.isConnected) boardTimer = setTimeout(refresh, 4000);
  }
  refresh();
}

function printTicket(tk, link) {
  const w = window.open('', '_blank', 'width=360,height=560');
  if (!w) return;
  w.document.write(`<!doctype html><html dir="${lang === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${esc(tk.number)}</title><style>body{font-family:sans-serif;text-align:center;margin:12px}svg{width:220px;height:220px}h1{font-size:48px;margin:8px}</style></head><body><p>${esc(pick(me.org, 'name'))}</p><h1>${esc(tk.number)}</h1>${qrSvg(link, 6)}<p>${esc(t('scanMe'))}</p></body></html>`);
  w.document.close();
  w.focus();
  w.print();
}

let displayTimer = null;
function branchDisplay(el) {
  clearTimeout(displayTimer);
  let knownReady = new Set();
  let armed = false;
  el.innerHTML = `<div class="row" style="margin:12px 0"><button class="btn ghost sm" id="fs" type="button">${esc(t('fullscreen'))}</button><button class="btn ghost sm" id="snd" type="button">🔔 ${esc(t('soundOn'))}</button></div>
    <div class="board" id="disp"><div class="card" style="text-align:center"><h2>${esc(t('latest'))}</h2><div id="lt"></div></div><div class="card"><h2>${esc(t('readyNow'))}</h2><div id="rd" class="grid" style="grid-template-columns:repeat(auto-fill,minmax(120px,1fr))"></div></div></div>`;
  el.querySelector('#fs').onclick = () => el.querySelector('#disp').requestFullscreen?.();
  el.querySelector('#snd').onclick = (e) => { armed = unlockAudio(); e.target.disabled = armed; };
  async function refresh() {
    try {
      const { tickets } = await api('/api/branch/tickets');
      const open = tickets.filter((x) => x.status === 'preparing');
      const latestTicket = tickets[0];
      const latest = latestTicket?.status === 'preparing' && !latestTicket.linked_at ? latestTicket : null;
      el.querySelector('#lt').innerHTML = latest
        ? `<div class="ticket-num">${esc(latest.number)}</div><div class="qr">${qrSvg(`${location.origin}/t/${latest.token}`, 7)}</div><p>${esc(t('scanMe'))}</p>`
        : `<p class="empty">${esc(t('none'))}</p>`;
      const ready = tickets.filter((x) => x.status === 'ready');
      el.querySelector('#rd').innerHTML = ready.map((x) => `<div class="hero-status ready"><div class="ticket-num">${esc(x.number)}</div></div>`).join('') || `<p class="empty">${esc(t('none'))}</p>`;
      const ids = new Set(ready.map((x) => x.id));
      if (armed && [...ids].some((i) => !knownReady.has(i))) chime(1);
      knownReady = ids;
    } catch {}
    if (el.isConnected) displayTimer = setTimeout(refresh, 3000);
  }
  refresh();
}

function branchLoyalty(el) {
  el.innerHTML = `<div class="card stack narrow"><h2>${esc(t('loyalty'))}</h2>
    <form novalidate class="row" id="f"><div><label for="code">${esc(t('cardCode'))}</label><input id="code" name="code" maxlength="6" autocomplete="off" style="text-transform:uppercase;letter-spacing:3px"></div><button class="btn">${esc(t('find'))}</button></form>
    ${'BarcodeDetector' in window ? `<button class="btn ghost" id="scan" type="button">${esc(t('scan'))}</button><video id="v" playsinline hidden style="width:100%;border-radius:12px"></video>` : ''}
    <div id="out"></div></div>`;
  const out = el.querySelector('#out');
  let current = null;
  function show(c) {
    current = c;
    const pts = c.program.kind === 'points', need = c.program.need || c.program.stamps_required;
    out.innerHTML = `<div class="card stack"><p><strong style="letter-spacing:3px">${esc(c.code)}</strong> · ${pts ? esc(A(`${c.stamps} نقطة من ${need}`, `${c.stamps} of ${need} points`)) : esc(t('stampsOf', { n: c.stamps, m: need }))}</p>
      ${pts ? `<label for="bill">${A('مبلغ الفاتورة (ر.س)', 'Bill amount (SAR)')}</label><input id="bill" type="number" min="1" step="0.01" inputmode="decimal" style="max-width:220px">` : ''}
      <div class="row"><button class="btn ok big" id="st" type="button">${pts ? A('أضف النقاط', 'Add points') : '+1 ' + esc(t('addStamp'))}</button>
      <button class="btn warn" id="rd" type="button" ${c.stamps >= need ? '' : 'disabled'}>${esc(t('redeemBtn'))}: ${esc(pick(c.program, 'reward'))}</button></div><div id="m"></div></div>`;
    // One idempotency key per intended action, kept across retries of that same click.
    const send = async (kind, btn) => {
      btn.disabled = true;
      const key = btn.dataset.key || (btn.dataset.key = uuid());
      try {
        const bill = out.querySelector('#bill');
        if (kind === 'stamp' && bill && !(Number(bill.value) >= 1)) { flash(out.querySelector('#m'), A('اكتب مبلغ الفاتورة.', 'Enter the bill amount.'), true); btn.disabled = false; bill.focus(); return; }
        show(await api(`/api/branch/loyalty/${current.code}/${kind}`, { method: 'POST', body: { idem_key: key, ...(kind === 'stamp' && bill ? { amount: Math.round(Number(bill.value) * 100) } : {}) } }));
      } catch (err) {
        if (err.status === 409) { delete btn.dataset.key; flash(out.querySelector('#m'), t('notEnough'), true); }
        else flash(out.querySelector('#m'), errMsg(err), true);
        btn.disabled = false;
      }
    };
    out.querySelector('#st').onclick = (e) => send('stamp', e.currentTarget);
    out.querySelector('#rd').onclick = (e) => send('redeem', e.currentTarget);
  }
  async function find(code) {
    try {
      show(await api('/api/branch/loyalty/' + encodeURIComponent(code.trim().toUpperCase())));
    } catch {
      out.innerHTML = `<p class="msg error">${esc(t('cardNF'))}</p>`;
    }
  }
  el.querySelector('#f').onsubmit = (e) => { e.preventDefault(); find(e.target.code.value); };
  el.querySelector('#scan')?.addEventListener('click', async () => {
    const v = el.querySelector('#v');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      v.hidden = false;
      v.srcObject = stream;
      await v.play();
      const det = new BarcodeDetector({ formats: ['qr_code'] });
      const tick = async () => {
        if (!v.isConnected) return stream.getTracks().forEach((x) => x.stop());
        const codes = await det.detect(v).catch(() => []);
        if (codes[0]) {
          stream.getTracks().forEach((x) => x.stop());
          v.hidden = true;
          return find(codes[0].rawValue);
        }
        requestAnimationFrame(tick);
      };
      tick();
    } catch {}
  });
}

async function branchAvailability(el) {
  const { categories, items } = await api('/api/branch/menu');
  el.innerHTML = categories
    .map((c) => `<div class="card"><h2>${esc(pick(c, 'name'))}</h2>${items
      .filter((i) => i.category_id === c.id && i.active)
      .map((i) => `<label class="row" style="justify-content:space-between"><span>${esc(pick(i, 'name'))}</span><span style="flex:0"><input type="checkbox" data-i="${esc(i.id)}" ${i.available ? 'checked' : ''}> ${esc(t('available'))}</span></label>`)
      .join('')}</div>`)
    .join('') || `<p class="empty">${esc(t('none'))}</p>`;
  el.querySelectorAll('[data-i]').forEach((cb) => (cb.onchange = () => api('/api/branch/availability/' + cb.dataset.i, { method: 'PUT', body: { available: cb.checked } }).catch(() => (cb.checked = !cb.checked))));
}

// ---------- boot ----------
try {
  me = await api('/api/me');
} catch {
  location.replace('/login');
  throw new Error('redirect');
}
// Platform workspace keeps ZIMARA identity; tenant branding is previewed in the studio.
if (me.user.role === 'owner') setBrandColor('#23003f');
else if (me.org) setBrandColor(me.org.brand_color);
const subtitle = me.user.role === 'admin' ? t('admin') : me.user.role === 'owner' ? pick(me.org, 'name') : `${pick(me.org, 'name')} · ${pick(me.branch, 'name')}`;
topbar(top, t, { subtitle, extra: `<button class="btn ghost sm" id="out" type="button">${esc(t('logout'))}</button>` });
top.querySelector('[data-act=lang]').onclick=async()=>{if(await canLeaveWorkspace())toggleLang();};
top.querySelector('.brandmark').onclick=async e=>{e.preventDefault();if(await canLeaveWorkspace())location.assign('/');};
top.querySelector('#out').onclick = async () => {
  if(!await canLeaveWorkspace())return;
  await api('/api/logout', { method: 'POST', body: {} }).catch(() => {});
  location.replace('/login');
};
try { lastIssued = JSON.parse(sessionStorage.getItem('zm_last_ticket_' + me.user.id)); } catch {}

const heading = document.createElement('div');
heading.className = 'workspace-heading';
heading.innerHTML = `<div><h1>${esc(me.user.role === 'admin' ? t('admin') : me.user.role === 'owner' ? t('owner') : t('branch'))}</h1><p class="muted">${esc(subtitle)}</p></div>${me.user.role === 'owner' && me.org?.slug ? `<a class="btn ghost sm heading-link" href="/p/${esc(me.org.slug)}" target="_blank" rel="noopener">${lang === 'ar' ? 'عرض صفحتي العامة' : 'View public page'} ↗</a>` : me.branch?.slug ? `<a class="btn ghost sm heading-link" href="/m/${esc(me.branch.slug)}" target="_blank" rel="noopener">${lang === 'ar' ? 'عرض المنيو' : 'View menu'} ↗</a>` : ''}`;
main.before(heading);

const views = {
  admin: [['orgs', t('orgs'), adminOrgs], ['admins', t('admins'), adminAdmins], ['legal', lang === 'ar' ? 'البيانات القانونية' : 'Legal details', adminLegalView], ['account', t('account'), accountView]],
  owner: [['overview', lang === 'ar' ? 'نظرة عامة' : 'Overview', ownerOverview], ['menu', t('menu'), ownerMenu], ['brand', lang === 'ar' ? 'استوديو الهوية' : 'Brand studio', ownerBrand], ['profile',lang === 'ar' ? 'صفحة المنشأة' : 'Business page',el=>profileEditor(el,me)], ['branches', t('branches'), ownerBranches], ['loyalty', t('loyalty'), (el) => loyaltyAdmin(el, me)], ['stats', t('stats'), ownerStats], ['import', lang === 'ar' ? 'استيراد الأصناف' : 'Import items', importView], ['settings', lang === 'ar' ? 'إعدادات الفروع' : 'Branch settings', branchSettingsView], ['devices', lang === 'ar' ? 'أجهزة العرض' : 'Display devices', el => devicesView(el, me)], ['subscription', lang === 'ar' ? 'باقتي وفواتيري' : 'Plan & invoices', subscriptionView], ['design', lang === 'ar' ? 'استوديو التصميم' : 'Design studio', el => designStudio(el, me)], ['coupons', lang === 'ar' ? 'الكوبونات' : 'Coupons', couponsView], ['templates', lang === 'ar' ? 'صفحات جاهزة' : 'Ready pages', templatesView], ['addons', lang === 'ar' ? 'الإضافات' : 'Add-ons', addonsView], ['domain', lang === 'ar' ? 'الدومين الخاص' : 'Own domain', domainView], ['integrations', lang === 'ar' ? 'التكاملات' : 'Integrations', integrationsView], ['account', t('account'), accountView]],
  branch: [['orders', t('orders'), branchOrders], ['waitlist', lang === 'ar' ? 'قائمة الانتظار' : 'Waitlist', waitlistBoard], ['display', t('display'), branchDisplay], ['loyalty', t('loyalty'), branchLoyalty], ['availability', t('availability'), branchAvailability], ['inbox', lang === 'ar' ? 'طلبات المنيو' : 'Menu orders', menuOrdersView], ['devices', lang === 'ar' ? 'أجهزة العرض' : 'Display devices', el => devicesView(el, me)], ['account', t('account'), accountView]],
}[me.user.role];
tabs(views.map(([k, l]) => [k, l]), (k, el) => {
  clearTimeout(boardTimer);
  clearTimeout(displayTimer);
  Promise.resolve(views.find((v) => v[0] === k)[2](el)).catch((e) => flash(el, errMsg(e), true));
});


const normalizeUI = () => {
  document.querySelectorAll('form:not([novalidate])').forEach(form => form.noValidate = true);
  document.querySelectorAll('table').forEach(table => {
    if (table.parentElement.classList.contains('table-scroll')) return;
    const wrap = document.createElement('div'); wrap.className = 'table-scroll';
    table.before(wrap); wrap.append(table);
  });
};
new MutationObserver(normalizeUI).observe(main, { childList: true, subtree: true });
normalizeUI();
