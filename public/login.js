import { api, esc, makeT, topbar } from './common.js';

const t = makeT({
  ar: { title: 'تسجيل الدخول', email: 'البريد الإلكتروني', password: 'كلمة المرور', go: 'دخول', bad: 'البريد أو كلمة المرور غير صحيحة.', many: 'محاولات كثيرة. انتظر ربع ساعة.', intro: 'منيو إلكتروني، وبيجر على جوال العميل، وبطاقات ولاء — من لوحة وحدة.' },
  en: { title: 'Sign in', email: 'Email', password: 'Password', go: 'Sign in', bad: 'Wrong email or password.', many: 'Too many attempts. Wait 15 minutes.', intro: 'E-menu, a pager on your customer’s phone, and loyalty cards — from one dashboard.' },
});
topbar(document.getElementById('top'), t);
const main = document.getElementById('main');
main.className = 'wrap narrow';

try {
  await api('/api/me');
  location.replace('/app');
} catch {
  main.innerHTML = `
    <form class="card stack" id="f" novalidate>
      <h1>${esc(t('title'))}</h1>
      <p class="muted">${esc(t('intro'))}</p>
      <div><label for="e">${esc(t('email'))}</label><input id="e" type="email" autocomplete="username" required></div>
      <div><label for="p">${esc(t('password'))}</label><input id="p" type="password" autocomplete="current-password" required></div>
      <p id="err" role="alert"></p>
      <button class="btn" type="submit">${esc(t('go'))}</button>
    </form>`;
  main.querySelector('#f').onsubmit = async (ev) => {
    ev.preventDefault();
    const btn = ev.target.querySelector('button');
    btn.disabled = true;
    try {
      await api('/api/login', { method: 'POST', body: { email: main.querySelector('#e').value, password: main.querySelector('#p').value } });
      location.replace('/app');
    } catch (e) {
      main.querySelector('#err').innerHTML = `<span class="msg error">${esc(t(e.status === 429 ? 'many' : 'bad'))}</span>`;
      btn.disabled = false;
    }
  };
}
