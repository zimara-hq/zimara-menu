// Passkeys and signed-in devices, for the account screen and the login page.
import { api, esc, lang, relTime, announce } from './common.js';
const a = (ar, en) => (lang === 'ar' ? ar : en);

const toBuf = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0)).buffer;
const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const passkeysSupported = () => Boolean(window.PublicKeyCredential && navigator.credentials?.create);

async function createCredential(o) {
  const cred = await navigator.credentials.create({ publicKey: {
    ...o, challenge: toBuf(o.challenge), user: { ...o.user, id: toBuf(o.user.id) },
    excludeCredentials: (o.excludeCredentials || []).map((x) => ({ ...x, id: toBuf(x.id) })),
  } });
  const r = cred.response;
  return { id: cred.id, rawId: toB64(cred.rawId), type: cred.type, clientExtensionResults: cred.getClientExtensionResults?.() || {},
    response: { clientDataJSON: toB64(r.clientDataJSON), attestationObject: toB64(r.attestationObject), transports: r.getTransports?.() || [] } };
}

export async function getCredential(o) {
  const cred = await navigator.credentials.get({ publicKey: { ...o, challenge: toBuf(o.challenge), allowCredentials: (o.allowCredentials || []).map((x) => ({ ...x, id: toBuf(x.id) })) } });
  const r = cred.response;
  return { id: cred.id, rawId: toB64(cred.rawId), type: cred.type, clientExtensionResults: cred.getClientExtensionResults?.() || {},
    response: { clientDataJSON: toB64(r.clientDataJSON), authenticatorData: toB64(r.authenticatorData), signature: toB64(r.signature), userHandle: r.userHandle ? toB64(r.userHandle) : undefined } };
}

// Login page: one tap, the phone shows Face ID / fingerprint, then the dashboard.
export async function passkeyLogin() {
  const { challenge_id, options } = await api('/api/passkeys/login/options', { method: 'POST', body: {} });
  const response = await getCredential(options);
  await api('/api/passkeys/login', { method: 'POST', body: { challenge_id, response } });
}

export async function securityPanel(el) {
  const [{ passkeys }, { sessions }] = await Promise.all([api('/api/me/passkeys'), api('/api/me/sessions')]);
  const when = (t) => (t ? relTime(Date.now() - t) : '—');
  el.innerHTML = `<h2>${a('مفاتيح المرور', 'Passkeys')}</h2>
    <p class="muted">${a('ادخل ببصمة الوجه أو الإصبع بدل كلمة المرور. أقوى حماية ضد سرقة الحساب، والمفتاح ما يطلع من جهازك.', 'Sign in with Face ID or a fingerprint instead of a password. The strongest protection against account theft, and the key never leaves your device.')}</p>
    ${passkeys.length ? `<ul class="plain-list" id="pk-list">${passkeys.map((p) => `<li><span>🔑 <b>${esc(p.name)}</b> <small class="muted">${a('آخر استخدام', 'last used')}: ${esc(when(p.last_used_at))}${p.backed_up ? ' · ' + a('محفوظ في حسابك السحابي', 'synced to your cloud account') : ''}</small></span><button type="button" class="btn ghost sm" data-pk="${esc(p.id)}">${a('حذف', 'Remove')}</button></li>`).join('')}</ul>` : ''}
    ${passkeysSupported() ? `<button type="button" class="btn" id="pk-add">${a('أضف مفتاح مرور لهذا الجهاز', 'Add a passkey for this device')}</button>` : `<p class="small muted">${a('هذا المتصفح ما يدعم مفاتيح المرور.', 'This browser does not support passkeys.')}</p>`}
    <div role="status" id="pk-msg"></div>
    <h2 style="margin-top:24px">${a('أجهزتك', 'Your devices')}</h2>
    <ul class="plain-list" id="dev-list">${sessions.map((s) => `<li><span>${s.kind === 'app' ? '📱' : '💻'} <b>${esc(s.label || a('جهاز', 'Device'))}</b>${s.current ? ` <span class="pill">${a('هذا الجهاز', 'This device')}</span>` : ''} <small class="muted">${s.via === 'passkey' ? '🔑 · ' : ''}${a('آخر نشاط', 'last active')}: ${esc(when(s.last_seen_at || s.created_at))}</small></span>${s.current ? '' : `<button type="button" class="btn ghost sm" data-sid="${esc(s.id)}">${a('خروج', 'Sign out')}</button>`}</li>`).join('')}</ul>
    ${sessions.length > 1 ? `<button type="button" class="btn danger" id="dev-others">${a('اخرج من كل الأجهزة الثانية', 'Sign out of all other devices')}</button>` : ''}`;
  const msg = el.querySelector('#pk-msg');
  el.querySelector('#pk-add')?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    try {
      const { challenge_id, options } = await api('/api/me/passkeys/options', { method: 'POST', body: {} });
      const response = await createCredential(options);
      await api('/api/me/passkeys', { method: 'POST', body: { challenge_id, response } });
      announce(a('تمت إضافة مفتاح المرور. المرة الجاية ادخل بالبصمة.', 'Passkey added. Next time, sign in with your face or fingerprint.'));
      await securityPanel(el);
    } catch (err) {
      e.target.disabled = false;
      msg.innerHTML = `<p class="msg error">${err?.name === 'NotAllowedError' ? a('تم الإلغاء.', 'Cancelled.') : err?.data?.error === 'passkeys_limit' ? a('وصلت الحد: 10 مفاتيح.', 'Limit reached: 10 passkeys.') : a('تعذرت الإضافة. حاول مرة ثانية.', 'Could not add it. Please try again.')}</p>`;
    }
  });
  el.querySelectorAll('[data-pk]').forEach((b) => (b.onclick = async () => { if (!confirm(a('حذف مفتاح المرور؟', 'Remove this passkey?'))) return; await api('/api/me/passkeys/' + encodeURIComponent(b.dataset.pk), { method: 'DELETE', body: {} }); await securityPanel(el); }));
  el.querySelectorAll('[data-sid]').forEach((b) => (b.onclick = async () => { await api('/api/me/sessions/' + encodeURIComponent(b.dataset.sid), { method: 'DELETE', body: {} }); announce(a('تم إخراج الجهاز.', 'Device signed out.')); await securityPanel(el); }));
  el.querySelector('#dev-others')?.addEventListener('click', async () => {
    if (!confirm(a('تخرج من كل الأجهزة الثانية؟ هذا الجهاز يبقى داخل.', 'Sign out every other device? This one stays signed in.'))) return;
    const r = await api('/api/me/sessions/sign-out-others', { method: 'POST', body: {} });
    announce(a(`تم إخراج ${r.signed_out} جهاز.`, `Signed out ${r.signed_out} devices.`));
    await securityPanel(el);
  });
}
