import { b64url, fromB64url, hmac, now, randomToken, HttpError } from './util.js';

const ITERATIONS = 100_000; // Workers caps PBKDF2 at 100k.
const SESSION_MS = 1000 * 60 * 60 * 24 * 14;
export const COOKIE = 'zm_session';

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await derive(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${b64url(salt)}$${b64url(bits)}`;
}

export async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || password.length > 200) return false;
  const [scheme, iter, salt, hash] = String(stored).split('$');
  if (scheme !== 'pbkdf2' || Number(iter) !== ITERATIONS || !salt || !hash) return false;
  const bits = new Uint8Array(await derive(password, fromB64url(salt), Number(iter)));
  const expected = fromB64url(hash);
  if (bits.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < bits.length; i++) diff |= bits[i] ^ expected[i];
  return diff === 0;
}

async function derive(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
}

export function validPassword(p) {
  return typeof p === 'string' && p.length >= 10 && p.length <= 200;
}

const APP_SESSION_MS = 1000 * 60 * 60 * 24 * 60;
const SEEN_EVERY_MS = 5 * 60 * 1000;

// kind: 'web' (cookie) or 'app' (bearer token for the phone apps, 60 days).
// label: a short device name the owner sees in "your devices".
export async function createSession(env, userId, mfaVerified = false, { kind = 'web', label = null, via = 'password' } = {}) {
  const token = randomToken(32);
  const sid = await hmac(env.AUTH_SECRET, 'session:' + token);
  const t = now();
  const demo = await env.DB.prepare('SELECT d.expires_at FROM demo_rooms d JOIN users u ON u.org_id = d.org_id WHERE u.id = ?').bind(userId).first();
  if (demo && demo.expires_at <= t) throw new HttpError(410, 'demo_expired');
  const ttl = kind === 'app' ? APP_SESSION_MS : SESSION_MS;
  const expiresAt = demo ? Math.min(t + ttl, demo.expires_at) : t + ttl;
  await env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at, created_at, mfa_verified, kind, label, last_seen_at, via) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(sid, userId, expiresAt, t, mfaVerified ? 1 : 0, kind, label ? String(label).slice(0, 80) : null, t, via)
    .run();
  return token;
}

// A readable device name from the browser's user agent, never stored raw.
export function deviceLabel(ua = '') {
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
  const br = /Edg\//.test(ua) ? 'Edge' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /FxiOS|Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
  return [os, br].filter(Boolean).join(' · ') || null;
}

function sessionToken(req) {
  const cookie = readCookie(req, COOKIE);
  if (cookie) return cookie;
  const auth = req.headers.get('authorization') || '';
  const m = auth.match(/^Bearer ([A-Za-z0-9_-]{20,100})$/);
  return m ? m[1] : null;
}

export function sessionCookie(token, secure) {
  const attrs = [`${COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${SESSION_MS / 1000}`];
  if (secure) attrs.push('Secure');
  return attrs.join('; ');
}

export function clearCookie(secure) {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
}

export function readCookie(req, name) {
  const header = req.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

export async function loadUser(env, req) {
  const token = sessionToken(req);
  if (!token) return null;
  const sid = await hmac(env.AUTH_SECRET, 'session:' + token);
  const row = await env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.role, u.org_id, u.branch_id, u.email_verified, CASE WHEN u.mfa_secret IS NULL THEN 0 ELSE 1 END AS mfa_enabled, s.mfa_verified, s.id AS sid, s.via, s.kind AS session_kind
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = ? AND s.expires_at > ? AND u.disabled = 0
        AND NOT EXISTS (SELECT 1 FROM demo_rooms d WHERE d.org_id = u.org_id AND d.expires_at <= ?)`,
  )
    .bind(sid, now(), now())
    .first();
  if (row) await env.DB.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ? AND (last_seen_at IS NULL OR last_seen_at < ?)').bind(now(), sid, now() - SEEN_EVERY_MS).run();
  return row || null;
}

export async function destroySession(env, req) {
  const token = sessionToken(req);
  if (!token) return;
  const sid = await hmac(env.AUTH_SECRET, 'session:' + token);
  await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sid).run();
}

// Fixed-window limiter: 8 failed logins per 15 minutes per account and per IP.
const WINDOW = 15 * 60 * 1000;
const LIMIT = 8;

export async function checkLoginRate(env, keys) {
  const t = now();
  for (const key of keys) {
    const row = await env.DB.prepare('SELECT count, window_start FROM login_attempts WHERE key = ?').bind(key).first();
    if (row && t - row.window_start < WINDOW && row.count >= LIMIT) {
      throw new HttpError(429, 'too_many_attempts');
    }
  }
}

export async function recordLoginFailure(env, keys) {
  const t = now();
  for (const key of keys) {
    await env.DB.prepare(
      `INSERT INTO login_attempts (key, count, window_start) VALUES (?1, 1, ?2)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE WHEN ?2 - window_start >= ${WINDOW} THEN 1 ELSE count + 1 END,
         window_start = CASE WHEN ?2 - window_start >= ${WINDOW} THEN ?2 ELSE window_start END`,
    )
      .bind(key, t)
      .run();
  }
}

export async function clearLoginFailures(env, keys) {
  for (const key of keys) await env.DB.prepare('DELETE FROM login_attempts WHERE key = ?').bind(key).run();
}
