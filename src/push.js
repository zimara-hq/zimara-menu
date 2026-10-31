import { b64url, fromB64url } from './util.js';

// Web Push without a payload: the service worker fetches the ticket state itself,
// so no RFC 8291 payload encryption is needed. Only VAPID (RFC 8292) signing is.

let cachedKey = null;

async function signingKey(env) {
  if (cachedKey && cachedKey.pub === env.VAPID_PUBLIC_KEY) return cachedKey.key;
  const pub = fromB64url(env.VAPID_PUBLIC_KEY);
  if (pub.length !== 65 || pub[0] !== 4) throw new Error('VAPID_PUBLIC_KEY must be an uncompressed P-256 point');
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: b64url(pub.slice(1, 33)),
    y: b64url(pub.slice(33, 65)),
    d: env.VAPID_PRIVATE_KEY,
    ext: true,
  };
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  cachedKey = { pub: env.VAPID_PUBLIC_KEY, key };
  return key;
}

export function pushConfigured(env) {
  return Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT);
}

export async function vapidHeader(env, endpoint) {
  const aud = new URL(endpoint).origin;
  const header = b64url(new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64url(
    new TextEncoder().encode(
      JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT }),
    ),
  );
  const input = `${header}.${claims}`;
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await signingKey(env), new TextEncoder().encode(input));
  return `vapid t=${input}.${b64url(sig)}, k=${env.VAPID_PUBLIC_KEY}`;
}

// Returns 'ok' | 'gone' | 'error'. 'gone' means the subscription must be deleted.
export async function sendPush(env, endpoint, fetcher = fetch) {
  if (!pushConfigured(env) || !validEndpoint(endpoint)) return 'error';
  try {
    const res = await fetcher(endpoint, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
      headers: {
        Authorization: await vapidHeader(env, endpoint),
        TTL: '300',
        Urgency: 'high',
        'Content-Length': '0',
      },
    });
    if (res.status === 404 || res.status === 410) return 'gone';
    return res.ok ? 'ok' : 'error';
  } catch {
    return 'error';
  }
}

// Only real browser push services, so a customer cannot make the Worker POST anywhere.
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/];

export function validEndpoint(endpoint) {
  try {
    const u = new URL(endpoint);
    return u.protocol === 'https:' && !u.username && !u.password && !u.hash && (!u.port || u.port === '443') && endpoint.length <= 1000 && PUSH_HOSTS.some((r) => r.test(u.hostname));
  } catch {
    return false;
  }
}
