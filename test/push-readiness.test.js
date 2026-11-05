import test from 'node:test';
import assert from 'node:assert/strict';
import { sendPush, validEndpoint, vapidHeader } from '../src/push.js';

async function keys() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  return { VAPID_PUBLIC_KEY: Buffer.from(await crypto.subtle.exportKey('raw', pair.publicKey)).toString('base64url'), VAPID_PRIVATE_KEY: jwk.d, VAPID_SUBJECT: 'mailto:push@example.test' };
}

test('push destinations reject URL coercion, hidden whitespace and non-service destinations', () => {
  for (const value of [null, {}, { toString: () => 'https://fcm.googleapis.com/send/x' }, ' https://fcm.googleapis.com/x', 'https://fcm.googleapis.com/x\n', 'https://fcm.googleapis.com.evil.test/x', 'https://user:pass@fcm.googleapis.com/x', 'https://fcm.googleapis.com:444/x', 'https://fcm.googleapis.com/x#fragment']) assert.equal(validEndpoint(value), false);
  for (const value of ['https://fcm.googleapis.com/x', 'https://web.push.apple.com/x', 'https://updates.push.services.mozilla.com/x']) assert.equal(validEndpoint(value), true);
});

test('a changed invalid private key cannot reuse the previous cached VAPID signer', async () => {
  const env = await keys();
  await vapidHeader(env, 'https://fcm.googleapis.com/x');
  await assert.rejects(vapidHeader({ ...env, VAPID_PRIVATE_KEY: 'invalid' }, 'https://fcm.googleapis.com/x'));
});

test('push sends are bounded, reject redirects, and distinguish dead subscriptions from provider failures', async () => {
  const env = await keys();
  const endpoint = 'https://web.push.apple.com/x';
  for (const [status, expected] of [[201, 'ok'], [404, 'gone'], [410, 'gone'], [429, 'error'], [503, 'error'], [302, 'error']]) {
    assert.equal(await sendPush(env, endpoint, async (url, init) => {
      assert.equal(url, endpoint);
      assert.equal(init.redirect, 'error');
      assert.ok(init.signal instanceof AbortSignal);
      assert.equal(init.headers['Content-Length'], '0');
      return new Response(null, { status });
    }), expected);
  }
  assert.equal(await sendPush(env, endpoint, async () => { throw new Error('network'); }), 'error');
});
