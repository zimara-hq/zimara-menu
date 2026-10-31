import { api, esc, lang, makeT, topbar } from './common.js';

// Two steps on one page: request a link by email, or set a new password when the
// emailed link carries the token in the URL fragment (never sent to the server in logs).
const t = makeT({
  ar: { title: 'استعادة كلمة المرور', ask: 'اكتب بريدك ونرسل لك رابطًا لتعيين كلمة مرور جديدة.', email: 'البريد الإلكتروني', send: 'أرسل الرابط', sent: 'إذا كان البريد مسجلًا، وصلك رابط صالح لمدة 30 دقيقة.', set: 'كلمة المرور الجديدة', hint: '10 أحرف على الأقل.', save: 'حفظ كلمة المرور', done: 'تم تغيير كلمة المرور. سجّل دخولك.', bad: 'الرابط غير صالح أو انتهى. اطلب رابطًا جديدًا.', weak: 'كلمة المرور قصيرة. استخدم 10 أحرف على الأقل.', off: 'إرسال البريد غير مفعّل بعد. تواصل مع hello@zimara.co.', back: 'رجوع لتسجيل الدخول' },
  en: { title: 'Reset your password', ask: 'Enter your email and we will send a link to set a new password.', email: 'Email address', send: 'Send link', sent: 'If that email has an account, a link valid for 30 minutes is on its way.', set: 'New password', hint: 'At least 10 characters.', save: 'Save password', done: 'Password changed. Please sign in.', bad: 'This link is invalid or expired. Request a new one.', weak: 'Password too short. Use at least 10 characters.', off: 'Email sending is not enabled yet. Contact hello@zimara.co.', back: 'Back to sign in' },
});
topbar(document.getElementById('top'), t);
const main = document.getElementById('main');
const token = decodeURIComponent(location.hash.slice(1));
const say = (el, text, error) => { el.innerHTML = `<p class="msg ${error ? 'error' : ''}" role="${error ? 'alert' : 'status'}">${esc(text)}</p>`; };

main.innerHTML = `<section class="card" style="max-width:460px;margin:40px auto"><h1>${esc(t('title'))}</h1>
  <form id="f" class="stack">${token
    ? `<label for="pw">${esc(t('set'))}</label><input id="pw" type="password" autocomplete="new-password" minlength="10" required><p class="small muted">${esc(t('hint'))}</p><button class="btn" type="submit">${esc(t('save'))}</button>`
    : `<p class="muted">${esc(t('ask'))}</p><label for="em">${esc(t('email'))}</label><input id="em" type="email" autocomplete="email" required><button class="btn" type="submit">${esc(t('send'))}</button>`}
  </form><div id="out"></div><p class="small"><a href="/login">${esc(t('back'))}</a></p></section>`;

document.getElementById('f').addEventListener('submit', async (e) => {
  e.preventDefault();
  const out = document.getElementById('out'), btn = e.currentTarget.querySelector('button');
  btn.disabled = true;
  try {
    if (token) {
      await api('/api/password/reset', { method: 'POST', body: { token, password: document.getElementById('pw').value } });
      history.replaceState(null, '', '/reset');
      say(out, t('done'));
    } else {
      await api('/api/password/forgot', { method: 'POST', body: { email: document.getElementById('em').value } });
      say(out, t('sent'));
    }
  } catch (err) {
    say(out, err?.status === 503 ? t('off') : err?.message === 'weak_password' ? t('weak') : token ? t('bad') : t('off'), true);
    btn.disabled = false;
  }
});
