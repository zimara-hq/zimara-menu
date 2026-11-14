import { icon } from './icons.js';
// Guest waitlist: /q/<branch> to join, /w/<token> to follow your place and get called.
import { api, chime, esc, lang, makeT, setBrandColor, topbar, unlockAudio, announce } from './common.js';

const a = (ar, en) => (lang === 'ar' ? ar : en);
const t = makeT({ ar: { title: 'قائمة الانتظار' }, en: { title: 'Waitlist' } });
const main = document.getElementById('main');
main.className = 'wrap narrow';
topbar(document.getElementById('top'), t);
document.title = `${t('brand')} · ${t('title')}`;
const [, kind, key] = location.pathname.split('/');
const mins = (m) => (m < 60 ? a(`${m} دقيقة تقريبًا`, `about ${m} min`) : a(`${Math.round(m / 60 * 10) / 10} ساعة تقريبًا`, `about ${Math.round(m / 60 * 10) / 10} h`));
const ERR = {
  waitlist_closed: ['قائمة الانتظار مقفلة الحين.', 'The waitlist is closed right now.'],
  waitlist_full: ['القائمة ممتلئة. جرّب بعد شوي.', 'The list is full. Try again shortly.'],
  invalid_phone: ['رقم الجوال لازم يبدأ بـ 05.', 'The mobile number must start with 05.'],
  invalid_party: ['عدد الأشخاص غير مسموح.', 'That party size is not allowed.'],
  invalid_name: ['اكتب اسمك بدون رموز.', 'Write your name without symbols.'],
  too_many_attempts: ['محاولات كثيرة. انتظر دقائق.', 'Too many attempts. Wait a few minutes.'],
};
const errText = (e) => (ERR[e?.data?.error] ? a(...ERR[e.data.error]) : a('تعذر الإرسال. حاول مرة ثانية.', 'Could not send. Please try again.'));

// ---------- join ----------
async function joinPage() {
  let info;
  try { info = await api('/api/public/waitlist/' + encodeURIComponent(key)); } catch { main.innerHTML = `<p class="msg error">${a('ما لقينا هذا الفرع.', 'We could not find this branch.')}</p>`; return; }
  setBrandColor(info.branch.brand_color);
  const org = a(info.branch.org_ar, info.branch.org_en), br = a(info.branch.name_ar, info.branch.name_en);
  if (!info.active) {
    main.innerHTML = `<p class="muted center">${esc(org)} · ${esc(br)}</p><div class="hero-status"><h1>${a('قائمة الانتظار مقفلة الحين', 'The waitlist is closed right now')}</h1><p>${a('تقدر تتصفح المنيو لين يجيك الدور.', 'You can browse the menu meanwhile.')}</p></div><p class="center"><a class="btn" href="/m/${esc(info.branch.slug)}">${a('المنيو', 'Menu')}</a></p>`;
    return;
  }
  main.innerHTML = `<p class="muted center">${esc(org)} · ${esc(br)}</p>
    <div class="hero-status"><h1>${a('سجّل في قائمة الانتظار', 'Join the waitlist')}</h1>
      <p id="wl-now">${info.waiting ? a(`قدامك ${info.waiting} · الانتظار ${mins(info.eta_minutes)}`, `${info.waiting} ahead · wait ${mins(info.eta_minutes)}`) : a('ما فيه أحد قدامك ', 'Nobody ahead of you ')}</p></div>
    <form class="card stack" id="wl-form" novalidate>
      <label>${a('الاسم', 'Name')}<input name="name" id="wl-name" maxlength="60" autocomplete="given-name" required></label>
      <label>${a('عدد الأشخاص', 'Party size')}<div class="party-pick" role="radiogroup" aria-label="${a('عدد الأشخاص', 'Party size')}">${Array.from({ length: Math.min(info.max_party, 8) }, (_, i) => `<button type="button" role="radio" class="btn ghost" data-party="${i + 1}" aria-checked="${i === 1}">${i + 1}</button>`).join('')}${info.max_party > 8 ? `<input name="party_more" id="wl-more" type="number" min="9" max="${info.max_party}" inputmode="numeric" placeholder="${a('أكثر', 'More')}" aria-label="${a('عدد أكبر', 'Larger party')}">` : ''}</div></label>
      <label>${a('الجوال (اختياري، يحفظ مكانك لو قفلت الصفحة)', 'Mobile (optional, keeps your place if you close the page)')}<input name="phone" id="wl-phone" dir="ltr" inputmode="tel" autocomplete="tel" placeholder="05xxxxxxxx"></label>
      <div role="status" id="wl-msg"></div>
      <button class="btn big" type="submit" id="wl-join">${a('سجّلني', 'Add me')}</button>
    </form>
    <p class="center"><a href="/m/${esc(info.branch.slug)}">${a('تصفح المنيو وأنت تنتظر', 'Browse the menu while you wait')}</a></p>`;
  let party = 2;
  const f = main.querySelector('#wl-form'), btns = [...f.querySelectorAll('[data-party]')], more = f.querySelector('#wl-more');
  const mark = () => btns.forEach((b) => b.setAttribute('aria-checked', String(Number(b.dataset.party) === party && !more?.value)));
  btns.forEach((b) => (b.onclick = () => { party = Number(b.dataset.party); if (more) more.value = ''; mark(); }));
  if (more) more.oninput = () => { if (more.value) party = Number(more.value); mark(); };
  f.onsubmit = async (e) => {
    e.preventDefault();
    const msg = f.querySelector('#wl-msg'), name = f.name.value.trim();
    if (!name) { msg.innerHTML = `<p class="msg error">${a('اكتب اسمك.', 'Write your name.')}</p>`; f.name.focus(); return; }
    const btn = f.querySelector('#wl-join'); btn.disabled = true;
    try {
      const r = await api('/api/public/waitlist/' + encodeURIComponent(key), { method: 'POST', body: { name, party, phone: f.phone.value.trim() || undefined } });
      location.replace('/w/' + r.token);
    } catch (err) { msg.innerHTML = `<p class="msg error">${esc(errText(err))}</p>`; btn.disabled = false; }
  };
}

// ---------- follow ----------
let state = null, failures = 0, soundOn = false, pushOn = false, notice = '', lastAlerts = 0, renderedKey = '', wakeLock = null;
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
const pushAvailable = () => Boolean(state?.vapidPublicKey && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && (!isIOS || standalone));

async function keepAwake() {
  try { if ('wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => (wakeLock = null)); } } catch {}
}
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && soundOn && !pushOn && keepAwake());

async function track(reg) {
  const worker = reg.active || reg.waiting || reg.installing;
  if (!worker) throw new Error('no_worker');
  const ch = new MessageChannel();
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), 5000);
    ch.port1.onmessage = (ev) => { clearTimeout(timer); ev.data?.type === 'tracked' ? resolve() : reject(new Error('failed')); };
    worker.postMessage({ type: 'track', token: key, lang, kind: 'w' }, [ch.port2]);
  });
}

async function enableAlerts() {
  soundOn = unlockAudio();
  try { sessionStorage.setItem('zm_sound_w_' + key, '1'); } catch {}
  notice = '';
  if (pushAvailable()) {
    try {
      if ((await Notification.requestPermission()) !== 'granted') notice = a('الإشعارات محظورة من إعدادات المتصفح. بنعتمد على الصوت والصفحة مفتوحة.', 'Notifications are blocked in browser settings. We will rely on sound with this page open.');
      else {
        const reg = await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;
        const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: state.vapidPublicKey }));
        await track(reg);
        await api(`/api/w/${key}/subscribe`, { method: 'POST', body: { endpoint: sub.endpoint } });
        pushOn = true;
      }
    } catch { notice = a('تعذر تفعيل تنبيه شاشة القفل. أبقِ الصفحة مفتوحة ليشتغل الصوت.', 'Could not turn on lock-screen alerts. Keep this page open for sound.'); }
  }
  if (!pushOn) keepAwake();
  render(true);
}

async function act(path) {
  try { state = await api(`/api/w/${key}/${path}`, { method: 'POST', body: {} }); }
  catch { announce(a('تعذر الإرسال. حاول مرة ثانية.', 'Could not send. Please try again.'), true); }
  render(true);
}

function render(force = false) {
  if (!state) return;
  const k = JSON.stringify([state, failures > 1, soundOn, pushOn, notice]);
  if (!force && k === renderedKey) return;
  renderedKey = k;
  setBrandColor(state.brand_color);
  const s = state.status, org = a(state.org_ar, state.org_en), br = a(state.branch_ar, state.branch_en);
  const open = s === 'waiting' || s === 'called';
  let body;
  if (s === 'waiting') {
    body = `<div class="hero-status"><p class="muted">${a('رقمك', 'Your number')}</p><div class="ticket-num" id="wl-number">${esc(state.number)}</div>
      <h1 id="wl-position">${state.position === 1 ? a('أنت التالي!', 'You are next!') : a(`ترتيبك ${state.position}`, `You are #${state.position} in line`)}</h1>
      <p>${a('الانتظار المتوقع', 'Expected wait')}: <b>${esc(mins(state.eta_minutes))}</b> · ${a('عددكم', 'Party')} ${esc(state.party)}</p></div>`;
  } else if (s === 'called') {
    body = `<div class="hero-status ready flash"><div class="ticket-num">${esc(state.number)}</div><h1 id="wl-called">${a('جا دوركم! تفضلوا', 'Your table is ready!')}</h1><p>${a('توجهوا للاستقبال الحين.', 'Please come to the host stand now.')}</p>
      ${state.seen_at ? `<p class="msg">${a('تمام، الموظف يعرف إنكم جايين.', 'Great, the host knows you are coming.')}</p>` : `<button class="btn ok big" id="wl-seen" type="button">${a('جايين ✓', 'On our way ✓')}</button>`}</div>`;
  } else {
    body = `<div class="hero-status"><div class="ticket-num">${esc(state.number)}</div><h1>${s === 'seated' ? a('بالعافية! نتمنى لكم وقت حلو', 'Enjoy your visit!') : s === 'cancelled' ? a('خرجت من قائمة الانتظار.', 'You left the waitlist.') : a('فاتكم الدور.', 'Your turn passed.')}</h1></div>
      ${s !== 'seated' ? `<p class="center"><a class="btn" href="/q/${esc(state.branch_slug)}">${a('سجّل من جديد', 'Join again')}</a></p>` : ''}`;
  }
  main.innerHTML = `<p class="muted center">${esc(org)} · ${esc(br)}</p>
    ${failures > 1 ? `<p class="msg error">${a('نحاول نتصل…', 'Reconnecting…')}</p>` : ''}
    ${body}
    ${open ? `<div class="card stack">
      ${soundOn ? `<p class="msg">${icon("volume")} ${a('الصوت يشتغل ما دامت الصفحة مفتوحة.', 'Sound works while this page stays open.')}</p>` : ''}
      ${pushOn ? `<p class="msg">${icon("phone")} ${a('بننبهك على شاشة القفل.', 'We will alert you on the lock screen.')}</p>` : ''}
      ${!soundOn || (pushAvailable() && !pushOn) ? `<button class="btn big" id="wl-enable" type="button">${icon("bell")} ${pushAvailable() ? a('فعّل التنبيه لما يجي دورك', 'Alert me when it is my turn') : a('فعّل الصوت داخل الصفحة', 'Turn on sound in this page')}</button>` : ''}
      <p class="small muted">${pushAvailable() ? a('بعد السماح بالإشعارات يجيك تنبيه والجوال مقفل. صوته يتبع إعدادات جوالك.', 'After you allow notifications, you get an alert while the phone is locked. Its sound follows your phone settings.') : a('أبقِ الصفحة مفتوحة ليشتغل الصوت.', 'Keep this page open for the sound to work.')}</p>
      ${isIOS && !standalone && state.vapidPublicKey ? `<p class="small">${a('للتنبيه والآيفون مقفل: زر المشاركة ثم «إضافة إلى الشاشة الرئيسية»، وافتحها من هناك.', 'For lock-screen alerts on iPhone: Share, then “Add to Home Screen”, and open it from there.')}</p>` : ''}
      ${notice ? `<p class="msg error small">${esc(notice)}</p>` : ''}
      ${s === 'waiting' ? `<button class="btn ghost sm" id="wl-leave" type="button">${a('اطلع من القائمة', 'Leave the list')}</button>` : ''}
    </div>` : ''}
    <p class="center">${state.loyalty ? `<a href="/j/${esc(state.org_slug)}">${a('سجّل في بطاقة الولاء وأنت تنتظر', 'Join the loyalty card while you wait')}</a> · ` : ''}<a href="/m/${esc(state.branch_slug)}">${a('المنيو', 'Menu')}</a></p>`;
  main.querySelector('#wl-enable')?.addEventListener('click', enableAlerts);
  main.querySelector('#wl-seen')?.addEventListener('click', () => act('seen'));
  main.querySelector('#wl-leave')?.addEventListener('click', () => { if (confirm(a('متأكد تطلع من القائمة؟', 'Leave the waitlist?'))) act('cancel'); });
}

async function poll() {
  try {
    const next = await api('/api/w/' + encodeURIComponent(key));
    failures = 0;
    const called = next.status === 'called' && !next.seen_at && (state?.status !== 'called' || next.alerts_sent > lastAlerts);
    state = next;
    lastAlerts = next.alerts_sent;
    if (called) {
      chime(3);
      if (document.visibilityState === 'hidden' && 'Notification' in window && Notification.permission === 'granted') navigator.serviceWorker?.getRegistration().then((r) => r?.showNotification(a('جا دوركم!', 'Your table is ready!'), { body: `#${next.number}`, tag: 'zm-w-' + key, icon: '/brand/symbol.png' })).catch(() => {});
    }
    render();
  } catch (e) {
    if (e.status === 404) { main.innerHTML = `<p class="msg error">${a('ما لقينا هذا الدور. امسح الرمز مرة ثانية.', 'We could not find this place in line. Scan the code again.')}</p>`; return; }
    failures++;
    render();
  }
  const open = state && (state.status === 'waiting' || state.status === 'called');
  if (open) setTimeout(poll, Math.min(4000 * Math.max(1, failures), 15000));
}

if (kind === 'q') joinPage();
else {
  document.addEventListener('pointerdown', () => unlockAudio(), { once: true });
  try { soundOn = sessionStorage.getItem('zm_sound_w_' + key) === '1' && unlockAudio(); } catch {}
  poll();
}
