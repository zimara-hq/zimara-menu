const enc = new TextEncoder();

export const now = () => Date.now();

export function id() {
  return crypto.randomUUID();
}

export function b64url(bytes) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(str) {
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

export function randomToken(bytes = 24) {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

// Short human code for loyalty cards: no 0/O/1/I to avoid misreading at the counter.
export function shortCode(len = 6) {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const r = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(r, (b) => alphabet[b % alphabet.length]).join('');
}

export async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}

export function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

export const bad = (code, msg) => new HttpError(400, code, msg);
export const notFound = (code = 'not_found') => new HttpError(404, code);
export const forbidden = (code = 'forbidden') => new HttpError(403, code);
export const conflict = (code, msg) => new HttpError(409, code, msg);

// Minimal input validation helpers: every field is checked explicitly.
export function str(v, field, { min = 1, max = 200, optional = false } = {}) {
  if (v === undefined || v === null || v === '') {
    if (optional) return null;
    throw bad('invalid_' + field);
  }
  if (typeof v !== 'string') throw bad('invalid_' + field);
  const t = v.trim();
  if (t.length < min || t.length > max) throw bad('invalid_' + field);
  return t;
}

export function int(v, field, { min = 0, max = 1e9, optional = false } = {}) {
  if (v === undefined || v === null || v === '') {
    if (optional) return null;
    throw bad('invalid_' + field);
  }
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw bad('invalid_' + field);
  return n;
}

export function url(v, field, { optional = true } = {}) {
  const s = str(v, field, { optional, max: 500 });
  if (s === null) return null;
  let u;
  try {
    u = new URL(s);
  } catch {
    throw bad('invalid_' + field);
  }
  if (u.protocol !== 'https:') throw bad('invalid_' + field);
  return u.toString();
}

export function color(v, field) {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(v)) throw bad('invalid_' + field);
  return v;
}
