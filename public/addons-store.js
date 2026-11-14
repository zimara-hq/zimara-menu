import { icon } from './icons.js';
// Owner add-on store: install, configure and remove add-ons, and link Telegram.
import { api, esc, lang, pick } from './common.js';
const a = (ar, en) => (lang === 'ar' ? ar : en);

const INFO = {
  whatsapp_button: { ico: 'phone', ar: ['زر واتساب عائم', 'زر ثابت في المنيو وصفحتك يفتح محادثة معك برسالة جاهزة.'], en: ['Floating WhatsApp button', 'A fixed button on your menu and page that opens a chat with a ready message.'] },
  announcement: { ico: 'megaphone', ar: ['شريط الإعلانات', 'شريط أعلى المنيو لعرض أو تنبيه، بتاريخ بداية ونهاية.'], en: ['Announcement bar', 'A bar above your menu for an offer or notice, with start and end dates.'] },
  faq: { ico: 'help', ar: ['الأسئلة الشائعة', 'جاوب أسئلة عملائك قبل ما يسألون: التوصيل، الحجز، المواقف.'], en: ['FAQ', 'Answer common questions before guests ask: delivery, booking, parking.'] },
  telegram: { ico: 'bell', ar: ['إشعارات تيليجرام', 'يوصلك كل طلب جديد وتذكيرات الاشتراك على تيليجرام فورًا، لكل الفروع أو لفرع محدد.'], en: ['Telegram alerts', 'Get every new order and plan reminders on Telegram, for all branches or one.'] },
  pixel_meta: { ico: 'chart', ar: ['بكسل Meta (فيسبوك وإنستقرام)', 'قِس زيارات منيوك وطلباتك من إعلانات فيسبوك وإنستقرام.'], en: ['Meta Pixel', 'Measure menu visits and orders from Facebook and Instagram ads.'], hint: '123456789012345' },
  pixel_snap: { ico: 'chart', ar: ['بكسل سناب شات', 'قِس نتائج إعلانات سناب شات، الأقوى في السعودية.'], en: ['Snap Pixel', 'Measure Snapchat ad results.'], hint: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
  pixel_tiktok: { ico: 'chart', ar: ['بكسل تيك توك', 'اعرف كم طلب جاك من إعلانات تيك توك.'], en: ['TikTok Pixel', 'See how many orders came from TikTok ads.'], hint: 'C1ABCDEF2GHIJK3LMNOP' },
  pixel_ga4: { ico: 'chart', ar: ['Google Analytics 4', 'تحليل شامل لزوار منيوك وصفحتك.'], en: ['Google Analytics 4', 'Full analytics for your menu and page visitors.'], hint: 'G-XXXXXXXXXX' },
  pixel_gads: { ico: 'chart', ar: ['Google Ads', 'تتبع تحويلات إعلانات قوقل.'], en: ['Google Ads', 'Track Google Ads conversions.'], hint: 'AW-123456789' },
  pixel_x: { ico: 'chart', ar: ['بكسل X (تويتر)', 'قِس نتائج إعلانات X.'], en: ['X Pixel', 'Measure X ad results.'], hint: 'o1abc' },
  pixel_pinterest: { ico: 'chart', ar: ['Pinterest Tag', 'تتبع زوار بنترست.'], en: ['Pinterest Tag', 'Track Pinterest visitors.'], hint: '2612345678901' },
  pixel_linkedin: { ico: 'chart', ar: ['LinkedIn Insight Tag', 'لحملات الشركات والطلبات الجماعية.'], en: ['LinkedIn Insight Tag', 'For B2B and catering campaigns.'], hint: '1234567' },
};
const GROUPS = { engage: a('التفاعل مع العملاء', 'Engage guests'), notify: a('الإشعارات', 'Notifications'), pixels: a('بكسلات الإعلانات', 'Ad pixels') };
const ERR = {
  invalid_pixel_id: a('المعرّف غير صحيح. انسخه كما هو من مدير الإعلانات.', 'Invalid ID. Copy it exactly from the ads manager.'),
  invalid_phone: a('اكتب رقم الواتساب بالصيغة الدولية، مثل 9665xxxxxxxx.', 'Enter the WhatsApp number in international form, e.g. 9665xxxxxxxx.'),
  invalid_text: a('اكتب نص الإعلان (160 حرفًا كحد أقصى).', 'Enter the announcement text (max 160 characters).'),
  invalid_ends_at: a('تاريخ النهاية يجب أن يكون بعد البداية.', 'The end must be after the start.'),
  invalid_faq: a('أضف سؤالًا وجوابًا على الأقل (حتى 20).', 'Add at least one question and answer (up to 20).'),
  invalid_href: a('الرابط يجب أن يبدأ بـ https://', 'The link must start with https://'),
};
const errText = (e) => ERR[e?.code || e?.error || e?.message] || a('تعذر الحفظ. تحقق من القيم وحاول مجددًا.', 'Could not save. Check the values and retry.');
const field = (name, label, value = '', { type = 'text', hint = '', dir = '' } = {}) =>
  `<div><label for="ad-${name}">${esc(label)}</label><input id="ad-${name}" name="${name}" type="${type}" value="${esc(value ?? '')}" ${hint ? `placeholder="${esc(hint)}"` : ''} ${dir ? `dir="${dir}"` : ''}></div>`;
const toLocal = (ms) => (ms ? new Date(ms - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');
const fromLocal = (v) => (v ? new Date(v).getTime() : null);

function formFor(key, c = {}) {
  c = c || {};
  if (key.startsWith('pixel_')) return field('id', a('معرّف البكسل', 'Pixel ID'), c.id, { hint: INFO[key].hint, dir: 'ltr' });
  if (key === 'whatsapp_button') return field('phone', a('رقم الواتساب', 'WhatsApp number'), c.phone, { hint: '9665xxxxxxxx', dir: 'ltr', type: 'tel' }) + field('message_ar', a('رسالة جاهزة (عربي)', 'Ready message (Arabic)'), c.message_ar, { hint: 'السلام عليكم، أبي أطلب' }) + field('message_en', a('رسالة جاهزة (إنجليزي)', 'Ready message (English)'), c.message_en);
  if (key === 'announcement') return field('text_ar', a('النص بالعربي', 'Arabic text'), c.text_ar, { hint: 'خصم 20% على القهوة اليوم' }) + field('text_en', a('النص بالإنجليزي', 'English text'), c.text_en) + field('href', a('رابط (اختياري)', 'Link (optional)'), c.href, { dir: 'ltr', hint: 'https://' }) + `<div><label for="ad-tone">${a('اللون', 'Style')}</label><select id="ad-tone" name="tone">${[['brand', a('لون هويتك', 'Your brand')], ['offer', a('عرض (برتقالي)', 'Offer (ember)')], ['notice', a('تنبيه (أصفر)', 'Notice (solar)')]].map(([v, l]) => `<option value="${v}" ${c.tone === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>` + field('starts_at', a('يبدأ', 'Starts'), toLocal(c.starts_at), { type: 'datetime-local' }) + field('ends_at', a('ينتهي', 'Ends'), toLocal(c.ends_at), { type: 'datetime-local' });
  if (key === 'faq') {
    const items = c.items?.length ? c.items : [{}];
    return `<div class="stack" data-faq>${items.map((x, i) => faqRow(x, i)).join('')}</div><button type="button" class="btn ghost sm" data-faq-add>${a('+ سؤال', '+ Question')}</button>`;
  }
  return '';
}
const faqRow = (x = {}, i) => `<fieldset class="card stack" data-faq-row><legend>${a('سؤال', 'Question')} ${i + 1}</legend><input name="q_ar" value="${esc(x.q_ar || '')}" placeholder="${a('السؤال بالعربي', 'Question (Arabic)')}" aria-label="${a('السؤال بالعربي', 'Question (Arabic)')}"><textarea name="a_ar" rows="2" placeholder="${a('الجواب بالعربي', 'Answer (Arabic)')}" aria-label="${a('الجواب بالعربي', 'Answer (Arabic)')}">${esc(x.a_ar || '')}</textarea><input name="q_en" value="${esc(x.q_en || '')}" placeholder="Question (English)" aria-label="Question (English)"><textarea name="a_en" rows="2" placeholder="Answer (English)" aria-label="Answer (English)">${esc(x.a_en || '')}</textarea></fieldset>`;

function readForm(key, form) {
  const v = (n) => form.querySelector(`[name="${n}"]`)?.value.trim() || null;
  if (key.startsWith('pixel_')) return { id: v('id') };
  if (key === 'whatsapp_button') return { phone: v('phone'), message_ar: v('message_ar'), message_en: v('message_en') };
  if (key === 'announcement') return { text_ar: v('text_ar'), text_en: v('text_en'), href: v('href'), tone: v('tone'), starts_at: fromLocal(v('starts_at')), ends_at: fromLocal(v('ends_at')) };
  if (key === 'faq') return { items: [...form.querySelectorAll('[data-faq-row]')].map((r) => Object.fromEntries(['q_ar', 'a_ar', 'q_en', 'a_en'].map((n) => [n, r.querySelector(`[name="${n}"]`).value.trim() || null]))).filter((x) => x.q_ar || x.a_ar) };
  return {};
}

export async function addonsView(el) {
  const d = await api('/api/owner/addons');
  const installedCount = d.addons.filter((x) => x.installed).length;
  el.innerHTML = `<div class="section-intro"><span class="eyebrow">${a('متجر الإضافات', 'ADD-ON STORE')}</span><h2>${a('أضف قوة لمنيوك بضغطة.', 'Power up your menu in one tap.')}</h2><p>${a(`ثبّت ما تحتاجه فقط. المثبت الآن: ${installedCount}.`, `Install only what you need. Installed now: ${installedCount}.`)}</p></div>${Object.entries(GROUPS).map(([g, title]) => `<h3 class="addon-group-title">${esc(title)}</h3><div class="addon-grid">${d.addons.filter((x) => x.group === g).map((x) => card(x, d.telegram)).join('')}</div>`).join('')}<p class="small muted">${a('البكسلات لا تعمل إلا بعد موافقة الزائر، حمايةً لخصوصية عملائك.', 'Pixels only run after the visitor agrees, to protect your guests\' privacy.')}</p>`;

  el.querySelectorAll('[data-open]').forEach((b) => (b.onclick = () => openEditor(el, d.addons.find((x) => x.key === b.dataset.open), d)));
  el.querySelectorAll('[data-remove]').forEach((b) => (b.onclick = async () => {
    if (!confirm(a('إلغاء تثبيت هذه الإضافة؟', 'Uninstall this add-on?'))) return;
    b.disabled = true;
    try { await api('/api/owner/addons/' + b.dataset.remove, { method: 'DELETE', body: {} }); await addonsView(el); } catch { b.disabled = false; }
  }));
}

function card(x, tg) {
  const i = INFO[x.key] || { ico: 'circle', ar: [x.key, ''], en: [x.key, ''] };
  const [title, desc] = lang === 'ar' ? i.ar : i.en;
  const off = x.key === 'telegram' && !tg.configured;
  return `<article class="card addon-card"><header><span class="addon-ico" aria-hidden="true">${icon(i.ico)}</span><div><h3>${esc(title)}</h3>${x.installed ? `<span class="pill ready">${a('مثبّت', 'Installed')}</span>` : ''}</div></header><p class="small muted">${esc(desc)}</p>${off ? `<p class="small muted">${a('تفعّل قريبًا بعد ربط بوت زيمارا.', 'Available once the ZIMARA bot is connected.')}</p>` : ''}<div class="actions"><button type="button" class="btn sm" data-open="${esc(x.key)}" ${off ? 'disabled' : ''}>${x.installed ? a('إعدادات', 'Settings') : a('تثبيت', 'Install')}</button>${x.installed ? `<button type="button" class="btn ghost sm" data-remove="${esc(x.key)}">${a('إلغاء التثبيت', 'Uninstall')}</button>` : ''}</div></article>`;
}

async function openEditor(el, x, d) {
  if (x.key === 'telegram') return telegramPanel(el, d);
  const [title] = lang === 'ar' ? INFO[x.key].ar : INFO[x.key].en;
  el.innerHTML = `<button type="button" class="btn ghost sm" data-back>← ${a('المتجر', 'Store')}</button><form class="card stack" id="addon-form" novalidate><h2>${esc(title)}</h2>${formFor(x.key, x.config)}<div id="addon-msg" role="status"></div><button class="btn" type="submit">${x.installed ? a('حفظ', 'Save') : a('تثبيت', 'Install')}</button></form>`;
  el.querySelector('[data-back]').onclick = () => addonsView(el);
  const form = el.querySelector('#addon-form');
  form.querySelector('[data-faq-add]')?.addEventListener('click', () => {
    const box = form.querySelector('[data-faq]');
    if (box.children.length < 20) box.insertAdjacentHTML('beforeend', faqRow({}, box.children.length));
  });
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      await api('/api/owner/addons/' + x.key, { method: 'PUT', body: { config: readForm(x.key, form) } });
      await addonsView(el);
    } catch (err) {
      form.querySelector('#addon-msg').innerHTML = `<p class="msg error">${esc(errText(err))}</p>`;
      btn.disabled = false;
    }
  };
}


const FIELD_LABEL = { branch: a('اسم الفرع', 'Branch name'), items: a('الأصناف والكميات', 'Items and quantities'), options: a('الإضافات والأحجام', 'Sizes and extras'), prices: a('سعر كل صنف', 'Price per item'), note: a('ملاحظة العميل', 'Guest note'), total: a('الإجمالي', 'Total'), time: a('وقت الطلب', 'Order time'), link: a('رابط فتح الطلبات', 'Link to orders') };
const DEFAULT_FIELDS = ['branch', 'items', 'options', 'note', 'total', 'link'];
const formatEditor = (prefix, f = {}) => `<fieldset class="tg-format" data-format="${prefix}"><legend>${a('وش يوصلك في الرسالة؟', 'What should the message show?')}</legend><div><label for="${prefix}-title">${a('عنوان الرسالة', 'Message heading')}</label><input id="${prefix}-title" name="title" maxlength="60" value="${esc(f.title || '')}" placeholder="طلب جديد"></div><div class="check-grid">${Object.entries(FIELD_LABEL).map(([k, l]) => `<label><input type="checkbox" name="field" value="${k}" ${(f.fields || DEFAULT_FIELDS).includes(k) ? 'checked' : ''}> ${esc(l)}</label>`).join('')}</div><p class="small muted">${a('معاينة الرسالة:', 'Message preview:')}</p><pre class="tg-preview" dir="rtl" aria-live="polite"></pre></fieldset>`;
const readFormat = (box) => ({ title: box.querySelector('[name=title]').value.trim() || null, fields: [...box.querySelectorAll('[name=field]:checked')].map((i) => i.value) });
function wireFormat(box) {
  const pre = box.querySelector('.tg-preview');
  let timer;
  const refresh = () => { clearTimeout(timer); timer = setTimeout(async () => {
    try { pre.textContent = (await api('/api/owner/telegram/preview', { method: 'POST', body: { format: readFormat(box) } })).text; }
    catch { pre.textContent = a('اختر الأصناف أو الإجمالي على الأقل.', 'Pick items or total at least.'); }
  }, 250); };
  box.addEventListener('input', refresh);
  refresh();
}

async function telegramPanel(el) {
  const [t, branches] = await Promise.all([api('/api/owner/telegram'), api('/api/owner/branches').catch(() => ({ branches: [] }))]);
  const list = branches.branches || [];
  el.innerHTML = `<button type="button" class="btn ghost sm" data-back>← ${a('المتجر', 'Store')}</button>
  <section class="card stack"><h2>${a('إشعارات تيليجرام', 'Telegram alerts')}</h2>
  <ol class="small"><li>${a('اختر الفرع ونوع الإشعارات، واضغط «إنشاء رمز الربط».', 'Pick the branch and alert types, then tap “Create link code”.')}</li><li>${a('اضغط «فتح البوت» وأرسل الرمز (صالح 30 دقيقة).', 'Tap “Open bot” and send the code (valid 30 minutes).')}</li><li>${a('يوصلك تأكيد، وبعدها كل طلب جديد. لإيقافها أرسل /stop للبوت.', 'You get a confirmation, then every new order. Send /stop to the bot to end.')}</li></ol>
  <div><label for="tg-branch">${a('أي فرع؟', 'Which branch?')}</label><select id="tg-branch"><option value="">${a('كل الفروع', 'All branches')}</option>${list.map((b) => `<option value="${esc(b.id)}">${esc(pick(b, 'name'))}</option>`).join('')}</select></div>
  <fieldset data-events><legend>${a('الإشعارات', 'Alerts')}</legend><label><input type="checkbox" value="orders" checked> ${a('الطلبات الجديدة', 'New orders')}</label><label><input type="checkbox" value="billing" checked> ${a('تذكيرات الاشتراك (لكل الفروع فقط)', 'Plan reminders (all branches only)')}</label></fieldset>
  ${formatEditor('new')}
  <button class="btn" type="button" id="tg-code">${a('إنشاء رمز الربط', 'Create link code')}</button><div id="tg-out" role="status"></div></section>
  <section class="card stack"><h2>${a('المحادثات المربوطة', 'Linked chats')}</h2>${t.links.length ? `<ul class="stack">${t.links.map((l) => `<li class="row"><span><strong>${esc(l.chat_title || a('محادثة', 'Chat'))}</strong> · ${esc(l.branch_id ? pick({ name_ar: l.branch_ar, name_en: l.branch_en }, 'name') : a('كل الفروع', 'All branches'))}</span><span class="row"><button type="button" class="btn ghost sm" data-edit="${esc(l.id)}">${a('تخصيص الرسالة', 'Customise message')}</button><button type="button" class="btn ghost sm" data-unlink="${esc(l.id)}">${a('فصل', 'Unlink')}</button></span><div class="tg-edit" data-edit-box="${esc(l.id)}" hidden></div></li>`).join('')}</ul><button type="button" class="btn ghost sm" id="tg-test">${a('أرسل رسالة تجربة', 'Send a test message')}</button>` : `<p class="empty">${a('لا توجد محادثات مربوطة حتى الآن.', 'No linked chats yet.')}</p>`}</section>`;
  el.querySelector('[data-back]').onclick = () => addonsView(el);
  el.querySelector('#tg-code').onclick = async (e) => {
    e.target.disabled = true;
    const events = [...el.querySelectorAll('[data-events] input:checked')].map((i) => i.value);
    try {
      const r = await api('/api/owner/telegram/code', { method: 'POST', body: { events, format: readFormat(el.querySelector('[data-format=new]')), branch_id: el.querySelector('#tg-branch').value || undefined } });
      el.querySelector('#tg-out').innerHTML = `<p>${a('رمز الربط:', 'Link code:')} <span class="tg-code">${esc(r.code)}</span></p><a class="btn" href="${esc(r.link)}" target="_blank" rel="noopener">${a('فتح البوت وإرسال الرمز', 'Open the bot and send the code')}</a>`;
    } catch (err) {
      el.querySelector('#tg-out').innerHTML = `<p class="msg error">${esc(err?.message === 'invalid_events' ? a('اختر نوع إشعار واحد على الأقل.', 'Pick at least one alert type.') : errText(err))}</p>`;
    } finally { e.target.disabled = false; }
  };
  wireFormat(el.querySelector('[data-format=new]'));
  el.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => {
    const l = t.links.find((x) => x.id === b.dataset.edit);
    const box = el.querySelector(`[data-edit-box="${CSS.escape(l.id)}"]`);
    if (!box.hidden) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = `<fieldset data-events><legend>${a('الإشعارات', 'Alerts')}</legend><label><input type="checkbox" value="orders" ${l.events.includes('orders') ? 'checked' : ''}> ${a('الطلبات الجديدة', 'New orders')}</label><label><input type="checkbox" value="billing" ${l.events.includes('billing') ? 'checked' : ''}> ${a('تذكيرات الاشتراك', 'Plan reminders')}</label></fieldset>${formatEditor('l' + l.id.slice(0, 8), l.format)}<button type="button" class="btn sm" data-save>${a('حفظ', 'Save')}</button><span class="small" role="status" data-saved></span>`;
    wireFormat(box.querySelector('[data-format]'));
    box.querySelector('[data-save]').onclick = async (e) => {
      e.target.disabled = true;
      try {
        await api('/api/owner/telegram/' + l.id, { method: 'PATCH', body: { events: [...box.querySelectorAll('[data-events] input:checked')].map((i) => i.value), format: readFormat(box.querySelector('[data-format]')) } });
        box.querySelector('[data-saved]').textContent = a('تم الحفظ ✓', 'Saved ✓');
      } catch { box.querySelector('[data-saved]').textContent = a('اختر نوع إشعار، والأصناف أو الإجمالي.', 'Pick an alert type, and items or total.'); }
      finally { e.target.disabled = false; }
    };
  }));
  el.querySelectorAll('[data-unlink]').forEach((b) => (b.onclick = async () => { b.disabled = true; await api('/api/owner/telegram/' + b.dataset.unlink, { method: 'DELETE', body: {} }).catch(() => {}); telegramPanel(el); }));
  el.querySelector('#tg-test')?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    try { const r = await api('/api/owner/telegram/test', { method: 'POST', body: {} }); e.target.textContent = a(`أُرسلت إلى ${r.sent}`, `Sent to ${r.sent}`); } catch { e.target.disabled = false; }
  });
}
