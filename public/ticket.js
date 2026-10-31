import { api, chime, esc, lang, makeT, pick, setBrandColor, topbar, unlockAudio, announce, applyTenantFont } from './common.js';

const t = makeT({
  ar: {
    title: 'طلبك', number: 'رقم طلبك', preparing: 'طلبك قيد التحضير', preparingHint: 'خذ راحتك… بنناديك أول ما يجهز.',
    ready: 'طلبك جاهز!', readyHint: 'توجّه لنقطة الاستلام الحين.', seenBtn: 'شفت التنبيه', seenDone: 'تمام، الموظف يعرف إنك شفت التنبيه.',
    collected: 'تم الاستلام، بالعافية!', cancelled: 'تم إلغاء هذا الطلب.',
    enable: 'فعّل التنبيه بالصوت', enabled: 'التنبيه مفعّل', enableHint: 'الصوت يحتاج الصفحة مفتوحة. تنبيه شاشة القفل يعتمد على تفعيل الإشعارات ودعم المتصفح وإعدادات الجهاز؛ لا نضمن الصوت في الوضع الصامت.',
    iosHint: 'على الآيفون: اضغط زر المشاركة ثم «إضافة إلى الشاشة الرئيسية» وافتح الصفحة منها، عشان يوصلك التنبيه والجوال مقفل.',
    notifDenied: 'الإشعارات مرفوضة من إعدادات المتصفح. بنعتمد على الصوت والصفحة مفتوحة.',
    rateQ: 'كيف كانت تجربتك؟', thanks: 'شكرًا على تقييمك!', google: 'قيّمنا على خرائط Google', send: 'إرسال', comment: 'ملاحظة (اختياري)',
    notFound: 'ما لقينا هذا الطلب. تأكد من الرابط أو امسح الرمز مرة ثانية.', loyalty: 'اجمع أختامك ببطاقة الولاء',
    steps: 'التحضير ← جاهز ← الاستلام', reconnecting: 'نحاول نعيد الاتصال…', alerts: 'تنبيهات مرسلة: {n}',
  },
  en: {
    title: 'Your order', number: 'Your order number', preparing: 'Your order is being prepared', preparingHint: 'Relax — we will call you the moment it is ready.',
    ready: 'Your order is ready!', readyHint: 'Head to the pickup point now.', seenBtn: 'I saw the alert', seenDone: 'Got it — staff know you saw the alert.',
    collected: 'Collected. Enjoy!', cancelled: 'This order was cancelled.',
    enable: 'Turn on sound alerts', enabled: 'Alerts are on', enableHint: 'Sound needs this page open. Lock-screen alerts depend on notification permission, browser support and device settings. Silent-mode sound is not guaranteed.',
    iosHint: 'On iPhone: tap Share, then “Add to Home Screen”, and open the page from there to get alerts on the lock screen.',
    notifDenied: 'Notifications are blocked in browser settings. We will rely on sound with this page open.',
    rateQ: 'How was your experience?', thanks: 'Thanks for rating!', google: 'Rate us on Google Maps', send: 'Send', comment: 'Comment (optional)',
    notFound: 'We could not find this order. Check the link or scan the code again.', loyalty: 'Collect stamps with the loyalty card',
    steps: 'Preparing → Ready → Collected', reconnecting: 'Reconnecting…', alerts: 'Alerts sent: {n}',
  },
});

const token = location.pathname.split('/')[2];
const main = document.getElementById('main');
main.className = 'wrap narrow';
topbar(document.getElementById('top'), t);
document.title = `${t('brand')} · ${t('title')}`;

let state = null;
let lastAlerts = 0;
let soundOn = false;
let failures = 0;
let wakeLock = null;
let notice = '';
let sector = 'cafe';
let gameType = 'none';
let profileLoaded = false;
let renderedKey = '';
let gameState = null;

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;

async function keepAwake() {
  try {
    if ('wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => (wakeLock = null));
    }
  } catch {}
}
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && soundOn && keepAwake());

async function enableAlerts() {
  soundOn = unlockAudio();
  try { sessionStorage.setItem('zm_sound_' + token, '1'); } catch {}
  keepAwake();
  notice = '';
  if ('serviceWorker' in navigator && 'PushManager' in window && state?.vapidPublicKey) {
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') notice = t('notifDenied');
      else {
        const reg = await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;
        reg.active?.postMessage({ type: 'track', token, lang });
        const sub = (await reg.pushManager.getSubscription()) ||
          (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: state.vapidPublicKey }));
        await api(`/api/t/${token}/subscribe`, { method: 'POST', body: { endpoint: sub.endpoint } });
      }
    } catch {
      notice = t('notifDenied');
    }
  } else if (isIOS && !standalone) {
    notice = t('iosHint');
  }
  render();
}

async function markSeen() {
  try {
    state = { ...state, ...(await api(`/api/t/${token}/seen`, { method: 'POST', body: {} })) };
  } catch { announce(lang === 'ar' ? 'لم نتمكن من تأكيد رؤية التنبيه. حاول مجددًا.' : 'Could not acknowledge the alert. Please retry.', true); }
  render();
}

async function rate(stars, comment) {
  try {
    state = { ...state, ...(await api(`/api/t/${token}/rate`, { method: 'POST', body: { rating: stars, comment: comment || undefined } })) };
  } catch { announce(lang === 'ar' ? 'تعذر إرسال التقييم. حاول مجددًا.' : 'Could not send your rating. Please retry.', true); }
  render();
}

function render() {
  if (!state) return;
  const key = JSON.stringify([state, failures > 1, soundOn, notice, sector, gameType]);
  if (renderedKey === key) return;
  renderedKey = key;
  const previousComment = main.querySelector('#cm')?.value || '';
  setBrandColor(state.brand_color);
  const s = state.status;
  const org = lang === 'ar' ? state.org_ar : state.org_en;
  const branch = lang === 'ar' ? state.branch_ar : state.branch_en;
  let body = '';
  if (s === 'preparing' || s === 'ready') {
    body = `
      <div class="hero-status ${s === 'ready' ? 'ready flash' : ''}">
        <p class="muted">${esc(t('number'))}</p>
        <div class="ticket-num">${esc(state.number)}</div>
        <h1>${esc(['clinic','bank','service'].includes(sector) ? (lang === 'ar' ? (s === 'ready' ? 'حان دورك!' : 'دورك في الانتظار') : (s === 'ready' ? 'It is your turn!' : 'You are in the queue')) : t(s))}</h1>
        <p>${esc(['clinic','bank','service'].includes(sector) ? (lang === 'ar' ? (s === 'ready' ? 'توجّه لنقطة الخدمة الآن.' : 'سننبهك عند حلول دورك.') : (s === 'ready' ? 'Head to the service point now.' : 'We will notify you when it is your turn.')) : t(s + 'Hint'))}</p>
        ${s === 'ready' && !state.seen_at ? `<button class="btn ok big" id="seen" type="button">${esc(t('seenBtn'))}</button>` : ''}
        ${s === 'ready' && state.seen_at ? `<p class="msg">${esc(t('seenDone'))}</p>` : ''}
      </div>
      <div class="card stack">
        ${soundOn ? `<p class="msg">🔔 ${esc(t('enabled'))}</p>` : `<button class="btn big" id="enable" type="button" style="width:100%">🔔 ${esc(t('enable'))}</button>`}
        <p class="small muted">${esc(t('enableHint'))}</p>
        ${isIOS && !standalone ? `<p class="small">${esc(t('iosHint'))}</p>` : ''}
        ${notice ? `<p class="msg error small">${esc(notice)}</p>` : ''}
        ${!state.vapidPublicKey ? `<p class="small muted">${lang === 'ar' ? 'اترك هذه الصفحة مفتوحة، وننبهك بالصوت والاهتزاز لحظة جاهزية طلبك.' : 'Keep this page open and we will alert you with sound and vibration when your order is ready.'}</p>` : ''}
      </div>${s === 'preparing' && gameType !== 'none' ? '<section class="card wait-game" id="waiting-game"></section>' : ''}`;
  } else if (s === 'collected') {
    body = `
      <div class="hero-status"><div class="ticket-num">${esc(state.number)}</div><h1>${esc(t('collected'))}</h1></div>
      <div class="card stack">
        ${state.rating ? `<p class="msg">${esc(t('thanks'))} ${'★'.repeat(state.rating)}</p>` : `
          <h2>${esc(t('rateQ'))}</h2>
          <div class="row" role="group" aria-label="${esc(t('rateQ'))}">
            ${[1, 2, 3, 4, 5].map((n) => `<button class="btn ghost" data-star="${n}" type="button" aria-label="${n}">${'★'.repeat(n)}</button>`).join('')}
          </div>
          <label for="cm">${esc(t('comment'))}</label><textarea id="cm" maxlength="500"></textarea>`}
        ${state.google_review_url ? `<a class="btn" href="${esc(state.google_review_url)}" target="_blank" rel="noopener">${esc(t('google'))}</a>` : ''}
      </div>`;
  } else {
    body = `<div class="hero-status"><div class="ticket-num">${esc(state.number)}</div><h1>${esc(t('cancelled'))}</h1></div>`;
  }
  main.innerHTML = `
    <p class="muted" style="text-align:center;margin-top:16px">${esc(org)} · ${esc(branch)}</p>
    ${failures > 1 ? `<p class="msg error">${esc(t('reconnecting'))}</p>` : ''}
    ${body}
    <p style="text-align:center"><a href="/j/${esc(state.org_slug)}">${esc(t('loyalty'))}</a> · <a href="/m/${esc(state.branch_slug)}">${lang === 'ar' ? 'المنيو' : 'Menu'}</a></p>`;
  if (main.querySelector('#cm')) main.querySelector('#cm').value = previousComment;
  if (main.querySelector('#waiting-game')) renderWaitingGame(main.querySelector('#waiting-game'));
  main.querySelector('#enable')?.addEventListener('click', enableAlerts);
  main.querySelector('#seen')?.addEventListener('click', markSeen);
  main.querySelectorAll('[data-star]').forEach((b) =>
    b.addEventListener('click', () => rate(Number(b.dataset.star), main.querySelector('#cm')?.value.trim())),
  );
}

async function poll() {
  try {
    const next = await api('/api/t/' + token);
    failures = 0;
    const becameReady = next.status === 'ready' && (state?.status !== 'ready' || next.alerts_sent > lastAlerts);
    state = next;
    if (!profileLoaded) {
      profileLoaded = true;
      try { const profile = await api('/api/public/profile/' + state.org_slug); applyTenantFont(profile.profile.font_url); sector = profile.profile.sector; gameType = profile.branches.find(b => b.slug === state.branch_slug)?.settings?.game || 'none'; } catch {}
    }
    if (becameReady && !next.seen_at) {
      chime(3);
      if (document.visibilityState === 'hidden' && 'Notification' in window && Notification.permission === 'granted') {
        navigator.serviceWorker?.getRegistration().then((r) => r?.showNotification(t('ready'), { body: `#${next.number}`, tag: 'zm-' + token, icon: '/brand/symbol.png' })).catch(() => {});
      }
    }
    lastAlerts = next.alerts_sent;
    render();
  } catch (e) {
    if (e.status === 404) {
      main.innerHTML = `<p class="msg error">${esc(t('notFound'))}</p>`;
      return;
    }
    failures++;
    render();
  }
  const closed = state && (state.status === 'collected' || state.status === 'cancelled');
  if (!closed || !state.rating) setTimeout(poll, closed ? 15000 : Math.min(3000 * Math.max(1, failures), 15000));
}

// Audio needs a gesture after reload; the first tap anywhere re-arms it.
document.addEventListener('pointerdown', () => unlockAudio(), { once: true });
try { soundOn = sessionStorage.getItem('zm_sound_' + token) === '1' && unlockAudio(); } catch {}
poll();


function renderWaitingGame(el) {
  const a = (ar,en) => lang === 'ar' ? ar : en;
  if (!gameState) {
    const cards = gameType === 'beans' ? ['☕','☕','◉','◉','◌','◌','✦','✦'] : ['☀','☀','☾','☾','✦','✦','◇','◇'];
    for (let i = cards.length - 1; i > 0; i--) { const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1); [cards[i],cards[j]] = [cards[j],cards[i]]; }
    gameState = { cards, open: [], matched: [], moves: 0, busy: false };
  }
  const g = gameState;
  el.innerHTML = `<h2>${a(gameType === 'beans' ? 'حبات القهوة' : 'لحظة ذاكرة', gameType === 'beans' ? 'Coffee pairs' : 'A moment of memory')}</h2><p class="small muted">${a('لعبة قصيرة للتسلية فقط، بدون جوائز أو مكافآت.', 'A short game just for fun. No prizes or rewards.')}</p><div class="wait-game-grid">${g.cards.map((symbol,i)=>`<button type="button" class="btn ghost" data-card="${i}" ${g.matched.includes(i)?'disabled':''} aria-label="${esc(a('بطاقة','Card')+' '+(i+1))}" aria-pressed="${g.open.includes(i)||g.matched.includes(i)}">${g.open.includes(i)||g.matched.includes(i)?symbol:'?'}</button>`).join('')}</div><p class="small" role="status">${g.matched.length === g.cards.length ? a('أحسنت! أكملت كل الأزواج.', 'Well done! You found every pair.') : a('عدد المحاولات: ', 'Turns: ')+g.moves}</p><button class="btn ghost sm" id="restart-game" type="button">${a('جولة جديدة','New round')}</button>`;
  el.querySelector('#restart-game').onclick = () => { gameState = null; renderWaitingGame(el); };
  el.querySelectorAll('[data-card]').forEach(button => button.onclick = () => {
    const i = Number(button.dataset.card);
    if (g.busy || g.open.includes(i) || g.matched.includes(i)) return;
    g.open.push(i);
    if (g.open.length === 2) {
      g.moves++;
      if (g.cards[g.open[0]] === g.cards[g.open[1]]) { g.matched.push(...g.open); g.open = []; }
      else { g.busy = true; setTimeout(() => { g.open=[];g.busy=false; if (el.isConnected && gameState === g) renderWaitingGame(el); },700); }
    }
    renderWaitingGame(el);
  });
}
