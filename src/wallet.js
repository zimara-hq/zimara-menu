// Offline Wallet foundation only. No issuance routes, provider calls, pass signing,
// device registrations or update delivery are enabled by these helpers.
import { b64url, HttpError } from './util.js';

const encoder = new TextEncoder();
const required = (value, pattern, code) => {
  if (typeof value !== 'string' || !pattern.test(value)) throw new HttpError(503, code);
  return value;
};

function originFor(base) {
  let url;
  try { url = new URL(base); } catch { throw new HttpError(503, 'wallet_invalid_public_origin'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new HttpError(503, 'wallet_invalid_public_origin');
  return url.origin;
}

// Generic Google object. The matching class must already exist under the approved issuer.
// Its barcode contains only the public ticket URL, never internal tenant IDs or credentials.
export function googlePagerObject(config, ticket) {
  const issuer = required(config.issuerId, /^\d{6,30}$/, 'wallet_invalid_issuer');
  const suffix = required(config.classSuffix, /^[A-Za-z0-9_-]{1,80}$/, 'wallet_invalid_class');
  const ticketId = required(ticket.id, /^[A-Za-z0-9_-]{1,100}$/, 'wallet_invalid_ticket');
  const token = required(ticket.token, /^[A-Za-z0-9_-]{16,200}$/, 'wallet_invalid_ticket');
  if (!['preparing', 'ready', 'collected', 'cancelled'].includes(ticket.status)) throw new HttpError(400, 'wallet_invalid_status');
  const text = (value) => String(value || '').replace(/[\x00-\x1f\x7f]/g, '').slice(0, 100);
  const state = ['collected', 'cancelled'].includes(ticket.status) ? 'INACTIVE' : 'ACTIVE';
  return {
    id: `${issuer}.ticket_${ticketId}`,
    classId: `${issuer}.${suffix}`,
    state,
    cardTitle: { defaultValue: { language: 'en', value: text(ticket.businessName) || 'ZIMARA' } },
    header: { defaultValue: { language: 'en', value: `Order ${text(ticket.number)}` } },
    subheader: { defaultValue: { language: 'en', value: text(ticket.branchName) || 'Pickup' } },
    textModulesData: [{ id: 'status', header: 'Status', body: ticket.status }],
    barcode: { type: 'QR_CODE', value: `${originFor(config.publicOrigin)}/t/${token}` },
  };
}

// Sign a short-lived Save JWT locally. A valid signature does not demonstrate issuer
// approval or API acceptance. privateKey must be a non-extractable RS256 CryptoKey.
export async function signGoogleSaveJwt({ serviceAccountEmail, publicOrigin, objects, privateKey, clock = Date.now() }) {
  required(serviceAccountEmail, /^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+\.gserviceaccount\.com$/, 'wallet_invalid_service_account');
  if (!Array.isArray(objects) || objects.length !== 1 || !objects[0]?.id || !objects[0]?.classId) throw new HttpError(400, 'wallet_invalid_objects');
  if (privateKey?.extractable !== false || privateKey?.type !== 'private' || privateKey.algorithm?.name !== 'RSASSA-PKCS1-v1_5' || privateKey.algorithm?.hash?.name !== 'SHA-256' || privateKey.algorithm?.modulusLength < 2048 || !privateKey.usages.includes('sign')) throw new HttpError(503, 'wallet_invalid_signing_key');
  const issued = Math.floor(clock / 1000);
  const encode = (value) => b64url(encoder.encode(JSON.stringify(value)));
  const input = encode({ alg: 'RS256', typ: 'JWT' }) + '.' + encode({ iss: serviceAccountEmail, aud: 'google', typ: 'savetowallet', iat: issued, exp: issued + 300, origins: [originFor(publicOrigin)], payload: { genericObjects: objects } });
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, encoder.encode(input));
  return input + '.' + b64url(signature);
}
