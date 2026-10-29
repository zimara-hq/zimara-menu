import { api, esc, lang, makeT, pick, qrSvg, setBrandColor, topbar } from './common.js';

const t = makeT({
  ar: { title: 'بطاقة الولاء', code: 'رمز البطاقة', show: 'وري الرمز للكاشير عشان يضيف ختم.', progress: '{n} من {m} أختام', reward: 'المكافأة: {r}', earned: 'عندك مكافأة جاهزة! اطلبها من الكاشير.', history: 'آخر الحركات', stamp: 'ختم', redeem: 'استبدال مكافأة', adjust: 'تعديل', notFound: 'ما لقينا البطاقة.', wallet: 'الإضافة لمحفظة Apple وGoogle قريبًا.' },
  en: { title: 'Loyalty card', code: 'Card code', show: 'Show this code at the counter to get a stamp.', progress: '{n} of {m} stamps', reward: 'Reward: {r}', earned: 'You have a reward ready! Ask the cashier.', history: 'Recent activity', stamp: 'Stamp', redeem: 'Reward redeemed', adjust: 'Adjustment', notFound: 'Card not found.', wallet: 'Add to Apple and Google Wallet is coming soon.' },
});
const token = location.pathname.split('/')[2];
const main = document.getElementById('main');
main.className = 'wrap narrow';

async function load() {
  try {
    const c = await api('/api/cards/' + token);
    try { localStorage.setItem('zm_card_' + c.org.slug, token); } catch {}
    setBrandColor(c.org.brand_color);
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
        .join('')}</table></div>` : ''}`;
  } catch {
    topbar(document.getElementById('top'), t);
    main.innerHTML = `<p class="msg error">${esc(t('notFound'))}</p>`;
  }
}
load();
setInterval(() => document.visibilityState === 'visible' && load(), 15000);
