import { api, esc, lang, makeT, pick, qrSvg, setBrandColor, topbar, applyTenantFont, requestValue, announce } from './common.js';

const t = makeT({
  ar: { title: 'بطاقة الولاء', code: 'رمز البطاقة', show: 'وري الرمز للكاشير عشان يضيف ختم.', progress: '{n} من {m} أختام', reward: 'المكافأة: {r}', earned: 'عندك مكافأة جاهزة! اطلبها من الكاشير.', history: 'آخر الحركات', stamp: 'ختم', redeem: 'استبدال مكافأة', adjust: 'تعديل', notFound: 'ما لقينا البطاقة.', wallet: 'الإضافة لمحفظة Apple وGoogle قريبًا.' },
  en: { title: 'Loyalty card', code: 'Card code', show: 'Show this code at the counter to get a stamp.', progress: '{n} of {m} stamps', reward: 'Reward: {r}', earned: 'You have a reward ready! Ask the cashier.', history: 'Recent activity', stamp: 'Stamp', redeem: 'Reward redeemed', adjust: 'Adjustment', notFound: 'Card not found.', wallet: 'Add to Apple and Google Wallet is coming soon.' },
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
    const need = c.program.stamps_required;
    const shown = c.stamps % need === 0 && c.stamps > 0 ? need : c.stamps % need;
    main.innerHTML = `
      <div class="card stack" style="text-align:center">
        <h1>${esc(t('title'))}</h1>
        <div class="qr" aria-hidden="true">${qrSvg(c.code, 8)}</div>
        <p>${esc(t('code'))}: <strong style="font-size:28px;letter-spacing:3px">${esc(c.code)}</strong></p>
        <p class="muted">${esc(t('show'))}</p>
      </div>
      <div class="card stack">
        <p><strong>${esc(t('progress', { n: shown, m: need }))}</strong> · ${esc(t('reward', { r: pick(c.program, 'reward') }))}</p>
        <div class="stamps">${Array.from({ length: need }, (_, i) => `<div class="stamp ${i < shown ? 'on' : ''}">${i < shown ? '★' : ''}</div>`).join('')}</div>
        ${c.stamps >= need ? `<p class="msg">${esc(t('earned'))}</p>` : ''}
        <p class="small muted">${esc(t('wallet'))}</p>
      </div>
      ${c.history.length ? `<div class="card"><h2>${esc(t('history'))}</h2><table>${c.history
        .map((h) => `<tr><td>${esc(t(h.kind))}</td><td>${h.delta > 0 ? '+' : ''}${h.delta}</td><td class="muted small">${new Date(h.created_at).toLocaleString(lang === 'ar' ? 'ar-SA' : 'en-GB')}</td></tr>`)
        .join('')}</table></div>` : ''}<p class="small" style="text-align:center"><button class="btn danger sm" id="delete-card" type="button">${lang === 'ar' ? 'إلغاء البطاقة' : 'Revoke card'}</button></p>`;
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
