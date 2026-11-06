import { icon } from './icons.js';
// Magic start: a five-step wizard that takes a new owner from an empty account to
// a live, designed menu with a QR code, and the AI import (photo, PDF, link or
// description → menu draft) that the wizard and the import tab share.
import { api, esc, lang, qrSvg, announce } from './common.js';
import { imageField, wireImageFields } from './uploads.js';
import { miniCard } from './design-studio.js';
const a = (ar, en) => (lang === 'ar' ? ar : en);

// Trades shown in the wizard, their profile sector, and the design sector they match.
const TRADES = [
  ['cafe', 'coffee', 'مقهى', 'Café', 'cafe'], ['roastery', 'bean', 'محمصة', 'Roastery', 'cafe'], ['restaurant', 'dish', 'مطعم', 'Restaurant', 'restaurant'],
  ['burger', 'burger', 'برجر ووجبات سريعة', 'Burgers & fast food', 'restaurant'], ['oriental', 'dish', 'شعبي وشرقي', 'Arabic & traditional', 'restaurant'],
  ['bakery', 'bread', 'مخبز وحلويات', 'Bakery & sweets', 'cafe'], ['juice', 'cup', 'عصائر', 'Juice bar', 'cafe'],
  ['clinic', 'medical', 'عيادة', 'Clinic', 'clinic'], ['salon', 'scissors', 'صالون', 'Salon', 'service'], ['laundry', 'basket', 'مغسلة وخدمات', 'Laundry & services', 'service'],
];
const ERR = {
  ai_not_configured: ['القراءة الذكية غير مفعلة بعد. استخدم المنيو النموذجي أو أضف أصنافك بنفسك.', 'Smart reading is not enabled yet. Use the sample menu or add items yourself.'],
  ai_daily_limit: ['وصلت حد اليوم (10 محاولات). جرّب بكرة أو أضف الأصناف يدويًا.', 'You reached today’s limit (10 tries). Try tomorrow or add items by hand.'],
  ai_no_items: ['ما لقينا أصناف واضحة. جرّب صورة أوضح أو اكتب المنيو كنص.', 'We could not find clear items. Try a sharper photo or type the menu as text.'],
  ai_unreadable: ['ما قدرنا نقرأ الملف. جرّب صورة أوضح أو ملف آخر.', 'We could not read that file. Try a sharper photo or another file.'],
  ai_busy: ['الخدمة مشغولة الحين. حاول بعد دقيقة.', 'The service is busy. Try again in a minute.'],
  file_too_large: ['الملف كبير. الحد 9 ميجا للـ PDF و5 ميجا للصورة.', 'File too large. Up to 9 MB for PDF and 5 MB for a photo.'],
  invalid_url: ['الرابط لازم يبدأ بـ https ويكون صفحة عامة.', 'The link must start with https and be a public page.'],
  link_unreachable: ['ما قدرنا نفتح الرابط.', 'We could not open that link.'],
  link_not_a_page: ['الرابط مو صفحة نصية. جرّب رابط صفحة المنيو.', 'That link is not a web page. Try the menu page link.'],
  request_too_large: ['الملف كبير جدًا.', 'The file is too large.'],
};
const errText = (e) => { const k = e?.data?.error; return ERR[k] ? a(...ERR[k]) : a('صار خطأ. حاول مرة ثانية.', 'Something went wrong. Please try again.'); };

// Reads a file as base64; photos are first resized so they upload quickly.
async function fileData(file) {
  let blob = file, type = file.type;
  if (type.startsWith('image/')) {
    try {
      const url = URL.createObjectURL(file);
      const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; });
      const scale = Math.min(1, 2200 / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale); canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      const out = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.88));
      if (out) { blob = out; type = 'image/jpeg'; }
    } catch { /* send the original; the server checks it */ }
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 16384) bin += String.fromCharCode(...bytes.subarray(i, i + 16384));
  return { kind: type === 'application/pdf' ? 'pdf' : 'image', media_type: type, data: btoa(bin) };
}

// The shared AI import panel. Calls onSaved(count) after the owner saves the reviewed draft.
export function aiImportPanel(el, { enabled, onSaved } = {}) {
  let mode = 'photo', rows = [];
  if (!enabled) {
    el.innerHTML = `<div class="ai-box off"><h3>${icon("sparkles")} ${a('صوّر منيوك ونبنيه لك', 'Snap your menu and we build it')}</h3><p class="small muted">${a('القراءة الذكية للصور والـ PDF بتتفعل قريب في حسابك.', 'Smart reading for photos and PDFs is coming to your account soon.')}</p></div>`;
    return;
  }
  const modes = [['photo', a('صورة', 'Photo')], ['pdf', 'PDF'], ['link', a('رابط', 'Link')], ['text', a('نص أو وصف', 'Text or description')]];
  function render() {
    el.innerHTML = `<div class="ai-box"><h3>${icon("sparkles")} ${a('صوّر منيوك ونبنيه لك', 'Snap your menu and we build it')}</h3>
      <p class="small muted">${a('نقرأ الأقسام والأصناف والأسعار ونترجمها للغتين. تراجعها قبل الحفظ.', 'We read sections, items and prices and fill both languages. You review before saving.')}</p>
      <div class="seg" role="tablist">${modes.map(([k, t]) => `<button type="button" role="tab" aria-selected="${k === mode}" data-mode="${k}">${t}</button>`).join('')}</div>
      <div class="stack" id="ai-input">${mode === 'photo' ? `<label class="btn ghost upload-btn"><input type="file" accept="image/*" capture="environment" class="visually-hidden" id="ai-file">${icon("camera")} ${a('صوّر المنيو أو اختر صورة', 'Take or choose a photo')}</label>`
        : mode === 'pdf' ? `<label class="btn ghost upload-btn"><input type="file" accept="application/pdf" class="visually-hidden" id="ai-file">${icon("file")} ${a('اختر ملف PDF', 'Choose a PDF')}</label>`
        : mode === 'link' ? `<label for="ai-url">${a('رابط صفحة المنيو', 'Menu page link')}</label><div class="row"><input id="ai-url" dir="ltr" inputmode="url" placeholder="https://"><button type="button" class="btn" id="ai-go">${a('اقرأ', 'Read')}</button></div>`
        : `<label for="ai-text">${a('الصق المنيو أو صف نشاطك', 'Paste your menu or describe your business')}</label><textarea id="ai-text" rows="5" maxlength="20000" placeholder="${a('مثال: مقهى مختص في حائل، نقدم قهوة مختصة وحلويات… أو الصق الأصناف والأسعار', 'e.g. A specialty café in Hail with coffee and desserts… or paste items and prices')}"></textarea><button type="button" class="btn" id="ai-go">${a('ابنِ المنيو', 'Build the menu')}</button>`}</div>
      <div id="ai-status" role="status" aria-live="polite"></div><div id="ai-review"></div></div>`;
    el.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => { mode = b.dataset.mode; render(); }));
    el.querySelector('#ai-file')?.addEventListener('change', async (e) => { const f = e.target.files[0]; if (f) run(await fileData(f)); });
    el.querySelector('#ai-go')?.addEventListener('click', () => run(mode === 'link' ? { kind: 'link', url: el.querySelector('#ai-url').value.trim() } : { kind: 'text', text: el.querySelector('#ai-text').value }));
  }
  const status = (html) => { el.querySelector('#ai-status').innerHTML = html; };
  async function run(payload) {
    status(`<p class="msg"><span class="spinner" aria-hidden="true"></span> ${a('نقرأ منيوك… عادة ياخذ أقل من دقيقة.', 'Reading your menu… usually under a minute.')}</p>`);
    el.querySelectorAll('button,input,textarea').forEach((x) => (x.disabled = true));
    try {
      const d = await api('/api/owner/menu/ai-import', { method: 'POST', body: payload, timeout: 180000 });
      rows = d.rows;
      status(`<p class="msg">${a(`لقينا ${rows.length} صنف. راجعها وعدّل اللي تبي، بعدين احفظ.`, `Found ${rows.length} items. Review, edit, then save.`)} <span class="small muted">${a(`باقي لك اليوم ${d.remaining} محاولة.`, `${d.remaining} tries left today.`)}</span></p>`);
      review();
    } catch (e) { status(`<p class="msg error">${esc(errText(e))}</p>`); }
    finally { el.querySelectorAll('.ai-box > .seg button, #ai-input button, #ai-input input, #ai-input textarea').forEach((x) => (x.disabled = false)); }
  }
  function review() {
    const box = el.querySelector('#ai-review');
    box.innerHTML = `<div class="table-scroll"><table class="ai-table"><thead><tr><th>${a('القسم', 'Section')}</th><th>${a('الاسم بالعربي', 'Arabic name')}</th><th>${a('بالإنجليزي', 'English name')}</th><th>${a('السعر', 'Price')}</th><th><span class="visually-hidden">${a('حذف', 'Remove')}</span></th></tr></thead><tbody>${rows.map((r, i) => `<tr data-i="${i}"><td><input aria-label="${a('القسم', 'Section')}" data-f="category_ar" value="${esc(r.category_ar)}"></td><td><input aria-label="${a('الاسم بالعربي', 'Arabic name')}" data-f="name_ar" value="${esc(r.name_ar)}"></td><td><input aria-label="${a('الاسم بالإنجليزي', 'English name')}" dir="ltr" data-f="name_en" value="${esc(r.name_en)}"></td><td><input aria-label="${a('السعر', 'Price')}" class="${r.price === '' ? 'invalid' : ''}" inputmode="decimal" dir="ltr" data-f="price" value="${esc(r.price)}" placeholder="${a('مطلوب', 'Required')}"></td><td><button type="button" class="btn ghost sm" data-del="${i}" aria-label="${a('احذف الصنف', 'Remove item')}">${icon("close",18)}</button></td></tr>`).join('')}</tbody></table></div>
      <div class="row"><button type="button" class="btn" id="ai-save">${a(`احفظ ${rows.length} صنف في المنيو`, `Save ${rows.length} items to the menu`)}</button></div><div id="ai-save-msg" role="status"></div>`;
    box.querySelectorAll('input[data-f]').forEach((inp) => inp.addEventListener('input', () => {
      const r = rows[inp.closest('tr').dataset.i];
      r[inp.dataset.f] = inp.value.trim();
      if (inp.dataset.f === 'category_ar' && !r._en_set) r.category_en = r.category_en || inp.value.trim();
      if (inp.dataset.f === 'price') inp.classList.toggle('invalid', !/^\d{1,6}(\.\d{1,2})?$/.test(inp.value.trim()));
    }));
    box.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => { rows.splice(Number(b.dataset.del), 1); review(); }));
    const key = crypto.randomUUID();
    box.querySelector('#ai-save').onclick = async (e) => {
      const msg = box.querySelector('#ai-save-msg');
      if (rows.some((r) => !/^\d{1,6}(\.\d{1,2})?$/.test(String(r.price)))) { msg.innerHTML = `<p class="msg error">${a('كمّل الأسعار الناقصة (المظللة بالأحمر).', 'Fill in the missing prices (marked red).')}</p>`; return; }
      e.target.disabled = true;
      try {
        const d = await api('/api/owner/menu/import/apply', { method: 'POST', body: { rows: rows.map(({ _en_set, ...r }) => r), idem_key: key } });
        msg.innerHTML = `<p class="msg">${a(`تمت إضافة ${d.imported} صنف ✓`, `${d.imported} items added ✓`)}</p>`;
        announce(a('تم حفظ المنيو.', 'Menu saved.'));
        onSaved?.(d.imported);
      } catch (err) {
        e.target.disabled = false;
        const errs = err?.data?.errors;
        msg.innerHTML = `<p class="msg error">${errs?.length ? a(`في ${errs.length} خانة تحتاج تصحيح (الاسم أو السعر).`, `${errs.length} fields need fixing (name or price).`) : esc(errText(err))}</p>`;
      }
    };
  }
  render();
}

// ---------- The wizard ----------
export async function magicStart(me, { onClose } = {}) {
  const [{ profile }, design, branches, config, menu] = await Promise.all([
    api('/api/owner/profile'), api('/api/owner/design'), api('/api/owner/branches'), api('/api/config'), api('/api/owner/menu'),
  ]);
  const branch = branches.branches?.[0];
  const menuUrl = branch ? `${location.origin}/m/${branch.slug}` : `${location.origin}/p/${me.org.slug}`;
  const previewUrl = branch ? `/m/${encodeURIComponent(branch.slug)}?design_preview=1` : `/p/${encodeURIComponent(me.org.slug)}?design_preview=1`;
  let step = 0, trade = TRADES.find((t) => t[4] === profile.sector)?.[0] || 'cafe', itemCount = menu.items.length;
  let chosen = design.preset_id;
  let chosenColor = (design.owns_appearance || design.revision > 0 ? design.draft.colors.primary : me.org.brand_color) || '#3b2a6b';
  const stripDerived = ({ derived: _derived, ...recipe }) => recipe;
  const previewRecipe = () => {
    const preset = design.presets.find(p => p.id === chosen);
    if (!preset) return null;
    const recipe = structuredClone(preset.recipe);
    // Match preset application: keep the merchant's copy and menu choices.
    if (design.owns_appearance || design.revision > 0) {
      if (design.draft.home.enabled) recipe.home = structuredClone(design.draft.home);
      recipe.menu = structuredClone(design.draft.menu);
    }
    recipe.colors.primary = chosenColor;
    return recipe;
  };
  const dlg = document.createElement('dialog');
  dlg.className = 'app-dialog magic';
  dlg.setAttribute('aria-labelledby', 'magic-title');
  document.body.append(dlg);
  const titles = [a('وش نشاطك؟', 'What do you do?'), a('هويتك', 'Your brand'), a('اختر تصميمك', 'Pick your design'), a('منيوك', 'Your menu'), a('جاهز! ', 'You are live! ')];
  const sendPreview = (recipe) => dlg.querySelector('#mg-frame')?.contentWindow?.postMessage({ type: 'zm-design', recipe }, location.origin);
  const onMsg = (e) => { if (e.origin === location.origin && e.source === dlg.querySelector('#mg-frame')?.contentWindow && e.data?.type === 'zm-design-ready') { const recipe = previewRecipe(); if (recipe) sendPreview(recipe); } };
  window.addEventListener('message', onMsg);
  dlg.addEventListener('close', () => { window.removeEventListener('message', onMsg); dlg.remove(); onClose?.(); });

  function frame(inner, { back = true, next = true, nextLabel } = {}) {
    dlg.innerHTML = `<div class="magic-head"><span class="eyebrow">${a('البداية السحرية', 'MAGIC START')} · ${step + 1}/5</span><button type="button" class="btn ghost sm" id="mg-x" aria-label="${a('إغلاق', 'Close')}">${icon("close",18)}</button></div>
      <div class="progress" role="progressbar" aria-valuemin="1" aria-valuemax="5" aria-valuenow="${step + 1}"><span style="width:${(step + 1) * 20}%"></span></div>
      <h2 id="magic-title">${titles[step]}</h2><div class="stack" id="mg-body">${inner}</div><div id="mg-msg" role="status"></div>
      <div class="row magic-foot">${back && step ? `<button type="button" class="btn ghost" id="mg-back">${a('رجوع', 'Back')}</button>` : '<span></span>'}${next ? `<button type="button" class="btn" id="mg-next">${nextLabel || a('التالي', 'Next')}</button>` : ''}</div>`;
    dlg.querySelector('#mg-x').onclick = () => dlg.close();
    dlg.querySelector('#mg-back')?.addEventListener('click', () => { step--; show(); });
  }
  const fail = (e) => { dlg.querySelector('#mg-msg').innerHTML = `<p class="msg error">${esc(errText(e))}</p>`; };
  const advance = async (btn, work) => { btn.disabled = true; try { await work(); step++; show(); } catch (e) { btn.disabled = false; fail(e); } };

  function show() {
    if (step === 0) {
      frame(`<p class="muted">${a('نختار لك تصاميم وأمثلة تناسب نشاطك.', 'We suggest designs and examples that fit your trade.')}</p><div class="trade-grid" role="radiogroup">${TRADES.map(([k, ic, ar, en]) => `<label class="trade ${k === trade ? 'on' : ''}"><input type="radio" name="trade" value="${k}" ${k === trade ? 'checked' : ''}><span aria-hidden="true">${icon(ic, 24)}</span>${a(ar, en)}</label>`).join('')}</div>`);
      dlg.querySelectorAll('[name=trade]').forEach((r) => r.addEventListener('change', () => { trade = r.value; dlg.querySelectorAll('.trade').forEach((l) => l.classList.toggle('on', l.querySelector('input').checked)); }));
      dlg.querySelector('#mg-next').onclick = (e) => advance(e.target, () => api('/api/owner/profile', { method: 'PATCH', body: { sector: TRADES.find((t) => t[0] === trade)[4] } }));
    } else if (step === 1) {
      frame(`<div class="row"><div><label for="mg-ar">${a('الاسم بالعربي', 'Arabic name')}</label><input id="mg-ar" maxlength="80" value="${esc(me.org.name_ar)}"></div><div><label for="mg-en">${a('الاسم بالإنجليزي', 'English name')}</label><input id="mg-en" dir="ltr" maxlength="80" value="${esc(me.org.name_en)}"></div></div>
        ${imageField('logo_url', a('شعارك', 'Your logo'), me.org.logo_url || '', 'mg')}
        <label class="color-row"><input type="color" id="mg-color" value="${esc(chosenColor)}"><span>${a('لونك الأساسي', 'Your main colour')}</span></label>`);
      wireImageFields(dlg);
      dlg.querySelector('#mg-color').addEventListener('input', e => { chosenColor = e.target.value; });
      dlg.querySelector('#mg-next').onclick = (e) => advance(e.target, async () => {
        const body = { name_ar: dlg.querySelector('#mg-ar').value.trim(), name_en: dlg.querySelector('#mg-en').value.trim(), logo_url: dlg.querySelector('#mg-logo_url').value.trim() || null };
        chosenColor = dlg.querySelector('#mg-color').value;
        await api('/api/owner/org', { method: 'PATCH', body });
        Object.assign(me.org, body);
      });
    } else if (step === 2) {
      const sector = trade === 'laundry' ? 'laundry' : trade;
      const picks = design.presets.filter((p) => p.sector === sector).slice(0, 4).concat(design.presets.filter((p) => p.sector !== sector && p.sector !== 'seasonal').slice(0, 2));
      if (!chosen || !picks.some((p) => p.id === chosen)) chosen = picks[0]?.id;
      frame(`<div class="magic-design"><div class="design-grid">${picks.map((p) => miniCard(p, p.id === chosen)).join('')}</div><div class="phone-frame small"><iframe id="mg-frame" title="${a('معاينة', 'Preview')}" src="${esc(previewUrl)}"></iframe></div></div><p class="small muted">${a('تقدر تغيّر كل شي بعدين من «استوديو التصميم» (100 تصميم).', 'Change anything later in the Design studio (100 designs).')}</p>`, { nextLabel: a('اعتمد وانشر', 'Use and publish') });
      const grid = dlg.querySelector('.magic-design .design-grid');
      const bind = () => grid.querySelectorAll('[data-try],[data-use]').forEach((b) => (b.onclick = () => {
        chosen = b.dataset.try || b.dataset.use;
        sendPreview(previewRecipe());
        grid.innerHTML = picks.map((p) => miniCard(p, p.id === chosen)).join('');
        bind();
      }));
      bind();
      dlg.querySelector('#mg-next').onclick = (e) => advance(e.target, async () => {
        const applied = await api('/api/owner/design/presets/' + encodeURIComponent(chosen) + '/apply', { method: 'POST', body: { revision: design.revision } });
        Object.assign(design, applied, { owns_appearance: true, preset_id: chosen });
        const recipe = stripDerived(applied.draft);
        recipe.colors = { ...recipe.colors, primary: chosenColor };
        const saved = await api('/api/owner/design/draft', { method: 'PUT', body: { recipe, revision: design.revision } });
        Object.assign(design, saved);
        const published = await api('/api/owner/design/publish', { method: 'POST', body: { revision: design.revision } });
        Object.assign(design, published, { published: structuredClone(stripDerived(saved.draft)), owns_appearance: true, has_unpublished: false });
      });
    } else if (step === 3) {
      frame(`${itemCount ? `<p class="msg">${a(`منيوك فيه ${itemCount} صنف ✓. تقدر تضيف أكثر أو تكمل.`, `Your menu has ${itemCount} items ✓. Add more or continue.`)}</p>` : ''}
        <div id="mg-ai"></div>
        <div class="magic-alt"><p class="small muted">${a('أو', 'Or')}</p><div class="row">${itemCount ? '' : `<button type="button" class="btn ghost" id="mg-sample">${a('ابدأ بمنيو نموذجي', 'Start with a sample menu')}</button>`}<a class="btn ghost" href="#menu" id="mg-manual">${a('أضيف أصنافي بنفسي', 'I will add items myself')}</a></div></div>`, { nextLabel: itemCount ? a('التالي', 'Next') : a('تخطَّ الحين', 'Skip for now') });
      aiImportPanel(dlg.querySelector('#mg-ai'), { enabled: config.ai_import, onSaved: (n) => { itemCount += n; setTimeout(() => { step++; show(); }, 900); } });
      dlg.querySelector('#mg-sample')?.addEventListener('click', (e) => advance(e.target, async () => { const r = await api('/api/owner/menu/sample', { method: 'POST', body: {} }); itemCount += r.items || 0; }));
      dlg.querySelector('#mg-manual').onclick = () => dlg.close();
      dlg.querySelector('#mg-next').onclick = () => { step++; show(); };
    } else {
      frame(`<p>${a('منيوك منشور بتصميمه. اطبع الكود وحطه على الطاولات أو الكاشير.', 'Your menu is live with its design. Print the code for tables or the counter.')}</p>
        <div class="magic-done"><div class="share-qr">${qrSvg(menuUrl, 5)}</div><div class="stack"><a class="btn" href="${esc(menuUrl)}" target="_blank" rel="noopener">${a('افتح منيوك', 'Open your menu')} ${icon("arrowUpRight")}</a><button type="button" class="btn ghost" id="mg-print">${a('اطبع الكود', 'Print the code')}</button><p class="small muted" dir="ltr">${esc(menuUrl)}</p>${itemCount ? `<p class="small">${a(`${itemCount} صنف في منيوك`, `${itemCount} items on your menu`)}</p>` : ''}</div></div>
        <p class="small muted">${a('الخطوة الجاية: أضف صور الأصناف وأوقات العمل من لوحة التحكم. نسبة التجهيز تظهر لك بالنظرة العامة.', 'Next: add item photos and opening hours. Your setup score is on the overview.')}</p>`, { back: false, nextLabel: a('خلصنا', 'Done') });
      dlg.querySelector('#mg-print').onclick = () => { const w = window.open('', '_blank'); if (!w) return; w.document.write(`<!doctype html><meta charset="utf-8"><title>QR</title><body style="display:grid;place-items:center;min-height:95vh;font-family:system-ui;text-align:center"><div><h1>${esc(lang === 'ar' ? me.org.name_ar : me.org.name_en)}</h1>${qrSvg(menuUrl, 8)}<p>${a('امسح الكود لعرض المنيو', 'Scan to view the menu')}</p></div>`); w.document.close(); w.focus(); w.print(); };
      dlg.querySelector('#mg-next').onclick = () => dlg.close();
    }
    dlg.querySelector('h2')?.focus?.();
  }
  show();
  dlg.showModal();
}
