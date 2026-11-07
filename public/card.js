import { icon } from './icons.js';
import { api, esc, lang, makeT, pick, qrSvg, setBrandColor, topbar, applyTenantFont, requestValue, announce } from './common.js';

const t = makeT({
  ar: { title: 'بطاقة الولاء', code: 'رمز البطاقة', show: 'وري الرمز للكاشير عشان يضيف ختم.', progress: '{n} من {m} أختام', reward: 'المكافأة: {r}', earned: 'عندك مكافأة جاهزة! اطلبها من الكاشير.', history: 'آخر الحركات', stamp: 'ختم', redeem: 'استبدال مكافأة', adjust: 'تعديل', notFound: 'ما لقينا البطاقة.' },
  en: { title: 'Loyalty card', code: 'Card code', show: 'Show this code at the counter to get a stamp.', progress: '{n} of {m} stamps', reward: 'Reward: {r}', earned: 'You have a reward ready! Ask the cashier.', history: 'Recent activity', stamp: 'Stamp', redeem: 'Reward redeemed', adjust: 'Adjustment', notFound: 'Card not found.' },
});
const token = location.pathname.split('/')[2];
let revoked = false;
const main = document.getElementById('main');
main.className = 'wrap narrow';

async function load() {
  if (revoked) return;
  try {
    const c = await api('/api/cards/' + token);
    try { localStorage.setItem('zm_card_' + c.org.slug, token); } catch {}
    setBrandColor(c.org.brand_color);
    api('/api/public/profile/' + c.org.slug).then(p => applyTenantFont(p.profile.font_url)).catch(() => {});
    topbar(document.getElementById('top'), t, { subtitle: pick(c.org, 'name') });
    const pts = c.program.kind === 'points', need = c.program.need || c.program.stamps_required;
    const shown = c.stamps % need === 0 && c.stamps > 0 ? need : c.stamps % need;
    const A = (ar, en) => (lang === 'ar' ? ar : en);
    const pushOk = Boolean(c.vapidPublicKey && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && (!/iPad|iPhone|iPod/.test(navigator.userAgent) || matchMedia('(display-mode: standalone)').matches || navigator.standalone));
    let alertsOn = false; try { alertsOn = localStorage.getItem('zm_card_push_' + token) === '1' && Notification.permission === 'granted'; } catch {}
    main.innerHTML = `
      <div class="card stack" style="text-align:center">
        <h1>${esc(t('title'))}</h1>
        <div class="qr" aria-hidden="true">${qrSvg(c.code, 8)}</div>
        <p>${esc(t('code'))}: <strong style="font-size:28px;letter-spacing:3px">${esc(c.code)}</strong></p>
        <p class="muted">${esc(pts ? A('وري الرمز للكاشير عشان يضيف نقاطك.', 'Show this code at the counter to earn points.') : t('show'))}</p>
      </div>
      <div class="card stack">
        ${pts ? `<p><strong id="points-balance">${esc(A(`${c.stamps} نقطة`, `${c.stamps} points`))}</strong> · ${esc(t('reward', { r: pick(c.program, 'reward') }))} (${need})</p>
        <div class="points-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${need}" aria-valuenow="${Math.min(c.stamps, need)}"><span style="width:${Math.min(100, Math.round((c.stamps / need) * 100))}%"></span></div>
        <p class="small muted">${esc(A(`كل ريال = ${c.program.points_per_sar} نقطة`, `Every riyal = ${c.program.points_per_sar} points`))}</p>` : `<p><strong>${esc(t('progress', { n: shown, m: need }))}</strong> · ${esc(t('reward', { r: pick(c.program, 'reward') }))}</p>
        <div class="stamps">${Array.from({ length: need }, (_, i) => `<div class="stamp ${i < shown ? 'on' : ''}">${i < shown ? '★' : ''}</div>`).join('')}</div>`}
        ${c.stamps >= need ? `<p class="msg">${esc(t('earned'))}</p>` : ''}
      </div>
      ${c.messages?.length ? `<div class="card stack" id="card-inbox"><h2>${A('رسائل لك', 'For you')}</h2>${c.messages.map((m) => `<article class="inbox-msg"><b>${esc(pick(m, 'title'))}</b><p>${esc(pick(m, 'body'))}</p><small class="muted">${new Date(m.created_at).toLocaleDateString(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB')}</small></article>`).join('')}</div>` : ''}
      ${pushOk && !alertsOn ? `<p class="center"><button class="btn ghost" id="card-alerts" type="button">${icon("bell")} ${A('وصلني العروض على جوالي', 'Send offers to my phone')}</button></p>` : ''}
      ${alertsOn ? `<p class="center"><button class="btn ghost sm" id="card-alerts-off" type="button">${A('إيقاف رسائل العروض', 'Stop offer messages')}</button></p>` : ''}
      ${c.history.length ? `<div class="card"><h2>${esc(t('history'))}</h2><table>${c.history
        .map((h) => `<tr><td>${esc(pts && h.kind === 'stamp' ? A('نقاط', 'Points') : t(h.kind))}</td><td>${h.delta > 0 ? '+' : ''}${h.delta}</td><td class="muted small">${new Date(h.created_at).toLocaleString(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB')}</td></tr>`)
        .join('')}</table></div>` : ''}<p class="small" style="text-align:center"><button class="btn danger sm" id="delete-card" type="button">${lang === 'ar' ? 'إلغاء البطاقة' : 'Revoke card'}</button></p>`;
    main.querySelector('#card-alerts')?.addEventListener('click', async (e) => {
      e.target.disabled = true;
      try {
        if ((await Notification.requestPermission()) !== 'granted') throw new Error('denied');
        const reg = await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;
        const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: c.vapidPublicKey }));
        const worker = reg.active || reg.waiting || reg.installing;
        worker?.postMessage({ type: 'track', token, lang, kind: 'c' });
        await api('/api/cards/' + token + '/subscribe', { method: 'POST', body: { endpoint: sub.endpoint } });
        try { localStorage.setItem('zm_card_push_' + token, '1'); } catch {}
        announce(A('تمام! بتوصلك العروض على جوالك.', 'Done! Offers will reach your phone.'));
        e.target.remove();
      } catch { e.target.disabled = false; announce(A('ما قدرنا نفعّل الإشعارات. تأكد من إذن المتصفح.', 'Could not turn on notifications. Check the browser permission.'), true); }
    });
    // Marketing messages need a one-tap opt-out (PDPL and CST rules on promotional messages).
    main.querySelector('#card-alerts-off')?.addEventListener('click', async (e) => {
      e.target.disabled = true;
      try {
        const reg = await navigator.serviceWorker.getRegistration('/sw.js');
        const sub = await reg?.pushManager.getSubscription();
        await api('/api/cards/' + token + '/unsubscribe', { method: 'POST', body: { endpoint: sub?.endpoint || null } });
        try { localStorage.removeItem('zm_card_push_' + token); } catch {}
        announce(A('تم. لن تصلك رسائل العروض.', 'Done. You will not receive offer messages.'));
        e.target.remove();
      } catch { e.target.disabled = false; announce(A('تعذر الإيقاف. حاول مرة ثانية.', 'Could not stop messages. Try again.'), true); }
    });
    main.querySelector('#delete-card').onclick = async e => {
      const confirm = await requestValue({title: lang === 'ar' ? 'إلغاء بطاقة الولاء' : 'Revoke loyalty card',label: lang === 'ar' ? 'اكتب DELETE CARD لإلغاء الرمز نهائيًا' : 'Type DELETE CARD to permanently revoke this code',hint: lang === 'ar' ? 'لن يعود الرمز صالحًا. يبقى سجل الحركات غير التعريفي محفوظًا.' : 'The code will stop working. The nonidentifying ledger is retained.',confirmLabel: lang === 'ar' ? 'إلغاء البطاقة' : 'Revoke card'});
      if(confirm !== 'DELETE CARD') return; e.target.disabled=true;
      try { await api('/api/cards/' + token + '/delete', {method:'POST',body:{confirm}}); revoked = true; try { localStorage.removeItem('zm_card_' + c.org.slug); } catch {} main.innerHTML='<div class="card"><h1>' + (lang === 'ar' ? 'تم إلغاء البطاقة.' : 'Card revoked.') + '</h1><p>' + (lang === 'ar' ? 'لم يعد رمز البطاقة صالحًا للاستخدام. يحتفظ النظام بسجل الحركات غير التعريفي.' : 'The card code no longer works. A nonidentifying transaction ledger is retained.') + '</p></div>'; }
      catch { e.target.disabled=false; announce(lang === 'ar' ? 'تعذر إلغاء البطاقة. حاول مجددًا.' : 'Could not revoke the card. Please retry.', true); }
    };
  } catch {
    topbar(document.getElementById('top'), t);
    main.innerHTML = `<p class="msg error">${esc(t('notFound'))}</p>`;
  }
}
load();
setInterval(() => document.visibilityState === 'visible' && load(), 15000);
