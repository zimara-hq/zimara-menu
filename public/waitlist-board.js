import { icon } from './icons.js';
// Waitlist screens: the branch's live list (call, seat, no-show, walk-ins) and the
// owner's per-branch settings with a printable "join the waitlist" QR code.
import { api, esc, lang, pick, qrSvg, announce, chime, relTime } from './common.js';
import { onLive } from './realtime.js';
const a = (ar, en) => (lang === 'ar' ? ar : en);
let gen = 0;

const STATUS = { waiting: ['ينتظر', 'Waiting'], called: ['تم النداء', 'Called'], seated: ['جلس', 'Seated'], cancelled: ['ألغى', 'Cancelled'], no_show: ['ما حضر', 'No-show'] };

function printQr(slug, title) {
  const w = window.open('', '_blank');
  if (!w) return;
  const u = `${location.origin}/q/${slug}`;
  w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(title)}</title><style>body{font-family:system-ui;display:grid;place-items:center;min-height:90vh;text-align:center}h1{font-size:2rem;margin:0 0 12px}p{font-size:1.2rem}</style><div dir="${lang === 'ar' ? 'rtl' : 'ltr'}"><h1>${a('سجّل في قائمة الانتظار', 'Join the waitlist')}</h1>${qrSvg(u, 8)}<p>${a('امسح الرمز، ونناديك على جوالك لما يجي دورك.', 'Scan, and we will call you on your phone when it is your turn.')}</p><small>${esc(u)}</small></div>`);
  w.document.close(); w.focus(); w.print();
}

export async function waitlistBoard(el) {
  const my = ++gen;
  let data = await api('/api/branch/waitlist');
  let prevWaiting = null;
  el.innerHTML = `<div class="section-intro"><span class="eyebrow">${a('الاستقبال', 'HOST STAND')}</span><h2>${a('قائمة الانتظار', 'Waitlist')}</h2><p>${a('العميل يمسح كود الانتظار ويسجل، أو أضفه أنت. «نادِ» يرسل تنبيه لجواله ويتكرر كل دقيقة لين يشوفه.', 'Guests scan the waitlist code to join, or add them yourself. “Call” alerts their phone and repeats every minute until they see it.')}</p></div>
    <div id="wl-state"></div>
    <section class="card"><div class="row" style="justify-content:space-between"><h3>${a('الحالي', 'Now')}</h3><div class="wl-stats" id="wl-stats"></div></div><div class="wl-board" id="wl-board" aria-live="polite"></div></section>
    <form class="card stack" id="wl-add" novalidate><h3>${a('أضف عميل حاضر', 'Add a walk-in')}</h3>
      <div class="grid2"><label>${a('الاسم', 'Name')}<input name="name" maxlength="60" required></label><label>${a('عدد الأشخاص', 'Party size')}<input name="party" type="number" min="1" max="50" value="2" inputmode="numeric"></label></div>
      <label>${a('الجوال (اختياري)', 'Mobile (optional)')}<input name="phone" dir="ltr" inputmode="tel" placeholder="05xxxxxxxx"></label>
      <div role="status"></div><button class="btn" type="submit">${a('أضف للقائمة', 'Add to list')}</button></form>
    <section class="card"><h3>${a('آخر 3 ساعات', 'Last 3 hours')}</h3><div id="wl-done"></div></section>`;
  const f = el.querySelector('#wl-add');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const msg = f.querySelector('[role=status]');
    if (!f.name.value.trim()) { msg.innerHTML = `<p class="msg error">${a('اكتب الاسم.', 'Write the name.')}</p>`; return; }
    try {
      const r = await api('/api/branch/waitlist', { method: 'POST', body: { name: f.name.value.trim(), party: Number(f.party.value || 1), phone: f.phone.value.trim() || undefined } });
      f.reset(); f.party.value = 2; msg.innerHTML = '';
      announce(a(`تمت الإضافة برقم ${r.number}.`, `Added as number ${r.number}.`));
      await refresh();
    } catch (err) { msg.innerHTML = `<p class="msg error">${err?.data?.error === 'invalid_phone' ? a('رقم الجوال لازم يبدأ بـ 05.', 'The mobile must start with 05.') : a('تعذر الإضافة.', 'Could not add.')}</p>`; }
  };

  const draw = () => {
    const open = data.entries.filter((x) => x.status === 'waiting' || x.status === 'called');
    const done = data.entries.filter((x) => !open.includes(x)).reverse();
    const s = data.settings;
    el.querySelector('#wl-state').innerHTML = s.active
      ? `<p class="msg">${a('القائمة مفتوحة للعملاء.', 'The list is open to guests.')} <button class="btn ghost sm" type="button" id="wl-print">${a('اطبع كود الانتظار', 'Print waitlist QR')}</button></p>`
      : `<p class="msg warn">${a('التسجيل الذاتي مقفل. المالك يفتحه من «إعدادات الفروع». تقدر تضيف العملاء يدويًا.', 'Guest self sign-up is off. The owner turns it on in branch settings. You can still add guests by hand.')}</p>`;
    el.querySelector('#wl-print')?.addEventListener('click', () => printQr(data.slug, a('كود الانتظار', 'Waitlist QR')));
    const waiting = open.filter((x) => x.status === 'waiting');
    el.querySelector('#wl-stats').innerHTML = `<span>${a('ينتظر', 'Waiting')}: ${waiting.length}</span><span>${a('أشخاص', 'People')}: ${waiting.reduce((n, x) => n + x.party, 0)}</span>`;
    el.querySelector('#wl-board').innerHTML = open.length ? open.map((x) => `<article class="wl-row ${x.status}" data-row="${esc(x.id)}">
        <div class="wl-num">${x.number}</div>
        <div><b>${esc(x.name)}</b> · ${a('عددهم', 'party')} ${x.party}${x.phone ? ` · <a dir="ltr" href="tel:+${esc(x.phone)}">0${esc(x.phone.slice(3))}</a>` : ''}
          <div class="small muted">${esc(a(...STATUS[x.status]))} · ${esc(relTime(data.now - (x.called_at || x.created_at)))}${x.status === 'called' ? ` · ${x.seen_at ? a('شاف التنبيه ✓', 'Saw the alert ✓') : a(`تنبيه ${x.alerts_sent}`, `alert ${x.alerts_sent}`)}` : ''}${x.source === 'staff' ? ' · ' + a('أضافه الموظف', 'added by staff') : ''}</div></div>
        <div class="wl-actions">
          <button class="btn sm" type="button" data-act="call" data-id="${esc(x.id)}" data-v="${x.version}">${x.status === 'called' ? a('نادِ مرة ثانية', 'Call again') : a('نادِ', 'Call')}</button>
          <button class="btn ok sm" type="button" data-act="seat" data-id="${esc(x.id)}" data-v="${x.version}">${a('جلس', 'Seated')}</button>
          ${x.status === 'called' ? `<button class="btn ghost sm" type="button" data-act="no_show" data-id="${esc(x.id)}" data-v="${x.version}">${a('ما حضر', 'No-show')}</button>` : ''}
          <button class="btn danger sm" type="button" data-act="cancel" data-id="${esc(x.id)}" data-v="${x.version}">${a('إلغاء', 'Cancel')}</button>
        </div></article>`).join('') : `<p class="empty">${a('ما فيه أحد ينتظر الحين.', 'Nobody is waiting right now.')}</p>`;
    el.querySelector('#wl-done').innerHTML = done.length ? `<div class="table-scroll"><table><thead><tr><th>#</th><th>${a('الاسم', 'Name')}</th><th>${a('العدد', 'Party')}</th><th>${a('الحالة', 'Status')}</th><th>${a('انتظر', 'Waited')}</th></tr></thead><tbody>${done.map((x) => `<tr><td>${x.number}</td><td>${esc(x.name)}</td><td>${x.party}</td><td>${esc(a(...STATUS[x.status]))}</td><td>${x.done_at ? esc(relTime(x.done_at - x.created_at)) : '—'}</td></tr>`).join('')}</tbody></table></div>` : `<p class="empty">${a('لا شيء بعد.', 'Nothing yet.')}</p>`;
    el.querySelectorAll('[data-act]').forEach((b) => (b.onclick = async () => {
      b.disabled = true;
      try {
        const r = await api(`/api/branch/waitlist/${b.dataset.id}/${b.dataset.act}`, { method: 'POST', body: { version: Number(b.dataset.v) } });
        if (b.dataset.act === 'call') announce(r.push?.sent ? a('تم إرسال التنبيه لجواله.', 'Alert sent to their phone.') : a('تم النداء. ما فعّل التنبيه على جواله، ناده بالاسم.', 'Called. They did not turn on phone alerts, so call their name.'));
      } catch (err) { announce(err?.status === 409 ? a('تغيّرت الحالة من شاشة ثانية. حدّثنا القائمة.', 'Changed on another screen. The list is refreshed.') : a('تعذر التنفيذ.', 'Could not do that.'), true); }
      await refresh();
    }));
    if (prevWaiting !== null && waiting.some((x) => x.source === 'guest' && !prevWaiting.has(x.id))) chime(1);
    prevWaiting = new Set(waiting.map((x) => x.id));
  };
  const refresh = async () => { try { data = await api('/api/branch/waitlist'); if (my === gen && el.querySelector('#wl-board')) draw(); } catch {} };
  draw();
  onLive(el.querySelector('#wl-board'), ['waitlist'], () => refresh());
  const loop = async () => { if (my !== gen || !el.querySelector('#wl-board')) return; await refresh(); setTimeout(loop, 5000); };
  setTimeout(loop, 5000);
}

export async function waitlistPanel(el, branch) {
  const { settings: s } = await api(`/api/owner/branches/${branch.id}/waitlist`);
  el.innerHTML = `<div class="editor-heading"><h3>${a('قائمة الانتظار', 'Waitlist')} · ${esc(pick(branch, 'name'))}</h3></div>
    <form class="stack" novalidate>
      <label class="check"><input type="checkbox" name="active" ${s.active ? 'checked' : ''}> ${a('افتح التسجيل الذاتي من كود QR', 'Let guests join from a QR code')}</label>
      <div class="grid2"><label>${a('دقائق تقريبية لكل مجموعة', 'Approx. minutes per party')}<input name="minutes" type="number" min="1" max="120" inputmode="numeric" value="${s.minutes_per_party}"></label>
      <label>${a('أكبر عدد أشخاص للتسجيل الذاتي', 'Largest party for self sign-up')}<input name="max_party" type="number" min="1" max="50" inputmode="numeric" value="${s.max_party}"></label></div>
      <p class="small muted">${a('العميل يشوف ترتيبه والوقت المتوقع، ويجيه تنبيه على جواله لما يناديه الموظف من شاشة الفرع.', 'Guests see their place and expected wait, and get a phone alert when staff call them from the branch screen.')}</p>
      <div role="status"></div>
      <div class="row"><button class="btn" type="submit">${a('حفظ', 'Save')}</button><button class="btn ghost" type="button" data-print>${a('اطبع كود الانتظار', 'Print waitlist QR')}</button><a class="btn ghost" href="/q/${esc(branch.slug)}" target="_blank" rel="noopener">${a('افتح صفحة التسجيل', 'Open sign-up page')} ${icon("arrowUpRight")}</a></div>
    </form>`;
  const f = el.querySelector('form'), msg = f.querySelector('[role=status]');
  f.onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api(`/api/owner/branches/${branch.id}/waitlist`, { method: 'PATCH', body: { active: f.active.checked, minutes_per_party: Number(f.minutes.value), max_party: Number(f.max_party.value) } });
      msg.innerHTML = `<p class="msg">${a('تم الحفظ ✓', 'Saved ✓')}</p>`;
      announce(a('تم حفظ قائمة الانتظار.', 'Waitlist saved.'));
    } catch { msg.innerHTML = `<p class="msg error">${a('راجع الأرقام: الدقائق من 1 إلى 120، والعدد من 1 إلى 50.', 'Check the numbers: minutes 1 to 120, party 1 to 50.')}</p>`; }
  };
  f.querySelector('[data-print]').onclick = () => printQr(branch.slug, a('كود الانتظار', 'Waitlist QR'));
}
