import { api, esc, lang, makeT, topbar } from './common.js';

const t = makeT({
  ar: { title: 'أهلًا بعودتك.', email: 'البريد الإلكتروني', password: 'كلمة المرور', go: 'دخول لوحة التحكم', bad: 'تحقق من البريد وكلمة المرور وحاول مرة أخرى.', many: 'محاولات كثيرة. انتظر ربع ساعة ثم حاول مجددًا.', intro: 'مساحتك لإدارة المنيو والنداء والولاء.', new: 'أول مرة مع زيمارا؟', create: 'أنشئ حساب منشأتك', story: 'كل تفاصيل منشأتك. في مكان واحد.', subtitle: 'زيمارا منيو', point1: 'منيو يتحدث معك، لحظة بلحظة', point2: 'نداء واضح من الكاشير إلى العميل', point3: 'ولاء يرجّعهم لك', code: 'رمز التحقق بخطوتين', codeHint: 'اكتب رمز تطبيق المصادقة، أو رمز استرداد.', recover: 'استخدم رمز استرداد', wrongCode: 'رمز التحقق غير صحيح. جرّب الرمز الحالي.' },
  en: { title: 'Welcome back.', email: 'Email address', password: 'Password', go: 'Open dashboard', bad: 'Check your email and password, then try again.', many: 'Too many attempts. Wait 15 minutes before trying again.', intro: 'Your workspace for menus, customer calls and loyalty.', new: 'New to ZIMARA?', create: 'Create a business account', story: 'Every business detail. One place.', subtitle: 'ZIMARA Menu', point1: 'Your menu, always up to date', point2: 'Clear calls from counter to customer', point3: 'Loyalty worth coming back for', code: 'Two-step verification code', codeHint: 'Use your authenticator code or a recovery code.', recover: 'Use a recovery code', wrongCode: 'That code did not work. Try the current code.' },
});
topbar(document.getElementById('top'), t);
const main = document.getElementById('main');
document.title = `${t('title')} · ${t('brand')}`;
main.className = 'auth-layout';
try {
  await api('/api/me');
  location.replace('/app');
} catch {
  main.innerHTML = `
    <aside class="auth-story" aria-label="${esc(t('subtitle'))}"><div><span class="pill">${esc(t('subtitle'))}</span><h2>${esc(t('story'))}</h2><p>${esc(t('intro'))}</p></div><ul class="auth-points"><li>${esc(t('point1'))}</li><li>${esc(t('point2'))}</li><li>${esc(t('point3'))}</li></ul></aside>
    <div class="auth-content"><form class="card stack" id="f" novalidate>
      <div><span class="eyebrow">ZIMARA WORKSPACE</span><h1>${esc(t('title'))}</h1><p class="auth-intro">${esc(t('intro'))}</p></div>
      <div><label for="e">${esc(t('email'))}</label><input id="e" type="email" autocomplete="username" required maxlength="200"></div>
      <div><label for="p">${esc(t('password'))}</label><input id="p" type="password" autocomplete="current-password" required></div>
      <div id="mfa-fields" hidden><label for="mfa-code">${esc(t('code'))}</label><input id="mfa-code" name="code" type="text" autocomplete="one-time-code" aria-describedby="mfa-help"><p id="mfa-help" class="small muted">${esc(t('codeHint'))}</p><label><input type="checkbox" id="recovery"> ${esc(t('recover'))}</label></div>
      <p id="err" role="alert"></p><button class="btn" type="submit">${esc(t('go'))}</button>
    </form><p class="auth-footer">${esc(t('new'))} <a href="/register">${esc(t('create'))}</a></p><p class="small"><a href="/reset">${esc(lang === 'ar' ? 'نسيت كلمة المرور؟' : 'Forgot your password?')}</a></p>${new URLSearchParams(location.search).get('verified') === '1' ? `<p class="msg" role="status">${esc(lang === 'ar' ? 'تأكد بريدك. سجّل دخولك.' : 'Email confirmed. Please sign in.')}</p>` : new URLSearchParams(location.search).get('verified') === '0' ? `<p class="msg error" role="alert">${esc(lang === 'ar' ? 'رابط التأكيد غير صالح أو انتهى.' : 'This confirmation link is invalid or expired.')}</p>` : ''}</div>`;
  main.querySelector('#f').onsubmit = async (ev) => {
    ev.preventDefault();
    const btn = ev.target.querySelector('button');
    const email = main.querySelector('#e');
    const password = main.querySelector('#p');
    const err = main.querySelector('#err');
    if (!email.value.trim() || !email.validity.valid || !password.value) {
      err.innerHTML = `<span class="msg error">${esc(t('bad'))}</span>`;
      (!email.value || !email.validity.valid ? email : password).focus();
      return;
    }
    btn.disabled = true; btn.setAttribute('aria-busy', 'true'); err.textContent = '';
    const payload = { email: email.value.trim(), password: password.value };
    const code = main.querySelector('#mfa-code').value.trim();
    if (code) payload[main.querySelector('#recovery').checked ? 'recovery_code' : 'code'] = code;
    try {
      await api('/api/login', { method: 'POST', body: payload });
      location.replace('/app');
    } catch (e) {
      if (e.message === 'mfa_required' || e.message === 'invalid_mfa_code') {
        main.querySelector('#mfa-fields').hidden = false;
        if (e.message !== 'mfa_required') err.innerHTML = `<span class="msg error">${esc(t('wrongCode'))}</span>`;
        main.querySelector('#mfa-code').focus();
      } else err.innerHTML = `<span class="msg error">${esc(t(e.status === 429 ? 'many' : 'bad'))}</span>`;
    } finally { btn.disabled = false; btn.removeAttribute('aria-busy'); }
  };
}
