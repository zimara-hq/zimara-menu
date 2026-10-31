import { body, rateLimit, audit } from './context.js';
import { hashPassword, validPassword } from './auth.js';
import { HttpError, bad, hmac, now, randomToken } from './util.js';

// Transactional email through Resend. Tokens are random, stored only as HMACs, single use,
// and short-lived. Responses never reveal whether an email address has an account.
const TTL = { verify: 48 * 3600000, reset: 30 * 60000 };

export const mailConfigured = (env) => Boolean(env.RESEND_API_KEY && env.MAIL_FROM && env.PUBLIC_BASE_URL);
const http = (env) => env.HTTP_FETCH || fetch;
const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

export async function send(env, to, subject, lines, link, cta, footer = 'إذا ما طلبت هذا، تجاهل الرسالة.') {
  const html = `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;background:#faf8fb;padding:24px;color:#23003f">
<div style="max-width:520px;margin:auto;background:#fff;border:1px solid #ded5e6;border-radius:16px;padding:28px">
<p style="margin:0 0 16px;font-weight:700;letter-spacing:.12em">ZIMARA · زيمارا منيو</p>
${lines.map((l) => `<p style="margin:0 0 12px;line-height:1.7">${esc(l)}</p>`).join('')}
<p style="margin:24px 0"><a href="${esc(link)}" style="background:#23003f;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:700">${esc(cta)}</a></p>
<p style="margin:0;color:#65536f;font-size:13px">${esc(footer)}</p></div></div>`;
  const res = await http(env)('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + env.RESEND_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, html }),
  });
  if (!res.ok) throw new HttpError(502, 'mail_provider_error');
}

async function issue(env, userId, purpose) {
  const token = randomToken(32);
  const t = now();
  await env.DB.batch([
    env.DB.prepare('UPDATE email_tokens SET used_at = ? WHERE user_id = ? AND purpose = ? AND used_at IS NULL').bind(t, userId, purpose),
    env.DB.prepare('INSERT INTO email_tokens (token_hash, user_id, purpose, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(await hmac(env.AUTH_SECRET, 'email:' + token), userId, purpose, t + TTL[purpose], t),
  ]);
  return token;
}

// Marks the token used and returns its user, or null. The UPDATE ... WHERE used_at IS NULL makes it single use.
async function consume(env, token, purpose) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
  const hash = await hmac(env.AUTH_SECRET, 'email:' + token);
  const t = now();
  const r = await env.DB.prepare('UPDATE email_tokens SET used_at = ? WHERE token_hash = ? AND purpose = ? AND used_at IS NULL AND expires_at > ?').bind(t, hash, purpose, t).run();
  if (!r.meta?.changes) return null;
  return env.DB.prepare('SELECT user_id FROM email_tokens WHERE token_hash = ?').bind(hash).first();
}

export async function sendVerification(env, user) {
  if (!mailConfigured(env)) return 'needs_provider';
  const token = await issue(env, user.id, 'verify');
  const link = `${env.PUBLIC_BASE_URL.replace(/\/$/, '')}/api/email/verify?token=${encodeURIComponent(token)}`;
  await send(env, user.email, 'أكّد بريدك في زيمارا منيو', [`أهلًا ${user.name || ''}،`, 'اضغط الزر لتأكيد بريدك وتفعيل حسابك.'], link, 'تأكيد البريد');
  return 'sent';
}

export function registerMail(app) {
  app.post('/api/password/forgot', async (c) => {
    await rateLimit(c, 'forgot', { limit: 5, window: 3600000 });
    if (!mailConfigured(c.env)) throw new HttpError(503, 'mail_not_configured');
    const b = await body(c);
    const email = String(b.email || '').trim().toLowerCase().slice(0, 200);
    const user = email ? await c.env.DB.prepare('SELECT id, email, name, disabled FROM users WHERE email = ?').bind(email).first() : null;
    if (user && !user.disabled) {
      const token = await issue(c.env, user.id, 'reset');
      const link = `${c.env.PUBLIC_BASE_URL.replace(/\/$/, '')}/reset#${encodeURIComponent(token)}`;
      await send(c.env, user.email, 'استعادة كلمة المرور · زيمارا منيو', ['وصلنا طلب لتغيير كلمة مرور حسابك.', 'الرابط صالح لمدة 30 دقيقة ولمرة واحدة.'], link, 'تعيين كلمة مرور جديدة');
      await audit(c.env, { id: user.id }, 'password.reset_requested', null);
    }
    return c.json({ ok: true });
  });

  app.post('/api/password/reset', async (c) => {
    await rateLimit(c, 'reset', { limit: 10, window: 3600000 });
    const b = await body(c);
    if (!validPassword(b.password)) throw bad('weak_password');
    const row = await consume(c.env, b.token, 'reset');
    if (!row) throw bad('invalid_or_expired_token');
    await c.env.DB.batch([
      c.env.DB.prepare('UPDATE users SET password_hash = ?, email_verified = 1 WHERE id = ?').bind(await hashPassword(b.password), row.user_id),
      c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(row.user_id),
    ]);
    await audit(c.env, { id: row.user_id }, 'password.reset', null);
    return c.json({ ok: true });
  });

  app.get('/api/email/verify', async (c) => {
    const row = await consume(c.env, c.req.query('token'), 'verify');
    if (row) await c.env.DB.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').bind(row.user_id).run();
    return c.redirect(row ? '/login?verified=1' : '/login?verified=0', 302);
  });
}
