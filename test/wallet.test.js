import test from 'node:test';
import assert from 'node:assert/strict';
import { googlePagerObject, signGoogleSaveJwt } from '../src/wallet.js';
const config = { issuerId: '1234567890', classSuffix: 'pager', publicOrigin: 'https://menu.example.test' };
const ticket = { id: 'ticket_1', token: 'public_random_ticket_token', number: '27', status: 'ready', businessName: 'Cafe', branchName: 'Hail', org_id: 'private-org', customer_email: 'private@example.test' };

test('Wallet object uses stable issuer identity, public ticket link and terminal lifecycle state', () => {
  const object = googlePagerObject(config, ticket);
  assert.equal(object.id, '1234567890.ticket_ticket_1');
  assert.equal(object.classId, '1234567890.pager');
  assert.equal(object.barcode.value, 'https://menu.example.test/t/public_random_ticket_token');
  assert.equal(object.textModulesData[0].body, 'ready');
  assert.equal(JSON.stringify(object).includes('private'), false);
  for (const status of ['collected', 'cancelled']) assert.equal(googlePagerObject(config, { ...ticket, status }).state, 'INACTIVE');
  for (const publicOrigin of ['http://menu.example.test', 'https://user:pass@menu.example.test', 'https://menu.example.test/path', 'https://menu.example.test/?secret=1']) assert.throws(() => googlePagerObject({ ...config, publicOrigin }, ticket));
  assert.throws(() => googlePagerObject(config, { ...ticket, status: 'unknown' }));
});

test('offline Google Save JWT is verifiable, origin-bound, short-lived and excludes the signing key', async () => {
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, false, ['sign', 'verify']);
  const options = { serviceAccountEmail: 'wallet@zimara-test.iam.gserviceaccount.com', publicOrigin: config.publicOrigin, objects: [googlePagerObject(config, ticket)], privateKey: pair.privateKey, clock: 1700000000000 };
  const jwt = await signGoogleSaveJwt(options);
  const [header, payload, signature] = jwt.split('.');
  assert.equal(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', pair.publicKey, Buffer.from(signature, 'base64url'), new TextEncoder().encode(header + '.' + payload)), true);
  const claims = JSON.parse(Buffer.from(payload, 'base64url'));
  assert.equal(claims.aud, 'google');
  assert.equal(claims.typ, 'savetowallet');
  assert.equal(claims.exp - claims.iat, 300);
  assert.deepEqual(claims.origins, [config.publicOrigin]);
  assert.equal(claims.privateKey, undefined);
  await assert.rejects(signGoogleSaveJwt({ ...options, privateKey: pair.publicKey }));
});
