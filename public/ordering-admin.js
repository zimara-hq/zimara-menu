import { icon } from './icons.js';
// Owner screens for ordering: order types per branch (with table QR codes),
// WhatsApp ordering, delivery terms, and coupons.
import { api, esc, lang, money, pick, qrSvg, announce } from './common.js';
const a = (ar, en) => (lang === 'ar' ? ar : en);
const TYPES = [['dine_in', 'dish', 'محلي (على الطاولة)', 'Dine-in (at the table)'], ['pickup', 'bag', 'استلام من الكاشير', 'Pickup at the counter'], ['delivery', 'delivery', 'توصيل', 'Delivery'], ['car', 'car', 'استلام من السيارة', 'Curbside (to the car)']];
const sar = (h) => (h ? (h / 100).toString() : '');
const halalas = (v) => Math.round(Number(v || 0) * 100);

export async function orderingPanel(el, branch) {
  const { ordering: o } = await api(`/api/owner/branches/${branch.id}/ordering`);
  el.innerHTML = `<div class="editor-heading"><h3>${a('طرق الطلب', 'Ways to order')} · ${esc(pick(branch, 'name'))}</h3></div>
    <form class="stack" novalidate>
      <fieldset class="opt-group"><legend>${a('وش تستقبل في هذا الفرع؟', 'What does this branch take?')}</legend><div class="allergen-grid">${TYPES.map(([k, ic, ar, en]) => `<label class="check"><input type="checkbox" name="type" value="${k}" ${o.types.includes(k) ? 'checked' : ''}> ${icon(ic)} ${a(ar, en)}</label>`).join('')}</div></fieldset>
      <div class="grid2"><label>${a('عدد الطاولات (0 = بدون أرقام)', 'Number of tables (0 = no numbers)')}<input name="tables" type="number" min="0" max="500" inputmode="numeric" value="${o.tables}"></label>
      <label>${a('رقم واتساب لاستقبال الطلبات (اختياري)', 'WhatsApp number for orders (optional)')}<input name="whatsapp" dir="ltr" inputmode="tel" placeholder="05xxxxxxxx" value="${o.whatsapp ? '0' + o.whatsapp.slice(3) : ''}"></label></div>
      <div class="grid2"><label>${a('رسوم التوصيل (ر.س)', 'Delivery fee (SAR)')}<input name="delivery_fee" type="number" min="0" step="0.5" inputmode="decimal" value="${sar(o.delivery_fee)}"></label>
      <label>${a('أقل طلب للتوصيل (ر.س)', 'Minimum order for delivery (SAR)')}<input name="delivery_min" type="number" min="0" step="1" inputmode="decimal" value="${sar(o.delivery_min)}"></label></div>
      <p class="small muted">${a('رقم الواتساب يظهر للعميل كزر «اطلب عبر واتساب» ويرسل سلته لك برسالة جاهزة.', 'The WhatsApp number shows guests an “Order on WhatsApp” button that sends you their cart as a ready message.')}</p>
      <div role="status"></div>
      <div class="row"><button class="btn" type="submit">${a('حفظ طرق الطلب', 'Save ways to order')}</button><button class="btn ghost" type="button" data-tables ${o.tables ? '' : 'hidden'}>${a('اطبع أكواد الطاولات', 'Print table QR codes')}</button></div>
    </form>`;
  const f = el.querySelector('form'), msg = f.querySelector('[role=status]');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const types = [...f.querySelectorAll('[name=type]:checked')].map((x) => x.value);
    if (!types.length) { msg.innerHTML = `<p class="msg error">${a('اختر طريقة طلب وحدة على الأقل.', 'Pick at least one way to order.')}</p>`; return; }
    const btn = f.querySelector('[type=submit]'); btn.disabled = true;
    try {
      const r = await api(`/api/owner/branches/${branch.id}/ordering`, { method: 'PATCH', body: { types, tables: Number(f.tables.value || 0), whatsapp: f.whatsapp.value.trim() || null, delivery_fee: halalas(f.delivery_fee.value), delivery_min: halalas(f.delivery_min.value) } });
      Object.assign(o, r.ordering);
      f.querySelector('[data-tables]').hidden = !o.tables;
      msg.innerHTML = `<p class="msg">${a('تم الحفظ ✓', 'Saved ✓')}</p>`;
      announce(a('تم حفظ طرق الطلب.', 'Ways to order saved.'));
    } catch (err) {
      msg.innerHTML = `<p class="msg error">${err?.data?.error === 'invalid_whatsapp' ? a('رقم الواتساب لازم يكون جوال سعودي يبدأ بـ 05.', 'The WhatsApp number must be a Saudi mobile starting with 05.') : a('تعذر الحفظ.', 'Could not save.')}</p>`;
    } finally { btn.disabled = false; }
  };
  f.querySelector('[data-tables]').onclick = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    const cards = Array.from({ length: o.tables }, (_, i) => { const u = `${location.origin}/m/${branch.slug}?table=${i + 1}`; return `<div class="t"><b>${a('طاولة', 'Table')} ${i + 1}</b>${qrSvg(u, 4)}<small>${a('امسح للطلب', 'Scan to order')}</small></div>`; }).join('');
    w.document.write(`<!doctype html><meta charset="utf-8"><title>${a('أكواد الطاولات', 'Table codes')}</title><style>body{font-family:system-ui;margin:16px}.g{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.t{border:1px dashed #999;border-radius:12px;padding:12px;text-align:center;break-inside:avoid;display:grid;gap:6px;justify-items:center}.t b{font-size:1.4rem}</style><div class="g" dir="${lang === 'ar' ? 'rtl' : 'ltr'}">${cards}</div>`);
    w.document.close(); w.focus(); w.print();
  };
}

const ERR = {
  invalid_code: ['الكود حروف وأرقام فقط (3 إلى 20).', 'Letters and numbers only (3 to 20).'],
  coupon_exists: ['هذا الكود موجود.', 'That code already exists.'],
  coupons_limit: ['وصلت الحد (100 كوبون).', 'Limit reached (100 coupons).'],
  invalid_value: ['النسبة من 1 إلى 100.', 'Percent must be 1 to 100.'],
  invalid_dates: ['تاريخ النهاية لازم بعد البداية.', 'The end date must be after the start.'],
};

export async function couponsView(el) {
  const { coupons } = await api('/api/owner/coupons');
  const day = (ms) => (ms ? new Date(ms).toLocaleDateString(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB') : '');
  el.innerHTML = `<div class="section-intro"><span class="eyebrow">${a('العروض', 'OFFERS')}</span><h2>${a('كوبونات تجيب العميل وترجّعه.', 'Coupons that bring guests back.')}</h2><p>${a('العميل يكتب الكود في السلة ويشوف الخصم قبل الإرسال. الخصم يحسبه النظام، مو العميل.', 'Guests type the code in the cart and see the discount before sending. The system prices it, never the guest.')}</p></div>
    <form class="card stack" id="cp-form" novalidate><h3>${a('كوبون جديد', 'New coupon')}</h3>
      <div class="grid2"><label>${a('الكود', 'Code')}<input name="code" maxlength="20" dir="ltr" placeholder="WELCOME10" required></label>
      <label>${a('نوع الخصم', 'Discount type')}<select name="kind"><option value="percent">${a('نسبة ٪', 'Percent %')}</option><option value="amount">${a('مبلغ (ر.س)', 'Amount (SAR)')}</option></select></label></div>
      <div class="grid2"><label>${a('القيمة', 'Value')}<input name="value" type="number" min="1" step="0.5" inputmode="decimal" required></label>
      <label>${a('أقل مبلغ للسلة (ر.س، اختياري)', 'Minimum cart (SAR, optional)')}<input name="min_total" type="number" min="0" inputmode="decimal"></label></div>
      <div class="grid2"><label>${a('عدد مرات الاستخدام (اختياري)', 'Uses allowed (optional)')}<input name="max_uses" type="number" min="1" inputmode="numeric"></label>
      <label>${a('ينتهي في (اختياري)', 'Ends on (optional)')}<input name="ends" type="date"></label></div>
      <div role="status"></div><button class="btn" type="submit">${a('أنشئ الكوبون', 'Create coupon')}</button></form>
    <section class="card"><h3>${a('كوبوناتك', 'Your coupons')}</h3>${coupons.length ? `<div class="table-scroll"><table><thead><tr><th>${a('الكود', 'Code')}</th><th>${a('الخصم', 'Discount')}</th><th>${a('الاستخدام', 'Used')}</th><th>${a('ينتهي', 'Ends')}</th><th>${a('الحالة', 'Status')}</th><th></th></tr></thead><tbody>${coupons.map((c) => `<tr><td dir="ltr"><code>${esc(c.code)}</code></td><td>${c.kind === 'percent' ? c.value + '٪' : esc(money(c.value))}${c.min_total ? ` <small class="muted">${a('من', 'over')} ${esc(money(c.min_total))}</small>` : ''}</td><td>${c.used}${c.max_uses ? ' / ' + c.max_uses : ''}</td><td>${esc(day(c.ends_at)) || '—'}</td><td><button type="button" class="btn ghost sm" data-toggle="${esc(c.id)}" data-on="${c.active ? 1 : 0}">${c.active ? a('فعّال · إيقاف', 'Active · pause') : a('موقوف · تفعيل', 'Paused · resume')}</button></td><td><button type="button" class="btn danger sm" data-del="${esc(c.id)}">${a('حذف', 'Delete')}</button></td></tr>`).join('')}</tbody></table></div>` : `<p class="empty">${a('ما عندك كوبونات بعد.', 'No coupons yet.')}</p>`}</section>`;
  const f = el.querySelector('#cp-form'), msg = f.querySelector('[role=status]');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const kind = f.kind.value;
    const body = { code: f.code.value.trim(), kind, value: kind === 'percent' ? Math.round(Number(f.value.value)) : halalas(f.value.value), min_total: halalas(f.min_total.value), max_uses: f.max_uses.value ? Number(f.max_uses.value) : null, ends_at: f.ends.value ? new Date(f.ends.value + 'T23:59:59+03:00').getTime() : null };
    try { await api('/api/owner/coupons', { method: 'POST', body }); announce(a('تم إنشاء الكوبون.', 'Coupon created.')); await couponsView(el); }
    catch (err) { const k = err?.data?.error; msg.innerHTML = `<p class="msg error">${esc(ERR[k] ? a(...ERR[k]) : a('تعذر الإنشاء. راجع الخانات.', 'Could not create. Check the fields.'))}</p>`; }
  };
  el.querySelectorAll('[data-toggle]').forEach((b) => (b.onclick = async () => { b.disabled = true; try { await api('/api/owner/coupons/' + b.dataset.toggle, { method: 'PATCH', body: { active: b.dataset.on !== '1' } }); await couponsView(el); } catch { b.disabled = false; } }));
  el.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => { if (!confirm(a('حذف الكوبون نهائيًا؟', 'Delete this coupon?'))) return; b.disabled = true; try { await api('/api/owner/coupons/' + b.dataset.del, { method: 'DELETE', body: {} }); await couponsView(el); } catch { b.disabled = false; } }));
}
