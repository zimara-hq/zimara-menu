import { ApiError, api, chime, esc, lang, makeT, money, pick, qrSvg, relTime, setBrandColor, topbar, unlockAudio, requestValue, announce } from './common.js';

import { profileView, importView, subscriptionView, integrationsView, devicesView, menuOrdersView, branchSettingsView, mfaView, assetUploadView, dataControlsView, adminLegalView } from './dashboard-panels.js';

const t = makeT({
  ar: {
    admin: 'إدارة زيمارا', owner: 'إدارة المنشأة', branch: 'الفرع',
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
    admin: 'ZIMARA admin', owner: 'Business admin', branch: 'Branch',
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
const errMsg = (e) => (e instanceof ApiError ? `${t('error')} (${e.message})` : t('error'));
function flash(el, text, error = false) {
  el.innerHTML = `<p class="msg ${error ? 'error' : ''}" role="status">${esc(text)}</p>`;
}
const uuid = () => crypto.randomUUID();

function tabs(list, onPick) {
  addEventListener('hashchange', () => { const k = location.hash.slice(1); if (k !== current && list.some(([x]) => x === k)) show(k); });
  const nav = document.createElement('nav');
  nav.className = 'tabs';
  nav.setAttribute('role', 'tablist');
  const body = document.createElement('div');
  body.className = 'wrap';
  let current = list[0][0];
  try { current = sessionStorage.getItem('zm_tab_' + me.user.role) || current; } catch {}
  // Returning from the payment page, or a deep link like /app#subscription, opens that tab.
  const wanted = new URLSearchParams(location.search).has('billing') ? 'subscription' : location.hash.slice(1);
  if (wanted && list.some(([k]) => k === wanted)) current = wanted;
  if (!list.some(([k]) => k === current)) current = list[0][0];
  function show(k) {
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
  }
  for (const [k, label] of list) {
    const b = document.createElement('button');
    b.type = 'button';
    b.role = 'tab';
    b.dataset.k = k;
    b.id = 'tab-' + k;
    b.setAttribute('aria-controls', 'panel-' + k);
    b.textContent = label;
    b.onclick = () => show(k);
    b.addEventListener('keydown', (e) => {
      const buttons = [...nav.querySelectorAll('button')];
      let index = buttons.indexOf(b);
      if (e.key === 'ArrowRight') index = (index + 1) % buttons.length;
      else if (e.key === 'ArrowLeft') index = (index - 1 + buttons.length) % buttons.length;
      else if (e.key === 'Home') index = 0;
      else if (e.key === 'End') index = buttons.length - 1;
      else return;
      e.preventDefault(); buttons[index].focus(); buttons[index].click();
    });
    nav.append(b);
  }
  main.replaceChildren(nav, body);
  show(current);
}

// ---------- shared: my account ----------
function accountView(el) {
  el.innerHTML = `<form class="card stack narrow" id="pw"><h2>${esc(t('account'))}</h2><p class="muted">${esc(me.user.email)}</p>
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
    <form class="card stack" id="new"><h2>${esc(t('newOrg'))}</h2>
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
    ${admins.length < max ? `<form class="card stack" id="new"><h2>${esc(t('newAdmin'))}</h2><div class="row">${field('name', t('name'), 'required')}${field('email', t('email'), 'type="email" required')}${field('password', t('password'), 'type="password" minlength="10" required autocomplete="new-password"')}</div><div id="m"></div><button class="btn">${esc(t('create'))}</button></form>` : ''}`;
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

async function ownerBranches(el) {
  const { branches } = await api('/api/owner/branches');
  el.innerHTML = `
    <div class="section-intro"><h2>${esc(t('branches'))}</h2><p>${lang === 'ar' ? 'رابط منيو ثابت لكل فرع، وحساب كاشير مستقل. رموز النداء تظهر في شاشات العرض الخاصة فقط.' : 'A stable menu link and a separate cashier account for each branch. Pager codes appear only on private counter displays.'}</p></div>
    <div class="branch-grid">${branches
      .map((b) => `<div class="card branch-card"><div class="branch-copy"><span class="pill">${esc(t(b.active ? 'active' : 'inactive'))}</span><h3>${esc(pick(b, 'name'))}</h3>
        <p class="small muted">${esc(b.account_email || (lang === 'ar' ? 'حساب الكاشير لم يُضبط بعد.' : 'Cashier account not set up yet.'))}</p>
        <div class="row">${!b.account_email ? `<button class="btn" data-setup="${esc(b.id)}" type="button">${lang === 'ar' ? 'إعداد حساب الكاشير' : 'Set up cashier account'}</button>` : `<button class="btn ghost sm" data-acc="${esc(b.id)}" data-d="${b.account_disabled}" type="button">${esc(t(b.account_disabled ? 'enable' : 'disable'))}</button><button class="btn ghost sm" data-pw="${esc(b.id)}" type="button">${esc(t('resetPw'))}</button>`}</div></div>
        ${qrBlock(`${location.origin}/m/${b.slug}`, t('menuQr'))}</div>`)
      .join('')}</div>
    <form class="card stack" id="new"><h2>${esc(t('newBranch'))}</h2>
      <div class="row">${field('name_ar', t('nameAr'), 'required')}${field('name_en', t('nameEn'), 'required')}</div>
      ${field('google_review_url', t('review'), 'type="url" placeholder="https://g.page/r/..."')}
      <h3>${esc(t('branchAcc'))}</h3>
      <div class="row">${field('a_name', t('name'), 'required')}${field('a_email', t('email'), 'type="email" required')}${field('a_password', t('password'), 'type="password" minlength="10" required autocomplete="new-password"')}</div>
      <div id="m"></div><button class="btn">${esc(t('create'))}</button></form>`;
  el.querySelector('#new').onsubmit = async (e) => {
    e.preventDefault();
    const v = fd(e.target);
    try {
      await api('/api/owner/branches', { method: 'POST', body: { name_ar: v.name_ar, name_en: v.name_en, google_review_url: v.google_review_url || null, account: { name: v.a_name, email: v.a_email, password: v.a_password } } });
      ownerBranches(el);
    } catch (err) {
      flash(el.querySelector('#m'), errMsg(err), true);
    }
  };
  el.querySelectorAll('[data-setup]').forEach(btn => btn.onclick = async () => {
    const email = await requestValue({ title: t('branchAcc'), label: t('email'), type: 'email', confirmLabel: lang === 'ar' ? 'متابعة' : 'Continue' });
    if (!email) return;
    const password = await requestValue({ title: t('branchAcc'), label: t('password'), type: 'password', confirmLabel: t('create') });
    if (!password) return;
    btn.disabled = true;
    try { await api(`/api/owner/branches/${btn.dataset.setup}/account`, { method: 'PATCH', body: { email, name: lang === 'ar' ? 'الكاشير' : 'Cashier', password } }); await ownerBranches(el); }
    catch (error) { announce(errMsg(error), true); btn.disabled = false; }
  });
  el.querySelectorAll('[data-acc]').forEach((b) => (b.onclick = async () => {
    await api(`/api/owner/branches/${b.dataset.acc}/account`, { method: 'PATCH', body: { disabled: b.dataset.d !== '1' } });
    ownerBranches(el);
  }));
  el.querySelectorAll('[data-pw]').forEach((b) => (b.onclick = async () => {
    const pw = await requestValue({ title: t('resetPw'), label: t('password'), type: 'password', confirmLabel: t('save') });
    if (!pw) return;
    try {
      await api(`/api/owner/branches/${b.dataset.pw}/account`, { method: 'PATCH', body: { password: pw } });
      announce(t('saved'));
    } catch (err) {
      announce(errMsg(err), true);
    }
  }));
}

async function ownerMenu(el) {
  const { categories, items } = await api('/api/owner/menu');
  const catOpts = (sel) => categories.map((c) => `<option value="${esc(c.id)}" ${c.id === sel ? 'selected' : ''}>${esc(pick(c, 'name'))}</option>`).join('');
  const itemForm = (i = {}, p = 'f') => `
    <div class="row"><div><label for="${p}-category_id">${esc(t('category'))}</label><select id="${p}-category_id" name="category_id" required>${catOpts(i.category_id)}</select></div>
      ${field('name_ar', t('nameAr'), `required value="${esc(i.name_ar || '')}"`, p)}${field('name_en', t('nameEn'), `required value="${esc(i.name_en || '')}"`, p)}</div>
    <div class="row">${field('price', t('price'), `type="number" min="0" step="0.01" required value="${i.price != null ? i.price / 100 : ''}"`, p)}${field('calories', t('kcal'), `type="number" min="0" value="${i.calories ?? ''}"`, p)}${field('sort', t('sort'), `type="number" min="0" value="${i.sort ?? 0}"`, p)}</div>
    ${field('image_url', t('image'), `type="url" value="${esc(i.image_url || '')}"`, p)}
    <div class="row">${field('desc_ar', t('descAr'), `value="${esc(i.desc_ar || '')}"`, p)}${field('desc_en', t('descEn'), `value="${esc(i.desc_en || '')}"`, p)}</div>
    <label><input type="checkbox" name="hidden" ${i.active === 0 ? 'checked' : ''}> ${esc(t('hidden'))}</label>`;
  const toItem = (v) => ({
    category_id: v.category_id, name_ar: v.name_ar, name_en: v.name_en, desc_ar: v.desc_ar, desc_en: v.desc_en,
    price: Math.round(Number(v.price) * 100), calories: v.calories === '' ? null : Number(v.calories), image_url: v.image_url || null,
    sort: Number(v.sort || 0), active: !v.hidden,
  });
  el.innerHTML = `
    <div class="card stack"><h2>${esc(t('cats'))}</h2>
      <table>${categories.map((c) => `<tr><td>${esc(c.name_ar)} / ${esc(c.name_en)}</td><td>${c.active ? '' : esc(t('hidden'))}</td></tr>`).join('')}</table>
      <form class="row" id="cat">${field('c_ar', t('nameAr'), 'required')}${field('c_en', t('nameEn'), 'required')}<button class="btn">${esc(t('newCat'))}</button></form></div>
    ${categories.length ? `<form class="card stack" id="item"><h2>${esc(t('newItem'))}</h2>${itemForm()}<div id="m"></div><button class="btn">${esc(t('add'))}</button></form>` : ''}
    <div class="card"><h2>${esc(t('items'))}</h2>${items
      .map((i, n) => `<details class="card"><summary><strong>${esc(pick(i, 'name'))}</strong> · ${esc(money(i.price))} ${i.active ? '' : `· <span class="pill">${esc(t('hidden'))}</span>`}</summary>
        <form class="stack" data-item="${esc(i.id)}">${itemForm(i, 'i' + n)}<button class="btn sm">${esc(t('save'))}</button></form></details>`)
      .join('') || `<p class="empty">${esc(t('none'))}</p>`}</div>`;
  el.querySelector('#cat').onsubmit = async (e) => {
    e.preventDefault();
    const v = fd(e.target);
    try {
      await api('/api/owner/categories', { method: 'POST', body: { name_ar: v.c_ar, name_en: v.c_en, sort: categories.length } });
      ownerMenu(el);
    } catch (error) { announce(errMsg(error), true); }
  };
  el.querySelector('#item')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/api/owner/items', { method: 'POST', body: toItem(fd(e.target)) });
      ownerMenu(el);
    } catch (err) {
      flash(el.querySelector('#m'), errMsg(err), true);
    }
  });
  el.querySelectorAll('[data-item]').forEach((f) => (f.onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api('/api/owner/items/' + f.dataset.item, { method: 'PATCH', body: toItem(fd(f)) });
      ownerMenu(el);
    } catch (err) {
      announce(errMsg(err), true);
    }
  }));
}

async function ownerLoyalty(el) {
  const { program: p } = await api('/api/owner/loyalty');
  el.innerHTML = `
    <form class="card stack narrow" id="f"><h2>${esc(t('loyalty'))}</h2>
      ${field('stamps_required', t('stampsReq'), `type="number" min="2" max="50" required value="${p.stamps_required}"`)}
      ${field('reward_ar', t('rewardAr'), `required value="${esc(p.reward_ar)}"`)}${field('reward_en', t('rewardEn'), `required value="${esc(p.reward_en)}"`)}
      <label><input type="checkbox" name="active" ${p.active ? 'checked' : ''}> ${esc(t('programOn'))}</label>
      <div id="m"></div><button class="btn">${esc(t('save'))}</button></form>
    <div class="card">${qrBlock(`${location.origin}/j/${me.org.slug}`, t('joinQr'))}</div>`;
  el.querySelector('#f').onsubmit = async (e) => {
    e.preventDefault();
    const v = fd(e.target);
    try {
      await api('/api/owner/loyalty', { method: 'PUT', body: { stamps_required: Number(v.stamps_required), reward_ar: v.reward_ar, reward_en: v.reward_en, active: Boolean(v.active) } });
      flash(el.querySelector('#m'), t('saved'));
    } catch (err) {
      flash(el.querySelector('#m'), errMsg(err), true);
    }
  };
}

async function ownerStats(el) {
  const s = await api('/api/owner/stats');
  const min = (ms) => (ms == null ? '—' : relTime(ms));
  el.innerHTML = `<div class="card"><h2>${esc(t('stats'))} · ${esc(t('last30'))}</h2><table>
    <tr><th>${esc(t('branches'))}</th><th>${esc(t('tickets'))}</th><th>${esc(t('collected'))}</th><th>${esc(t('avgPrep'))}</th><th>${esc(t('maxPrep'))}</th><th>${esc(t('avgPickup'))}</th><th>${esc(t('rating'))}</th></tr>
    ${s.branches.map((b) => `<tr><td>${esc(pick(b, 'name'))}</td><td>${b.tickets}</td><td>${b.collected ?? 0}</td><td>${min(b.avg_prep_ms)}</td><td>${min(b.max_prep_ms)}</td><td>${min(b.avg_pickup_ms)}</td><td>${b.avg_rating ? b.avg_rating.toFixed(1) + ' ★ (' + b.ratings + ')' : '—'}</td></tr>`).join('')}
    </table></div>
    <div class="card"><h2>${esc(t('loyalty'))}</h2><p>${esc(t('cards'))}: <strong>${s.loyalty.cards}</strong> · ${esc(t('stampsN'))}: <strong>${s.loyalty.stamps}</strong> · ${esc(t('redeemed'))}: <strong>${s.loyalty.redeemed}</strong></p></div>`;
}

function ownerBrand(el) {
  const o = me.org;
  el.innerHTML = `<form class="card stack narrow" id="f"><h2>${esc(t('brandTab'))}</h2>
    ${field('name_ar', t('nameAr'), `required value="${esc(o.name_ar)}"`)}${field('name_en', t('nameEn'), `required value="${esc(o.name_en)}"`)}
    ${field('brand_color', t('color'), `type="color" value="${esc(o.brand_color || '#23003f')}"`)}${field('logo_url', t('logo'), `type="url" value="${esc(o.logo_url || '')}"`)}
    <div id="m"></div><button class="btn">${esc(t('save'))}</button></form>`;
  const uploads = document.createElement('section'); uploads.className = 'card'; assetUploadView(uploads); el.append(uploads);
  el.querySelector('#f').onsubmit = async (e) => {
    e.preventDefault();
    const v = fd(e.target);
    try {
      await api('/api/owner/org', { method: 'PATCH', body: { ...v, logo_url: v.logo_url || null } });
      Object.assign(me.org, v);
      setBrandColor(v.brand_color);
      flash(el.querySelector('#m'), t('saved'));
    } catch (err) {
      flash(el.querySelector('#m'), errMsg(err), true);
    }
  };
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
        <form class="row" id="nt"><div><label for="num">${esc(t('number'))}</label><input id="num" name="number" maxlength="64" autocomplete="off"></div><button class="btn big">${esc(t('newTicket'))}</button></form>
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
    <form class="row" id="f"><div><label for="code">${esc(t('cardCode'))}</label><input id="code" name="code" maxlength="6" autocomplete="off" style="text-transform:uppercase;letter-spacing:3px"></div><button class="btn">${esc(t('find'))}</button></form>
    ${'BarcodeDetector' in window ? `<button class="btn ghost" id="scan" type="button">${esc(t('scan'))}</button><video id="v" playsinline hidden style="width:100%;border-radius:12px"></video>` : ''}
    <div id="out"></div></div>`;
  const out = el.querySelector('#out');
  let current = null;
  function show(c) {
    current = c;
    out.innerHTML = `<div class="card stack"><p><strong style="letter-spacing:3px">${esc(c.code)}</strong> · ${esc(t('stampsOf', { n: c.stamps, m: c.program.stamps_required }))}</p>
      <div class="row"><button class="btn ok big" id="st" type="button">+1 ${esc(t('addStamp'))}</button>
      <button class="btn warn" id="rd" type="button" ${c.stamps >= c.program.stamps_required ? '' : 'disabled'}>${esc(t('redeemBtn'))}: ${esc(pick(c.program, 'reward'))}</button></div><div id="m"></div></div>`;
    // One idempotency key per intended action, kept across retries of that same click.
    const send = async (kind, btn) => {
      btn.disabled = true;
      const key = btn.dataset.key || (btn.dataset.key = uuid());
      try {
        show(await api(`/api/branch/loyalty/${current.code}/${kind}`, { method: 'POST', body: { idem_key: key } }));
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
if (me.org) setBrandColor(me.org.brand_color);
const subtitle = me.user.role === 'admin' ? t('admin') : me.user.role === 'owner' ? pick(me.org, 'name') : `${pick(me.org, 'name')} · ${pick(me.branch, 'name')}`;
topbar(top, t, { subtitle, extra: `<button class="btn ghost sm" id="out" type="button">${esc(t('logout'))}</button>` });
top.querySelector('#out').onclick = async () => {
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
  owner: [['branches', t('branches'), ownerBranches], ['menu', t('menu'), ownerMenu], ['loyalty', t('loyalty'), ownerLoyalty], ['stats', t('stats'), ownerStats], ['brand', t('brandTab'), ownerBrand], ['profile', lang === 'ar' ? 'صفحتي العامة' : 'Public profile', el => profileView(el, me)], ['import', lang === 'ar' ? 'استيراد الأصناف' : 'Import items', importView], ['settings', lang === 'ar' ? 'إعدادات الفروع' : 'Branch settings', branchSettingsView], ['devices', lang === 'ar' ? 'أجهزة العرض' : 'Display devices', el => devicesView(el, me)], ['subscription', lang === 'ar' ? 'باقتي وفواتيري' : 'Plan & invoices', subscriptionView], ['integrations', lang === 'ar' ? 'التكاملات' : 'Integrations', integrationsView], ['account', t('account'), accountView]],
  branch: [['orders', t('orders'), branchOrders], ['display', t('display'), branchDisplay], ['loyalty', t('loyalty'), branchLoyalty], ['availability', t('availability'), branchAvailability], ['inbox', lang === 'ar' ? 'طلبات المنيو' : 'Menu orders', menuOrdersView], ['devices', lang === 'ar' ? 'أجهزة العرض' : 'Display devices', el => devicesView(el, me)], ['account', t('account'), accountView]],
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
