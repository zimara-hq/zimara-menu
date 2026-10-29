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
  const [scheme, iter, salt, hash] = String(stored).split('$');
  if (scheme !== 'pbkdf2') return false;
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

export async function createSession(env, userId) {
  const token = randomToken(32);
  const sid = await hmac(env.AUTH_SECRET, 'session:' + token);
  const t = now();
  await env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .bind(sid, userId, t + SESSION_MS, t)
    .run();
  return token;
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
  const token = readCookie(req, COOKIE);
  if (!token) return null;
  const sid = await hmac(env.AUTH_SECRET, 'session:' + token);
  const row = await env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.role, u.org_id, u.branch_id, s.id AS sid
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = ? AND s.expires_at > ? AND u.disabled = 0`,
  )
    .bind(sid, now())
    .first();
  return row || null;
}

export async function destroySession(env, req) {
  const token = readCookie(req, COOKIE);
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
