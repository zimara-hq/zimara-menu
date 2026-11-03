// Owner: ready-made pages per trade, and the owner's own domain.
import { api, esc, lang, money, pick } from './common.js';
const a = (ar, en) => (lang === 'ar' ? ar : en);
const fail = (el, err, map = {}) => { el.innerHTML = `<p class="msg error" role="alert">${esc(map[err?.message] || a('تعذر تنفيذ الإجراء. حاول مجددًا.', 'Could not complete the action. Try again.'))}</p>`; };

export async function templatesView(el) {
  const d = await api('/api/owner/templates');
  el.innerHTML = `<div class="section-intro"><span class="eyebrow">${a('صفحات جاهزة', 'READY PAGES')}</span><h2>${a('اختر صفحة جاهزة واجعلها لك.', 'Pick a ready page and make it yours.')}</h2><p>${a('القالب يغيّر الألوان والتخطيط. وإذا كان منيوك فاضي نضيف أصنافًا تجريبية تبقى مخفية عن زوارك لين تعدّلها.', 'A template sets colours and layout. On an empty menu it adds sample items that stay hidden from guests until you edit them.')}</p></div>
  ${d.hidden_samples ? `<div class="card sample-banner" role="status"><p><strong>${a(`أصناف تجريبية مخفية عن زوارك: ${d.hidden_samples}`, `Sample items hidden from guests: ${d.hidden_samples}`)}</strong><br><span class="small muted">${a('عدّل أي صنف من تبويب المنيو ويظهر فورًا، أو اختر:', 'Edit any item in the Menu tab and it goes live, or choose:')}</span></p><div class="row"><button type="button" class="btn sm" data-samples="publish">${a('أظهرها كما هي', 'Show them as they are')}</button><button type="button" class="btn ghost sm" data-samples="remove">${a('احذفها', 'Remove them')}</button></div><div id="sample-msg" role="status"></div></div>` : ''}
  <div class="template-grid">${d.templates.map((t) => card(t, d.menu_empty)).join('')}</div><div id="tpl-msg" role="status"></div>`;
  el.querySelectorAll('[data-apply]').forEach((b) => (b.onclick = async () => {
    const t = d.templates.find((x) => x.id === b.dataset.apply);
    const msg = d.menu_empty
      ? a(`نطبّق «${t.name_ar}» ونضيف ${t.items} صنف تجريبي مخفي. متابعة؟`, `Apply “${t.name_en}” and add ${t.items} hidden sample items?`)
      : a(`نطبّق ألوان وتخطيط «${t.name_ar}». أصنافك الحالية ما تتغير. متابعة؟`, `Apply the look of “${t.name_en}”? Your items stay as they are.`);
    if (!confirm(msg)) return;
    b.disabled = true;
    try {
      const r = await api('/api/owner/templates/' + t.id + '/apply', { method: 'POST', body: {} });
      await templatesView(el);
      el.querySelector('#tpl-msg').innerHTML = `<p class="msg">${a(`تم تطبيق القالب${r.sample_items ? ` وإضافة ${r.sample_items} صنف تجريبي` : ''}. افتح صفحتك لتشوف النتيجة.`, `Template applied${r.sample_items ? ` with ${r.sample_items} sample items` : ''}. Open your page to see it.`)}</p>`;
    } catch (err) { b.disabled = false; fail(el.querySelector('#tpl-msg'), err, { plan_items_limit: a('باقتك لا تتسع لأصناف القالب.', 'Your plan has no room for the template items.') }); }
  }));
  el.querySelectorAll('[data-samples]').forEach((b) => (b.onclick = async () => {
    if (b.dataset.samples === 'remove' && !confirm(a('حذف كل الأصناف التجريبية المخفية؟', 'Remove all hidden sample items?'))) return;
    b.disabled = true;
    try { await api('/api/owner/templates/samples/' + b.dataset.samples, { method: 'POST', body: {} }); await templatesView(el); } catch (err) { b.disabled = false; fail(el.querySelector('#sample-msg'), err); }
  }));
}

function card(t, empty) {
  const corner = t.theme.corners === 'square' ? '6px' : '18px';
  return `<article class="card template-card"><div class="tpl-phone" style="--tpl:${esc(t.color)};--tpl-r:${corner}" aria-hidden="true"><div class="tpl-cover"></div><div class="tpl-id"><span class="tpl-logo">${esc([...pick(t, 'name')][0])}</span><strong>${esc(pick(t, 'name'))}</strong></div>${t.preview.map((c) => `<p class="tpl-cat">${esc(pick(c, 'name'))}</p>${c.items.map((i) => `<div class="tpl-item ${t.theme.layout === 'cards' ? 'is-card' : ''}"><span>${esc(pick(i, 'name'))}</span><b>${esc(money(i.price))}</b></div>`).join('')}`).join('')}</div><span class="eyebrow">${esc(sectorName(t.sector))}</span><h3>${esc(pick(t, 'name'))}</h3><p class="small muted">${esc(pick(t, 'desc'))}</p><button type="button" class="btn" data-apply="${esc(t.id)}">${empty ? a('استخدم هذه الصفحة', 'Use this page') : a('طبّق الشكل فقط', 'Apply the look only')}</button></article>`;
}
const sectorName = (s) => ({ cafe: a('مقهى', 'Café'), restaurant: a('مطعم', 'Restaurant'), clinic: a('عيادة', 'Clinic'), service: a('خدمات', 'Services'), bank: a('بنك', 'Bank') })[s] || s;

const STATUS = { pending: a('بانتظار ربط DNS', 'Waiting for DNS'), active: a('يعمل ✓', 'Live ✓'), failed: a('فشل الربط', 'Failed') };
const PURPOSE = { route: a('توجيه الدومين', 'Routes the domain'), ownership: a('إثبات الملكية', 'Proves ownership'), certificate: a('شهادة SSL', 'SSL certificate') };

export async function domainView(el) {
  const d = await api('/api/owner/domain');
  const dom = d.domain;
  el.innerHTML = `<div class="section-intro"><span class="eyebrow">${a('الدومين الخاص', 'OWN DOMAIN')}</span><h2>${a('صفحتك على دومينك أنت.', 'Your page on your own domain.')}</h2><p>${a('اربط دومين مثل menu.yourcafe.sa، فيفتح عملاؤك صفحتك ومنيوك باسم علامتك. شهادة SSL مجانية تصدر وتتجدد وحدها.', 'Connect a domain such as menu.yourcafe.sa so guests open your page under your brand. A free SSL certificate is issued and renewed automatically.')}</p></div>
  ${!d.configured ? `<div class="card"><p class="muted">${a('ربط الدومين الخاص يتفعّل قريبًا من فريق زيمارا. تقدر تجهّز دومينك من الآن.', 'Own domains are being enabled by the ZIMARA team. You can prepare your domain now.')}</p></div>` : ''}
  <form class="card stack" id="dom-form" novalidate><label for="dom-host">${a('الدومين', 'Domain')}</label><div class="row"><input id="dom-host" name="hostname" dir="ltr" inputmode="url" placeholder="menu.yourcafe.sa" value="${esc(dom?.hostname || '')}" ${d.configured ? '' : 'disabled'}><button class="btn" type="submit" ${d.configured ? '' : 'disabled'}>${dom ? a('تغيير', 'Change') : a('ربط', 'Connect')}</button></div><p class="small muted">${a('ننصح بنطاق فرعي مثل menu. حتى ما يتأثر موقعك أو إيميلك الحالي.', 'We recommend a subdomain like menu. so your current site and email stay untouched.')}</p><div id="dom-msg" role="status"></div></form>
  ${dom ? `<section class="card stack"><div class="row"><h2>${esc(dom.hostname)}</h2><span class="pill ${dom.status === 'active' ? 'ready' : 'pending'}">${esc(STATUS[dom.status] || dom.status)}</span></div>
  ${dom.status === 'active' ? `<p>${a('دومينك يعمل. صفحتك:', 'Your domain is live. Your page:')} <a href="https://${esc(dom.hostname)}" target="_blank" rel="noopener" dir="ltr">https://${esc(dom.hostname)}</a></p>` : `<p>${a('أضف هذه السجلات عند مزوّد الدومين (مثل GoDaddy أو Cloudflare أو Namecheap)، ثم اضغط «تحقق الآن». قد يأخذ الربط من دقائق إلى 24 ساعة.', 'Add these records at your domain provider (GoDaddy, Cloudflare, Namecheap…), then tap “Check now”. It can take minutes to 24 hours.')}</p>`}
  <div class="table-scroll"><table><thead><tr><th>${a('النوع', 'Type')}</th><th>${a('الاسم', 'Name')}</th><th>${a('القيمة', 'Value')}</th><th>${a('الغرض', 'Purpose')}</th></tr></thead><tbody>${dom.records.map((r) => `<tr><td>${esc(r.type)}</td><td dir="ltr"><code>${esc(r.name)}</code></td><td dir="ltr"><code>${esc(r.value)}</code> <button type="button" class="btn ghost sm" data-copy="${esc(r.value)}">${a('نسخ', 'Copy')}</button></td><td>${esc(PURPOSE[r.purpose] || '')}</td></tr>`).join('')}</tbody></table></div>
  <div class="row"><button type="button" class="btn" id="dom-check">${a('تحقق الآن', 'Check now')}</button><button type="button" class="btn ghost" id="dom-remove">${a('فصل الدومين', 'Disconnect')}</button></div></section>` : ''}
  <details class="card"><summary>${a('أسئلة شائعة', 'FAQ')}</summary><p><strong>${a('هل يتوقف رابطي القديم؟', 'Does my old link stop?')}</strong> ${a('لا. رابط زيمارا ورموز QR المطبوعة تبقى تعمل.', 'No. Your ZIMARA link and printed QR codes keep working.')}</p><p><strong>${a('هل يتأثر إيميلي؟', 'Is my email affected?')}</strong> ${a('لا، إذا استخدمت نطاقًا فرعيًا مثل menu.', 'No, if you use a subdomain like menu.')}</p><p><strong>${a('ما عندي دومين؟', 'No domain yet?')}</strong> ${a('اشترِ واحدًا من Cloudflare أو GoDaddy أو Namecheap ثم ارجع هنا.', 'Buy one from Cloudflare, GoDaddy or Namecheap, then come back.')}</p></details>`;
  const msg = el.querySelector('#dom-msg');
  const ERR = { invalid_hostname: a('اكتب دومين صحيح مثل menu.yourcafe.sa', 'Enter a valid domain such as menu.yourcafe.sa'), hostname_taken: a('هذا الدومين مربوط بحساب آخر.', 'This domain is linked to another account.'), plan_domain: a('الدومين الخاص متاح في الباقة الاحترافية والسلاسل.', 'Own domains are available on Pro and Chains.'), domain_provider_error: a('تعذر الاتصال بمزوّد الشهادات. حاول بعد قليل.', 'Could not reach the certificate provider. Try again shortly.') };
  el.querySelector('#dom-form').onsubmit = async (e) => {
    e.preventDefault();
    const b = e.target.querySelector('[type=submit]');
    b.disabled = true;
    try { await api('/api/owner/domain', { method: 'PUT', body: { hostname: el.querySelector('#dom-host').value } }); await domainView(el); } catch (err) { b.disabled = false; fail(msg, err, ERR); }
  };
  el.querySelectorAll('[data-copy]').forEach((b) => (b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = a('تم النسخ', 'Copied'); } catch { /* clipboard blocked */ } }));
  el.querySelector('#dom-check')?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    try { await api('/api/owner/domain/check', { method: 'POST', body: {} }); await domainView(el); } catch (err) { e.target.disabled = false; fail(msg, err, ERR); }
  });
  el.querySelector('#dom-remove')?.addEventListener('click', async (e) => {
    if (!confirm(a('فصل الدومين؟ يبقى رابط زيمارا يعمل.', 'Disconnect the domain? Your ZIMARA link keeps working.'))) return;
    e.target.disabled = true;
    try { await api('/api/owner/domain', { method: 'DELETE', body: {} }); await domainView(el); } catch (err) { e.target.disabled = false; fail(msg, err, ERR); }
  });
}
