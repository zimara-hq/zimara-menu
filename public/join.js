import { api, esc, makeT, topbar } from './common.js';

const t = makeT({
  ar: { title: 'بطاقة الولاء', create: 'أنشئ بطاقتي', have: 'عندك بطاقة على هذا الجوال، نفتحها لك…', none: 'برنامج الولاء غير متاح حاليًا.', intro: 'بطاقة رقمية بدون تسجيل. وريها للكاشير مع كل طلب وتجمع أختامك.' },
  en: { title: 'Loyalty card', create: 'Create my card', have: 'You already have a card on this phone, opening it…', none: 'The loyalty program is not available right now.', intro: 'A digital card with no signup. Show it at the counter with every order to collect stamps.' },
});
const org = location.pathname.split('/')[2];
const main = document.getElementById('main');
main.className = 'wrap narrow';
topbar(document.getElementById('top'), t);

let saved = null;
try { saved = localStorage.getItem('zm_card_' + org); } catch {}
if (saved) {
  main.innerHTML = `<p class="msg">${esc(t('have'))}</p>`;
  location.replace('/c/' + saved);
} else {
  main.innerHTML = `<div class="card stack"><h1>${esc(t('title'))}</h1><p>${esc(t('intro'))}</p><button class="btn big" id="go" type="button">${esc(t('create'))}</button><p id="err"></p></div>`;
  main.querySelector('#go').onclick = async (e) => {
    e.target.disabled = true;
    try {
      const card = await api('/api/cards', { method: 'POST', body: { org } });
      try { localStorage.setItem('zm_card_' + org, card.token); } catch {}
      location.replace('/c/' + card.token);
    } catch {
      e.target.disabled = false;
      main.querySelector('#err').innerHTML = `<span class="msg error">${esc(t('none'))}</span>`;
    }
  };
}
