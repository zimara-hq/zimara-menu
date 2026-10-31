import { b64url, fromB64url, hmac } from './util.js';
const enc = new TextEncoder();
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function newMfaSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  let bits = 0, value = 0, out = '';
  for (const b of bytes) { value = (value << 8) | b; bits += 8; while (bits >= 5) { out += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  return out;
}
function decode32(s) {
  let bits = 0, value = 0; const out = [];
  for (const c of s) { value = (value << 5) | alphabet.indexOf(c); bits += 5; if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  return Uint8Array.from(out);
}
export async function totp(secret, counter = Math.floor(Date.now() / 30000)) {
  const bytes = new Uint8Array(8); let n = BigInt(counter);
  for (let i = 7; i >= 0; i--) { bytes[i] = Number(n & 255n); n >>= 8n; }
  const key = await crypto.subtle.importKey('raw', decode32(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, bytes));
  const offset = sig[19] & 15;
  const value = ((sig[offset] & 127) << 24) | (sig[offset+1] << 16) | (sig[offset+2] << 8) | sig[offset+3];
  return String(value % 1000000).padStart(6, '0');
}
export async function verifyTotp(secret, code, lastCounter = -1) {
  if (!/^\d{6}$/.test(String(code))) return null;
  const counter = Math.floor(Date.now() / 30000);
  for (const n of [counter, counter - 1, counter + 1]) if (n > lastCounter && await totp(secret, n) === code) return n;
  return null;
}
async function encryptionKey(env) {
  const hash = await crypto.subtle.digest('SHA-256', enc.encode('zimara-mfa-v1:' + env.AUTH_SECRET));
  return crypto.subtle.importKey('raw', hash, 'AES-GCM', false, ['encrypt','decrypt']);
}
export async function sealSecret(env, secret) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({name:'AES-GCM',iv}, await encryptionKey(env), enc.encode(secret));
  return b64url(iv) + '.' + b64url(data);
}
export async function openSecret(env, sealed) {
  const [iv,data] = sealed.split('.');
  const out = await crypto.subtle.decrypt({name:'AES-GCM',iv:fromB64url(iv)},await encryptionKey(env),fromB64url(data));
  return new TextDecoder().decode(out);
}
export async function consumeMfa(env, user, b) {
  if (b.recovery_code) {
    const code = typeof b.recovery_code === 'string' ? b.recovery_code.replace(/\s/g,'').toUpperCase() : '';
    const hash = await hmac(env.AUTH_SECRET,'mfa-recovery:' + user.id + ':' + code);
    const r = await env.DB.prepare('DELETE FROM mfa_recovery_codes WHERE user_id = ? AND code_hash = ?').bind(user.id,hash).run();
    return r.meta.changes === 1;
  }
  const counter = await verifyTotp(await openSecret(env,user.mfa_secret),String(b.code || ''),user.mfa_last_counter);
  if (counter === null) return false;
  const r = await env.DB.prepare('UPDATE users SET mfa_last_counter = ? WHERE id = ? AND mfa_last_counter < ?').bind(counter,user.id,counter).run();
  return r.meta.changes === 1;
}
