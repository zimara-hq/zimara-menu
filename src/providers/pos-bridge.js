import { b64url, fromB64url, HttpError } from '../util.js';

const encoder = new TextEncoder();
const MAX_SKEW_SECONDS = 300;

async function encryptionKey(secret) {
  let bytes;
  try { bytes = fromB64url(String(secret || '')); } catch { bytes = new Uint8Array(); }
  if (bytes.length !== 32) throw new HttpError(503, 'pos_encryption_not_configured');
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export function encryptionConfigured(env) {
  try { return fromB64url(String(env.POS_ENCRYPTION_KEY || '')).length === 32; } catch { return false; }
}

export async function encryptSigningSecret(env, secret, connectionId) {
  const key = await encryptionKey(env.POS_ENCRYPTION_KEY);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(connectionId) }, key, encoder.encode(secret));
  return b64url(iv) + '.' + b64url(ciphertext);
}

export async function decryptSigningSecret(env, encrypted, connectionId) {
  try {
    const [iv, ciphertext] = encrypted.split('.');
    const bytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64url(iv), additionalData: encoder.encode(connectionId) }, await encryptionKey(env.POS_ENCRYPTION_KEY), fromB64url(ciphertext));
    return new TextDecoder().decode(bytes);
  } catch {
    throw new HttpError(503, 'pos_connection_key_unavailable');
  }
}

// This is ZIMARA's explicitly documented bridge protocol, not a Rewaa/Foodics signature.
export async function verifyBridgeSignature(secret, timestamp, signature, rawBody, clock = Date.now()) {
  if (!/^\d{10}$/.test(String(timestamp || '')) || typeof signature !== 'string') return false;
  if (Math.abs(Math.floor(clock / 1000) - Number(timestamp)) > MAX_SKEW_SECONDS) return false;
  let bytes;
  try { bytes = fromB64url(signature); } catch { return false; }
  if (bytes.length !== 32) return false;
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  return crypto.subtle.verify('HMAC', key, bytes, encoder.encode(timestamp + '.' + rawBody));
}

export async function payloadHash(rawBody) {
  return b64url(await crypto.subtle.digest('SHA-256', encoder.encode(rawBody)));
}
