// Owner design studio: 100 ready designs, a step-by-step editor with a live phone
// preview, draft and publish, saved versions and scheduled seasonal designs.
import { api, esc, lang, pick } from './common.js';
const a = (ar, en) => (lang === 'ar' ? ar : en);

const SECTOR = { all: ['الكل', 'All'], cafe: ['مقاهي', 'Cafés'], roastery: ['محامص', 'Roasteries'], restaurant: ['مطاعم', 'Restaurants'], burger: ['برجر وسريع', 'Burgers'], oriental: ['شعبي وشرقي', 'Arabic'], bakery: ['مخابز وحلويات', 'Bakeries'], juice: ['عصائر', 'Juice'], clinic: ['عيادات', 'Clinics'], salon: ['صالونات', 'Salons'], laundry: ['مغاسل وخدمات', 'Services'], seasonal: ['مواسم', 'Seasons'] };
const L = {
  layout: { list: ['قائمة', 'List'], cards: ['بطاقات', 'Cards'], grid: ['شبكة', 'Grid'], compact: ['مضغوط', 'Compact'], text: ['نص فقط', 'Text only'], magazine: ['مجلة', 'Magazine'], elegant: ['أنيق', 'Elegant'], tiles: ['مربعات صور', 'Photo tiles'] },
  categories: { chips: ['أزرار', 'Chips'], pills: ['كبسولات ملونة', 'Pills'], underline: ['خط سفلي', 'Underline'], boxed: ['مربعات', 'Boxed'] },
  motion: { none: ['بدون', 'None'], soft: ['ناعمة', 'Soft'], lively: ['حيوية', 'Lively'] },
  font_size: { sm: ['صغير', 'Small'], md: ['متوسط', 'Medium'], lg: ['كبير', 'Large'] },
  'background.type': { solid: ['لون واحد', 'Solid'], gradient: ['متدرج', 'Gradient'], pattern: ['نقشة', 'Pattern'], image: ['صورة', 'Image'] },
  'background.pattern': { dots: ['نقاط', 'Dots'], grid: ['مربعات', 'Grid'], arabesque: ['زخرفة عربية', 'Arabesque'], waves: ['أمواج', 'Waves'] },
  'cover.height': { none: ['بدون غلاف', 'No cover'], compact: ['صغير', 'Compact'], wide: ['عريض', 'Wide'], tall: ['كبير', 'Tall'] },
  'cover.logo_shape': { circle: ['دائري', 'Circle'], rounded: ['ناعم', 'Rounded'], square: ['مربع', 'Square'] },
  'cover.align': { start: ['جانبي', 'Side'], center: ['بالوسط', 'Centred'] },
  'card.radius': { none: ['حاد', 'Sharp'], sm: ['خفيف', 'Slight'], md: ['متوسط', 'Medium'], lg: ['ناعم', 'Soft'], xl: ['دائري جدًا', 'Round'] },
  'card.shadow': { none: ['بدون', 'None'], soft: ['خفيف', 'Soft'], strong: ['قوي', 'Strong'] },
  'card.image': { start: ['الصورة أول', 'Image first'], end: ['الصورة آخر', 'Image last'] },
  'button.shape': { square: ['مربع', 'Square'], rounded: ['ناعم', 'Rounded'], pill: ['كبسولة', 'Pill'] },
  'button.style': { flat: ['مسطح', 'Flat'], gradient: ['متدرج', 'Gradient'], glass: ['زجاجي', 'Glass'], metal: ['معدني', 'Metal'], neon: ['نيون', 'Neon'], outline: ['إطار', 'Outline'], soft3d: ['بارز', 'Raised'] },
  'button.animation': { none: ['بدون', 'None'], pulse: ['نبض', 'Pulse'], glow: ['توهج', 'Glow'], bounce: ['قفز', 'Bounce'], shine: ['لمعة', 'Shine'] },
};
const COLORS = [['primary', 'اللون الأساسي (الأزرار والسعر)', 'Main colour (buttons, prices)'], ['accent', 'اللون الثاني (التدرج واللمسات)', 'Second colour (gradients, touches)'], ['bg', 'خلفية الصفحة', 'Page background'], ['surface', 'خلفية البطاقات', 'Card background'], ['text', 'لون النص', 'Text colour']];
const SHOW = [['images', 'صور الأصناف', 'Item photos'], ['calories', 'السعرات', 'Calories'], ['descriptions', 'الأوصاف', 'Descriptions'], ['allergens', 'مسببات الحساسية', 'Allergens']];
const CAT = { modern: ['حديث', 'Modern'], classic: ['كلاسيكي', 'Classic'], decorative: ['زخرفي', 'Decorative'] };
const lbl = (pair) => a(pair[0], pair[1]);
const get = (r, path) => path.split('.').reduce((o, k) => o?.[k], r);
function put(r, path, v) { const ks = path.split('.'); let o = r; for (const k of ks.slice(0, -1)) o = o[k] ||= {}; o[ks.at(-1)] = v; }
const strip = ({ derived: _d, ...r }) => r;
const hijri = (ms) => { try { return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', { day: 'numeric', month: 'long', year: 'numeric' }).format(ms); } catch { return ''; } };
const day = (ms) => new Date(ms).toISOString().slice(0, 10);

export async function designStudio(el, me) {
  const [d, br] = await Promise.all([api('/api/owner/design'), api('/api/owner/branches').catch(() => ({ branches: [] }))]);
  const slug = br.branches?.[0]?.slug;
  const previewUrl = slug ? `/m/${encodeURIComponent(slug)}?design_preview=1` : `/p/${encodeURIComponent(me?.org?.slug || '')}?design_preview=1`;
  let recipe = strip(d.draft), tab = 'presets', sector = 'all', query = '', saveTimer = null, dirty = d.has_unpublished;

  el.innerHTML = `<div class="section-intro"><span class="eyebrow">${a('استوديو التصميم', 'DESIGN STUDIO')}</span><h2>${a('100 تصميم جاهز، وكل جزء تقدر تغيّره.', '100 ready designs, and every part is yours to change.')}</h2><p>${a('اختر تصميمًا ثم خصّصه خطوة بخطوة. تعديلاتك تنحفظ كمسودة، وما يشوفها عملاؤك إلا لما تضغط «انشر».', 'Pick a design, then tailor it step by step. Changes save as a draft and guests only see them after you publish.')}</p></div>
  <div class="studio">
    <div class="studio-panel">
      <div class="studio-bar card"><span id="st-status" class="pill" role="status"></span><div class="row"><button type="button" class="btn ghost sm" id="st-discard">${a('تجاهل المسودة', 'Discard draft')}</button><button type="button" class="btn sm" id="st-publish">${a('انشر', 'Publish')}</button></div></div>
      <div class="seg" role="tablist">${[['presets', a('التصاميم الجاهزة', 'Ready designs')], ['custom', a('خصّص بنفسك', 'Customise')], ['versions', a('النسخ والجدولة', 'Versions & schedule')]].map(([k, t]) => `<button type="button" role="tab" data-tab="${k}">${t}</button>`).join('')}</div>
      <div id="st-body"></div><div id="st-msg" role="status"></div>
    </div>
    <div class="studio-preview" aria-label="${a('معاينة مباشرة', 'Live preview')}"><div class="phone-frame"><iframe id="st-frame" title="${a('معاينة الصفحة', 'Page preview')}" src="${esc(previewUrl)}" loading="eager"></iframe></div><p class="small muted">${a('معاينة مباشرة للمسودة', 'Live preview of your draft')}</p></div>
  </div>`;
  const frame = el.querySelector('#st-frame'), bodyEl = el.querySelector('#st-body'), msg = el.querySelector('#st-msg');
  const send = (r) => frame.contentWindow?.postMessage({ type: 'zm-design', recipe: r }, location.origin);
  const onReady = (e) => { if (e.origin === location.origin && e.data?.type === 'zm-design-ready') send({ ...recipe, derived: d.draft.derived }); };
  window.addEventListener('message', onReady);
  const note = (text, err) => { msg.innerHTML = `<p class="msg ${err ? 'error' : ''}">${esc(text)}</p>`; };
  const status = () => { const s = el.querySelector('#st-status'); s.textContent = dirty ? a('مسودة غير منشورة', 'Unpublished draft') : a('منشور ✓', 'Published ✓'); s.className = 'pill ' + (dirty ? 'preparing' : 'ready'); };

  async function save() {
    try {
      const r = await api('/api/owner/design/draft', { method: 'PUT', body: { recipe } });
      recipe = strip(r.draft); dirty = true; status(); send(r.draft);
      if (r.adjusted.length) { note(a('عدّلنا لون النص تلقائيًا عشان يكون واضح للقراءة.', 'We adjusted the text colour so it stays readable.')); if (tab === 'custom') render(); }
    } catch { note(a('تعذر حفظ المسودة. حاول مجددًا.', 'Could not save the draft. Try again.'), true); }
  }
  function change(path, v) {
    put(recipe, path, v); send(recipe); dirty = true; status();
    clearTimeout(saveTimer); saveTimer = setTimeout(save, 600);
  }

  function presetsView() {
    const list = d.presets.filter((p) => (sector === 'all' || p.sector === sector) && (!query || (p.name_ar + ' ' + p.name_en).toLowerCase().includes(query.toLowerCase())));
    bodyEl.innerHTML = `<div class="row"><label class="visually-hidden" for="st-q">${a('ابحث', 'Search')}</label><input id="st-q" type="search" placeholder="${a('ابحث عن تصميم…', 'Search designs…')}" value="${esc(query)}"></div>
    <div class="chip-row" role="group" aria-label="${a('النشاط', 'Trade')}">${Object.keys(SECTOR).map((k) => `<button type="button" class="chip ${k === sector ? 'on' : ''}" data-sector="${k}">${lbl(SECTOR[k])} <small>${k === 'all' ? d.presets.length : d.presets.filter((p) => p.sector === k).length}</small></button>`).join('')}</div>
    <div class="design-grid">${list.map((p) => miniCard(p, p.id === d.preset_id)).join('') || `<p class="muted">${a('ما في نتائج.', 'No results.')}</p>`}</div>`;
    bodyEl.querySelector('#st-q').oninput = (e) => { query = e.target.value; const pos = e.target.selectionStart; presetsView(); const q = bodyEl.querySelector('#st-q'); q.focus(); q.setSelectionRange(pos, pos); };
    bodyEl.querySelectorAll('[data-sector]').forEach((b) => (b.onclick = () => { sector = b.dataset.sector; presetsView(); }));
    bodyEl.querySelectorAll('[data-try]').forEach((b) => (b.onclick = () => { const p = d.presets.find((x) => x.id === b.dataset.try); send(p.recipe); note(a(`تشوف «${p.name_ar}» بالمعاينة. اضغط «اعتمد» لو عجبك.`, `Previewing “${p.name_en}”. Tap “Use” if you like it.`)); }));
    bodyEl.querySelectorAll('[data-use]').forEach((b) => (b.onclick = async () => {
      b.disabled = true;
      try { const r = await api('/api/owner/design/presets/' + b.dataset.use + '/apply', { method: 'POST', body: {} }); recipe = strip(r.draft); d.preset_id = b.dataset.use; dirty = true; status(); send(r.draft); presetsView(); note(a('اعتمدنا التصميم كمسودة. خصّصه أو اضغط «انشر».', 'Design set as your draft. Customise it or publish.')); }
      catch { b.disabled = false; note(a('تعذر تطبيق التصميم.', 'Could not apply the design.'), true); }
    }));
  }

  function radios(path) {
    const cur = get(recipe, path), labels = L[path];
    return `<div class="opt-grid" role="radiogroup">${Object.keys(labels).map((v) => `<label class="opt ${v === cur ? 'on' : ''}"><input type="radio" name="${esc(path)}" value="${esc(v)}" ${v === cur ? 'checked' : ''} data-path="${esc(path)}"><span>${lbl(labels[v])}</span></label>`).join('')}</div>`;
  }
  const fontSelect = (key, fonts) => `<select id="st-${key}" data-path="${key}">${Object.keys(CAT).map((cat) => `<optgroup label="${lbl(CAT[cat])} (${fonts.filter((f) => f.category === cat).length})">${fonts.filter((f) => f.category === cat).map((f) => `<option value="${esc(f.id)}" ${recipe[key] === f.id ? 'selected' : ''}>${esc(f.family)}</option>`).join('')}</optgroup>`).join('')}</select>`;
  const step = (n, title, inner, open) => `<details class="card studio-step" ${open ? 'open' : ''}><summary><span class="step-n">${n}</span>${title}</summary><div class="stack">${inner}</div></details>`;

  function customView() {
    const bg = recipe.background;
    bodyEl.innerHTML = [
      step(1, a('الألوان', 'Colours'), COLORS.map(([k, ar, en]) => `<label class="color-row"><input type="color" value="${esc(recipe.colors[k])}" data-path="colors.${k}"><span>${a(ar, en)}</span><code dir="ltr">${esc(recipe.colors[k])}</code></label>`).join('') + `<p class="small muted">${a('نتأكد تلقائيًا إن النص واضح على الخلفية.', 'We automatically keep text readable on the background.')}</p>`, true),
      step(2, a('الخطوط', 'Fonts'), `<label for="st-font_ar">${a('الخط العربي', 'Arabic font')} (${d.fonts.ar.length})</label>${fontSelect('font_ar', d.fonts.ar)}<label for="st-font_en">${a('الخط الإنجليزي', 'English font')} (${d.fonts.en.length})</label>${fontSelect('font_en', d.fonts.en)}<p class="small">${a('حجم الخط', 'Text size')}</p>${radios('font_size')}`),
      step(3, a('الخلفية', 'Background'), radios('background.type') + (bg.type === 'pattern' ? radios('background.pattern') : '') + (bg.type === 'gradient' ? `<label>${a('اتجاه التدرج', 'Gradient angle')} <input type="range" min="0" max="360" step="15" value="${bg.angle}" data-path="background.angle" data-int></label>` : '') + (bg.type === 'image' ? `<label for="st-img">${a('رابط الصورة (https)', 'Image link (https)')}</label><input id="st-img" dir="ltr" inputmode="url" placeholder="https://…" value="${esc(bg.image || '')}" data-path="background.image"><label>${a('ضبابية', 'Blur')} <input type="range" min="0" max="20" value="${bg.blur}" data-path="background.blur" data-int></label>` : '')),
      step(4, a('الغلاف والشعار', 'Cover & logo'), `<p class="small">${a('ارتفاع الغلاف', 'Cover height')}</p>${radios('cover.height')}<p class="small">${a('شكل الشعار', 'Logo shape')}</p>${radios('cover.logo_shape')}<p class="small">${a('مكان الاسم والشعار', 'Name & logo position')}</p>${radios('cover.align')}<label class="check"><input type="checkbox" data-path="cover.logo_shadow" ${recipe.cover.logo_shadow ? 'checked' : ''}> ${a('ظل للشعار', 'Logo shadow')}</label>`),
      step(5, a('تخطيط المنيو', 'Menu layout'), radios('layout')),
      step(6, a('شكل الأقسام', 'Section tabs'), radios('categories')),
      step(7, a('بطاقة الصنف', 'Item card'), `<p class="small">${a('الزوايا', 'Corners')}</p>${radios('card.radius')}<p class="small">${a('الظل', 'Shadow')}</p>${radios('card.shadow')}<p class="small">${a('مكان الصورة', 'Image position')}</p>${radios('card.image')}<label class="check"><input type="checkbox" data-path="card.border" ${recipe.card.border ? 'checked' : ''}> ${a('إطار حول البطاقة', 'Card border')}</label>`),
      step(8, a('الأزرار', 'Buttons'), `<p class="small">${a('الشكل', 'Shape')}</p>${radios('button.shape')}<p class="small">${a('الملمس', 'Texture')}</p>${radios('button.style')}<p class="small">${a('الحركة', 'Animation')}</p>${radios('button.animation')}`),
      step(9, a('حركة الصفحة', 'Page motion'), radios('motion') + `<p class="small muted">${a('لو جوال العميل مفعّل «تقليل الحركة» نوقف الحركات تلقائيًا.', 'If the guest’s phone has Reduce Motion on, animations stop automatically.')}</p>`),
      step(10, a('وش يظهر', 'What to show'), SHOW.map(([k, ar, en]) => `<label class="check"><input type="checkbox" data-path="show.${k}" ${recipe.show[k] ? 'checked' : ''}> ${a(ar, en)}</label>`).join('')),
    ].join('');
    bodyEl.querySelectorAll('[data-path]').forEach((inp) => {
      const path = inp.dataset.path;
      const ev = inp.type === 'color' || inp.type === 'range' || inp.tagName === 'INPUT' && inp.type !== 'checkbox' && inp.type !== 'radio' ? 'input' : 'change';
      inp.addEventListener(ev, () => {
        let v = inp.type === 'checkbox' ? inp.checked : inp.value;
        if (inp.dataset.int !== undefined) v = Number(v);
        if (path === 'background.image') { v = v.trim() || null; if (v && !/^https:\/\/[^\s"'()\\<>]+$/.test(v)) return; }
        if (inp.type === 'color') inp.parentElement.querySelector('code').textContent = v;
        change(path, v);
        if (inp.type === 'radio') { inp.closest('.opt-grid').querySelectorAll('.opt').forEach((o) => o.classList.toggle('on', o.querySelector('input').checked)); if (path === 'background.type') customView(); }
      });
    });
  }

  function versionsView() {
    const named = d.versions.filter((v) => !v.auto), auto = d.versions.filter((v) => v.auto);
    bodyEl.innerHTML = `<section class="card stack"><h3>${a('احفظ نسخة من تصميمك', 'Save a version of your design')}</h3><p class="small muted">${a(`تقدر تحفظ لين ${d.limits.named_versions} نسخة بأسماء، مثل «رمضان» أو «اليوم الوطني».`, `Keep up to ${d.limits.named_versions} named versions, like “Ramadan” or “National Day”.`)}</p><form class="row" id="st-vform"><label class="visually-hidden" for="st-vname">${a('اسم النسخة', 'Version name')}</label><input id="st-vname" maxlength="40" placeholder="${a('مثال: رمضان', 'e.g. Ramadan')}" required><button class="btn" type="submit">${a('احفظ النسخة', 'Save version')}</button></form>
      ${named.length ? `<ul class="plain-list">${named.map((v) => `<li class="row-between"><span><strong>${esc(v.name)}</strong> <small class="muted">${esc(new Date(v.created_at).toLocaleDateString(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB'))}</small></span><span class="row"><button type="button" class="btn ghost sm" data-restore="${esc(v.id)}">${a('استرجع', 'Restore')}</button><button type="button" class="btn ghost sm" data-del="${esc(v.id)}">${a('احذف', 'Delete')}</button></span></li>`).join('')}</ul>` : ''}</section>
    <section class="card stack"><h3>${a('جدولة تصميم', 'Schedule a design')}</h3><p class="small muted">${a('التصميم يتغير لحاله في الوقت اللي تحدده، ويرجع بعدها لتصميمك المنشور.', 'The design switches by itself on the dates you set, then returns to your published design.')}</p>
      ${named.length ? `<form class="stack" id="st-sform"><label for="st-sv">${a('النسخة', 'Version')}</label><select id="st-sv">${named.map((v) => `<option value="${esc(v.id)}">${esc(v.name)}</option>`).join('')}</select><div class="row"><label>${a('من', 'From')} <input type="date" id="st-from" required></label><label>${a('إلى', 'To')} <input type="date" id="st-to" required></label></div><p class="small muted" id="st-hijri"></p><button class="btn" type="submit">${a('أضف الجدولة', 'Add schedule')}</button></form>` : `<p class="muted">${a('احفظ نسخة أولًا عشان تجدولها.', 'Save a version first to schedule it.')}</p>`}
      ${d.schedules.length ? `<ul class="plain-list">${d.schedules.map((s) => `<li class="row-between"><span><strong>${esc(s.name)}</strong><br><small class="muted">${esc(day(s.starts_at))} ← ${esc(day(s.ends_at))} · ${esc(hijri(s.starts_at))}</small></span><button type="button" class="btn ghost sm" data-unsched="${esc(s.id)}">${a('إلغاء', 'Cancel')}</button></li>`).join('')}</ul>` : ''}</section>
    <section class="card stack"><h3>${a('نسخ تلقائية', 'Automatic snapshots')}</h3><p class="small muted">${a(`نحفظ نسخة تلقائيًا قبل كل نشر أو تطبيق تصميم، وتبقى ${d.limits.auto_days} يوم.`, `We save a snapshot before every publish or design change, kept for ${d.limits.auto_days} days.`)}</p>
      ${auto.length ? `<ul class="plain-list">${auto.slice(0, 15).map((v) => `<li class="row-between"><span>${esc(v.name)} <small class="muted">${esc(new Date(v.created_at).toLocaleString(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB'))}</small></span><button type="button" class="btn ghost sm" data-restore="${esc(v.id)}">${a('استرجع', 'Restore')}</button></li>`).join('')}</ul>` : `<p class="muted">${a('ما في نسخ تلقائية بعد.', 'No snapshots yet.')}</p>`}</section>`;
    const reload = async () => { Object.assign(d, await api('/api/owner/design')); recipe = strip(d.draft); dirty = d.has_unpublished; status(); send(d.draft); versionsView(); };
    const ERR = { versions_limit: a('وصلت الحد الأعلى للنسخ. احذف نسخة قديمة.', 'Version limit reached. Delete an old one.'), schedule_overlap: a('فيه جدولة ثانية بنفس الفترة.', 'Another schedule overlaps these dates.'), schedules_limit: a('وصلت الحد الأعلى للجداول.', 'Schedule limit reached.'), schedule_too_long: a('أقصى مدة للجدولة 120 يوم.', 'A schedule can last at most 120 days.'), version_in_use_or_missing: a('النسخة مستخدمة في جدولة.', 'This version is used by a schedule.') };
    const fail = (err) => note(ERR[err?.message] || a('تعذر تنفيذ الإجراء.', 'Could not complete the action.'), true);
    bodyEl.querySelector('#st-vform').onsubmit = async (e) => { e.preventDefault(); try { clearTimeout(saveTimer); await save(); await api('/api/owner/design/versions', { method: 'POST', body: { name: bodyEl.querySelector('#st-vname').value } }); await reload(); note(a('حفظنا النسخة.', 'Version saved.')); } catch (err) { fail(err); } };
    const from = bodyEl.querySelector('#st-from'), to = bodyEl.querySelector('#st-to'), hj = bodyEl.querySelector('#st-hijri');
    const showHijri = () => { if (hj) hj.textContent = from?.value && to?.value ? `${a('بالهجري:', 'Hijri:')} ${hijri(new Date(from.value).getTime())} ← ${hijri(new Date(to.value).getTime())}` : ''; };
    from?.addEventListener('change', showHijri); to?.addEventListener('change', showHijri);
    const sform = bodyEl.querySelector('#st-sform');
    if (sform) sform.onsubmit = async (e) => {
      e.preventDefault();
      const starts = new Date(from.value + 'T00:00:00+03:00').getTime(), ends = new Date(to.value + 'T23:59:59+03:00').getTime();
      try { await api('/api/owner/design/schedules', { method: 'POST', body: { version_id: bodyEl.querySelector('#st-sv').value, starts_at: starts, ends_at: ends } }); await reload(); note(a('تمت الجدولة.', 'Scheduled.')); } catch (err) { fail(err); }
    };
    bodyEl.querySelectorAll('[data-restore]').forEach((b) => (b.onclick = async () => { try { await api(`/api/owner/design/versions/${b.dataset.restore}/restore`, { method: 'POST', body: {} }); await reload(); note(a('رجعنا النسخة كمسودة. اضغط «انشر» لو تبيها.', 'Version restored as your draft. Publish when ready.')); } catch (err) { fail(err); } }));
    bodyEl.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => { if (!confirm(a('حذف النسخة؟', 'Delete this version?'))) return; try { await api('/api/owner/design/versions/' + b.dataset.del, { method: 'DELETE', body: {} }); await reload(); } catch (err) { fail(err); } }));
    bodyEl.querySelectorAll('[data-unsched]').forEach((b) => (b.onclick = async () => { try { await api('/api/owner/design/schedules/' + b.dataset.unsched, { method: 'DELETE', body: {} }); await reload(); } catch (err) { fail(err); } }));
  }

  function render() {
    el.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    msg.innerHTML = '';
    ({ presets: presetsView, custom: customView, versions: versionsView })[tab]();
  }
  el.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { tab = b.dataset.tab; render(); }));
  el.querySelector('#st-publish').onclick = async (e) => {
    e.target.disabled = true;
    try { clearTimeout(saveTimer); await save(); await api('/api/owner/design/publish', { method: 'POST', body: {} }); dirty = false; status(); note(a('نشرنا تصميمك. عملاؤك يشوفونه الحين.', 'Published. Guests see your new design now.')); }
    catch { note(a('تعذر النشر. حاول مجددًا.', 'Could not publish. Try again.'), true); }
    e.target.disabled = false;
  };
  el.querySelector('#st-discard').onclick = async () => {
    if (!d.published) return note(a('ما في تصميم منشور ترجع له.', 'There is no published design to return to.'), true);
    if (!confirm(a('ترجع لآخر تصميم منشور؟', 'Return to your last published design?'))) return;
    try { clearTimeout(saveTimer); await api('/api/owner/design/discard', { method: 'POST', body: {} }); Object.assign(d, await api('/api/owner/design')); recipe = strip(d.draft); dirty = false; status(); send(d.draft); render(); } catch { note(a('تعذر التنفيذ.', 'Could not do that.'), true); }
  };
  status(); render();
}

function miniCard(p, current) {
  const c = p.recipe.colors;
  const r = { none: '0', sm: '4px', md: '8px', lg: '12px', xl: '16px' }[p.recipe.card.radius];
  const btn = { square: '2px', rounded: '8px', pill: '99px' }[p.recipe.button.shape];
  return `<article class="design-card ${current ? 'current' : ''}">
    <div class="mini" aria-hidden="true" style="--m-bg:${c.bg};--m-sf:${c.surface};--m-p:${c.primary};--m-a:${c.accent};--m-t:${c.text};--m-r:${r};--m-b:${btn}">
      <div class="mini-cover"></div><div class="mini-name"></div>
      <div class="mini-items mini-${esc(p.recipe.layout)}"><i></i><i></i><i></i><i></i></div><div class="mini-btn"></div>
    </div>
    <h4>${esc(pick(p, 'name'))}</h4>
    <div class="row"><button type="button" class="btn ghost sm" data-try="${esc(p.id)}">${a('جرّب', 'Try')}</button><button type="button" class="btn sm" data-use="${esc(p.id)}">${current ? a('مختار ✓', 'Chosen ✓') : a('اعتمد', 'Use')}</button></div>
  </article>`;
}
