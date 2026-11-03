// Account security for web and apps: the list of signed-in devices (sign one out,
// or all others), and passkeys (Face ID / fingerprint / device PIN) to sign in
// without a password.
import { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server';
import { requireRole, body, audit, rateLimit, isSecure } from './context.js';
import { bad, notFound, str, id, now, b64url, fromB64url, HttpError } from './util.js';
import { createSession, sessionCookie, deviceLabel } from './auth.js';

const CHALLENGE_MS = 5 * 60 * 1000;
const MAX_PASSKEYS = 10;
const anyUser = requireRole('admin', 'owner', 'branch');

// The relying party is the site the person is on; passkeys made on one host only work there.
const rp = (c) => {
  const u = new URL(c.req.url);
  return { id: u.hostname, origin: u.origin };
};

async function takeChallenge(env, cid, purpose) {
  const row = await env.DB.prepare('SELECT * FROM webauthn_challenges WHERE id=? AND purpose=?').bind(String(cid || '').slice(0, 64), purpose).first();
  // Single use: delete before verifying so a replay cannot reuse it.
  if (row) await env.DB.prepare('DELETE FROM webauthn_challenges WHERE id=?').bind(row.id).run();
  if (!row || row.expires_at < now()) throw bad('challenge_expired');
  return row;
}

export function registerSecurity(app) {
  // ---------- devices ----------
  app.get('/api/me/sessions', anyUser, async (c) => {
    const u = c.get('user');
    const { results } = await c.env.DB.prepare('SELECT id, kind, label, via, created_at, last_seen_at, expires_at FROM sessions WHERE user_id=? AND expires_at>? ORDER BY COALESCE(last_seen_at, created_at) DESC LIMIT 50')
      .bind(u.id, now()).all();
    return c.json({ sessions: results.map((s) => ({ ...s, current: s.id === u.sid })) });
  });

  app.delete('/api/me/sessions/:id', anyUser, async (c) => {
    const u = c.get('user');
    const r = await c.env.DB.prepare('DELETE FROM sessions WHERE id=? AND user_id=?').bind(c.req.param('id'), u.id).run();
    if (!r.meta.changes) throw notFound();
    await audit(c.env, u, 'session.revoke', { current: c.req.param('id') === u.sid });
    return c.json({ ok: true });
  });

  app.post('/api/me/sessions/sign-out-others', anyUser, async (c) => {
    const u = c.get('user');
    const r = await c.env.DB.prepare('DELETE FROM sessions WHERE user_id=? AND id!=?').bind(u.id, u.sid).run();
    await audit(c.env, u, 'session.revoke_others', { count: r.meta.changes });
    return c.json({ ok: true, signed_out: r.meta.changes });
  });

  // ---------- passkeys: manage ----------
  app.get('/api/me/passkeys', anyUser, async (c) => {
    const { results } = await c.env.DB.prepare('SELECT id, name, backed_up, created_at, last_used_at FROM passkeys WHERE user_id=? ORDER BY created_at').bind(c.get('user').id).all();
    return c.json({ passkeys: results });
  });

  app.post('/api/me/passkeys/options', anyUser, async (c) => {
    const u = c.get('user');
    const { results: existing } = await c.env.DB.prepare('SELECT id, transports FROM passkeys WHERE user_id=?').bind(u.id).all();
    if (existing.length >= MAX_PASSKEYS) throw new HttpError(409, 'passkeys_limit');
    const options = await generateRegistrationOptions({
      rpName: 'ZIMARA Menu',
      rpID: rp(c).id,
      userName: u.email,
      userDisplayName: u.name || u.email,
      userID: new TextEncoder().encode(u.id),
      attestationType: 'none',
      excludeCredentials: existing.map((p) => ({ id: p.id, transports: JSON.parse(p.transports) })),
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    });
    const cid = id();
    await c.env.DB.prepare('INSERT INTO webauthn_challenges(id,user_id,purpose,challenge,expires_at) VALUES(?,?,?,?,?)').bind(cid, u.id, 'register', options.challenge, now() + CHALLENGE_MS).run();
    return c.json({ challenge_id: cid, options });
  });

  app.post('/api/me/passkeys', anyUser, async (c) => {
    const u = c.get('user'), b = await body(c);
    const ch = await takeChallenge(c.env, b.challenge_id, 'register');
    if (ch.user_id !== u.id) throw bad('challenge_expired');
    let v;
    try {
      v = await verifyRegistrationResponse({ response: b.response, expectedChallenge: ch.challenge, expectedOrigin: rp(c).origin, expectedRPID: rp(c).id, requireUserVerification: true });
    } catch { throw bad('passkey_invalid'); }
    if (!v.verified || !v.registrationInfo) throw bad('passkey_invalid');
    const { credential, credentialBackedUp } = v.registrationInfo;
    const name = str(b.name, 'name', { optional: true, max: 40 }) || deviceLabel(c.req.header('user-agent')) || 'Passkey';
    await c.env.DB.prepare('INSERT INTO passkeys(id,user_id,public_key,counter,transports,name,backed_up,created_at) VALUES(?,?,?,?,?,?,?,?)')
      .bind(credential.id, u.id, b64url(credential.publicKey), credential.counter, JSON.stringify(credential.transports || []), name, credentialBackedUp ? 1 : 0, now())
      .run().catch(() => { throw new HttpError(409, 'passkey_exists'); });
    await audit(c.env, u, 'passkey.add', { name });
    return c.json({ ok: true, id: credential.id, name }, 201);
  });

  app.delete('/api/me/passkeys/:id', anyUser, async (c) => {
    const u = c.get('user');
    const r = await c.env.DB.prepare('DELETE FROM passkeys WHERE id=? AND user_id=?').bind(c.req.param('id'), u.id).run();
    if (!r.meta.changes) throw notFound();
    await audit(c.env, u, 'passkey.remove', {});
    return c.json({ ok: true });
  });

  // ---------- passkeys: sign in ----------
  app.post('/api/passkeys/login/options', async (c) => {
    await rateLimit(c, 'passkey-options', { limit: 30, window: 600_000 });
    const options = await generateAuthenticationOptions({ rpID: rp(c).id, userVerification: 'required', allowCredentials: [] });
    const cid = id();
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM webauthn_challenges WHERE expires_at<?').bind(now()),
      c.env.DB.prepare('INSERT INTO webauthn_challenges(id,user_id,purpose,challenge,expires_at) VALUES(?,NULL,?,?,?)').bind(cid, 'login', options.challenge, now() + CHALLENGE_MS),
    ]);
    return c.json({ challenge_id: cid, options });
  });

  // kind 'app' answers with a bearer token (phone apps); otherwise a session cookie.
  app.post('/api/passkeys/login', async (c) => {
    await rateLimit(c, 'passkey-login', { limit: 20, window: 600_000 });
    const b = await body(c);
    const ch = await takeChallenge(c.env, b.challenge_id, 'login');
    const credId = typeof b.response?.id === 'string' ? b.response.id.slice(0, 1024) : '';
    const pk = await c.env.DB.prepare('SELECT p.*, u.disabled FROM passkeys p JOIN users u ON u.id=p.user_id WHERE p.id=?').bind(credId).first();
    if (!pk || pk.disabled) throw new HttpError(401, 'passkey_unknown');
    let v;
    try {
      v = await verifyAuthenticationResponse({
        response: b.response, expectedChallenge: ch.challenge, expectedOrigin: rp(c).origin, expectedRPID: rp(c).id, requireUserVerification: true,
        credential: { id: pk.id, publicKey: fromB64url(pk.public_key), counter: pk.counter, transports: JSON.parse(pk.transports) },
      });
    } catch { throw new HttpError(401, 'passkey_invalid'); }
    if (!v.verified) throw new HttpError(401, 'passkey_invalid');
    await c.env.DB.prepare('UPDATE passkeys SET counter=?, last_used_at=? WHERE id=?').bind(v.authenticationInfo.newCounter, now(), pk.id).run();
    const app = b.kind === 'app';
    const label = (app && str(b.device, 'device', { optional: true, max: 80 })) || deviceLabel(c.req.header('user-agent'));
    const token = await createSession(c.env, pk.user_id, true, { kind: app ? 'app' : 'web', label, via: 'passkey' });
    await audit(c.env, { id: pk.user_id }, 'login.passkey', { app });
    if (app) return c.json({ token, token_type: 'Bearer' }, 201);
    c.header('Set-Cookie', sessionCookie(token, isSecure(c)));
    return c.json({ ok: true });
  });
}
