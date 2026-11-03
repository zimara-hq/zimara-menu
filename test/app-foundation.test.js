import test from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';
import { makeEnv, setupOrg, client } from './helpers.js';

const ORIGIN = 'https://menu.test';
const b64 = (u8) => Buffer.from(u8).toString('base64url');
const sha256 = async (u8) => new Uint8Array(await crypto.subtle.digest('SHA-256', u8));

// Minimal CBOR encoder for the shapes WebAuthn needs (maps, ints, bytes, text).
function cbor(v) {
  const head = (major, n) => (n < 24 ? [major << 5 | n] : n < 256 ? [major << 5 | 24, n] : [major << 5 | 25, n >> 8, n & 255]);
  if (typeof v === 'number') return Uint8Array.from(v >= 0 ? head(0, v) : head(1, -1 - v));
  if (typeof v === 'string') { const t = new TextEncoder().encode(v); return Uint8Array.from([...head(3, t.length), ...t]); }
  if (v instanceof Uint8Array) return Uint8Array.from([...head(2, v.length), ...v]);
  const entries = v instanceof Map ? [...v] : Object.entries(v);
  return Uint8Array.from([...head(5, entries.length), ...entries.flatMap(([k, x]) => [...cbor(k), ...cbor(x)])]);
}

function der(raw) {
  const int = (b) => { let i = 0; while (i < b.length - 1 && b[i] === 0) i++; b = b.slice(i); return b[0] & 0x80 ? [0, ...b] : [...b]; };
  const r = int(raw.slice(0, 32)), s = int(raw.slice(32));
  return Uint8Array.from([0x30, r.length + s.length + 4, 2, r.length, ...r, 2, s.length, ...s]);
}

// A software passkey: one P-256 key, user verification always on.
async function softKey() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', kp.publicKey);
  const credId = crypto.getRandomValues(new Uint8Array(16));
  let counter = 0;
  const rpHash = await sha256(new TextEncoder().encode('menu.test'));
  const clientData = (type, challenge) => new TextEncoder().encode(JSON.stringify({ type, challenge, origin: ORIGIN, crossOrigin: false }));
  return {
    id: b64(credId),
    async register(options) {
      const cose = cbor(new Map([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x, 'base64url')], [-3, Buffer.from(jwk.y, 'base64url')]]));
      const authData = Uint8Array.from([...rpHash, 0x45, 0, 0, 0, 0, ...new Uint8Array(16), 0, credId.length, ...credId, ...cose]);
      const att = cbor(new Map([['fmt', 'none'], ['attStmt', new Map()], ['authData', authData]]));
      return { id: b64(credId), rawId: b64(credId), type: 'public-key', clientExtensionResults: {}, response: { clientDataJSON: b64(clientData('webauthn.create', options.challenge)), attestationObject: b64(att), transports: ['internal'] } };
    },
    async sign(options) {
      counter++;
      const authData = Uint8Array.from([...rpHash, 0x05, 0, 0, 0, counter]);
      const cd = clientData('webauthn.get', options.challenge);
      const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, Uint8Array.from([...authData, ...(await sha256(cd))])));
      return { id: b64(credId), rawId: b64(credId), type: 'public-key', clientExtensionResults: {}, response: { clientDataJSON: b64(cd), authenticatorData: b64(authData), signature: b64(der(sig)) } };
    },
  };
}

test('/api/v1 answers like /api and apps sign in with a bearer token', async () => {
  const env = makeEnv();
  const s = await setupOrg(env);
  const v1 = await s.owner.get('/api/v1/me');
  assert.equal(v1.status, 200);
  assert.equal(v1.headers.get('x-api-version'), '1');
  assert.equal(v1.json.user.role, 'owner');

  const bad = await client(env, '9.9.9.1').post('/api/v1/auth/token', { email: 'owner@cafe.test', password: 'wrong-password-1' });
  assert.equal(bad.status, 401);
  const tok = await client(env, '9.9.9.2').post('/api/v1/auth/token', { email: 'owner@cafe.test', password: 'owner-pass-123', device: 'iPhone 17 · ZIMARA Business' });
  assert.equal(tok.status, 201);
  const headers = { authorization: 'Bearer ' + tok.json.token };
  const me = await app.request(ORIGIN + '/api/v1/me', { headers }, env);
  assert.equal((await me.json()).user.role, 'owner');
  const list = await (await app.request(ORIGIN + '/api/v1/me/sessions', { headers }, env)).json();
  const appSession = list.sessions.find((x) => x.current);
  assert.equal(appSession.kind, 'app');
  assert.equal(appSession.label, 'iPhone 17 · ZIMARA Business');
  assert.ok(appSession.expires_at - appSession.created_at > 50 * 86_400_000, 'app sessions last 60 days');
  assert.equal((await app.request(ORIGIN + '/api/v1/me', { headers: { authorization: 'Bearer not-a-real-token-at-all-123' } }, env)).status, 401);
});

test('owners see their devices, sign one out, or sign out every other device', async () => {
  const env = makeEnv();
  const s = await setupOrg(env);
  const phone = client(env, '8.8.8.8');
  await phone.raw('POST', '/api/login', { email: 'owner@cafe.test', password: 'owner-pass-123' }, { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 Version/19.0 Mobile/15E148 Safari/604.1' });
  const list = (await s.owner.get('/api/me/sessions')).json.sessions;
  assert.equal(list.length, 2);
  const other = list.find((x) => !x.current);
  assert.equal(other.label, 'iPhone · Safari');
  assert.equal((await s.cashier.del('/api/me/sessions/' + other.id)).status, 404, 'nobody else can sign you out');
  assert.equal((await s.owner.del('/api/me/sessions/' + other.id)).status, 200);
  assert.equal((await phone.get('/api/me')).status, 401);
  await phone.login('owner@cafe.test', 'owner-pass-123');
  const out = await s.owner.post('/api/me/sessions/sign-out-others', {});
  assert.equal(out.json.signed_out, 1);
  assert.equal((await phone.get('/api/me')).status, 401);
  assert.equal((await s.owner.get('/api/me')).status, 200, 'this device stays signed in');
});

test('passkeys: add, sign in without a password, no replay, remove', async () => {
  const env = makeEnv();
  const s = await setupOrg(env);
  const key = await softKey();
  const opt = (await s.owner.post('/api/me/passkeys/options', {})).json;
  assert.equal(opt.options.rp.id, 'menu.test');
  assert.equal(opt.options.authenticatorSelection.userVerification, 'required');
  const reg = await s.owner.post('/api/me/passkeys', { challenge_id: opt.challenge_id, response: await key.register(opt.options), name: 'آيفوني' });
  assert.equal(reg.status, 201, JSON.stringify(reg.json));
  assert.equal((await s.owner.post('/api/me/passkeys', { challenge_id: opt.challenge_id, response: await key.register(opt.options) })).json.error, 'challenge_expired', 'challenges are single use');
  assert.equal((await s.owner.get('/api/me/passkeys')).json.passkeys[0].name, 'آيفوني');

  const guest = client(env, '7.7.7.7');
  const lo = (await guest.post('/api/passkeys/login/options', {})).json;
  const signed = await key.sign(lo.options);
  const login = await guest.post('/api/passkeys/login', { challenge_id: lo.challenge_id, response: signed });
  assert.equal(login.status, 200, JSON.stringify(login.json));
  assert.equal((await guest.get('/api/me')).json.user.email, 'owner@cafe.test');
  const replay = await client(env, '7.7.7.8').post('/api/passkeys/login', { challenge_id: lo.challenge_id, response: signed });
  assert.equal(replay.json.error, 'challenge_expired');
  // Wrong challenge in the signed data is refused.
  const lo2 = (await guest.post('/api/passkeys/login/options', {})).json;
  assert.equal((await guest.post('/api/passkeys/login', { challenge_id: lo2.challenge_id, response: await key.sign({ challenge: 'AAAA' }) })).status, 401);
  // The app flow gets a token.
  const lo3 = (await guest.post('/api/v1/passkeys/login/options', {})).json;
  const appLogin = await client(env, '7.7.7.9').post('/api/v1/passkeys/login', { challenge_id: lo3.challenge_id, response: await key.sign(lo3.options), kind: 'app', device: 'Pixel 10' });
  assert.equal(appLogin.status, 201);
  assert.ok(appLogin.json.token);

  const id = (await s.owner.get('/api/me/passkeys')).json.passkeys[0].id;
  assert.equal((await s.cashier.del('/api/me/passkeys/' + id)).status, 404);
  assert.equal((await s.owner.del('/api/me/passkeys/' + id)).status, 200);
  const lo4 = (await guest.post('/api/passkeys/login/options', {})).json;
  assert.equal((await guest.post('/api/passkeys/login', { challenge_id: lo4.challenge_id, response: await key.sign(lo4.options) })).json.error, 'passkey_unknown');
});

function fakeHub() {
  const events = [], joins = [];
  return {
    events, joins,
    idFromName: (n) => n,
    get: (name) => ({
      fetch: async (url, init) => {
        if (typeof url === 'string' && url.endsWith('/publish')) { events.push({ branch: name, ...JSON.parse(init.body) }); return Response.json({ sent: 1 }); }
        joins.push(name);
        return new Response('joined', { status: 200 });
      },
    }),
  };
}

test('realtime: branch events fan out to the right branch hub, and only members can join', async () => {
  const HUB = fakeHub();
  const env = makeEnv({ HUB });
  const s = await setupOrg(env);
  assert.equal((await s.cashier.get('/api/realtime')).status, 426, 'needs a websocket upgrade');
  const ws = { upgrade: 'websocket' };
  assert.equal((await s.cashier.get('/api/realtime', ws)).status, 200);
  assert.equal((await s.cashier.get('/api/realtime', { ...ws, origin: 'https://evil.example' })).status, 403);
  assert.equal((await s.owner.get('/api/realtime?branch=nope', ws)).status, 404);
  assert.equal((await s.owner.get('/api/v1/realtime?branch=' + s.branchId, ws)).status, 200);
  assert.deepEqual(HUB.joins, [s.branchId, s.branchId]);
  assert.equal((await client(env).get('/api/realtime', ws)).status, 401);

  const t = await s.cashier.post('/api/branch/tickets', { invoice_number: 'INV-1' });
  const tk = (await s.cashier.get('/api/branch/tickets')).json.tickets[0];
  await s.cashier.post(`/api/branch/tickets/${tk.id}/ready`, { version: tk.version });
  const types = HUB.events.map((e) => e.type + ':' + (e.status || ''));
  assert.deepEqual(types, ['ticket:', 'ticket:ready']);
  assert.ok(HUB.events.every((e) => e.branch === s.branchId && !('token' in e)), 'events never carry guest tokens');
  assert.ok(t.json.token);
  assert.equal((await makeEnvNoHub()).ok, true);
});

async function makeEnvNoHub() {
  const env = makeEnv();
  const s = await setupOrg(env);
  const r = await s.cashier.get('/api/realtime', { upgrade: 'websocket' });
  assert.equal(r.status, 503);
  assert.equal((await s.cashier.post('/api/branch/tickets', {})).status, 201, 'no hub never breaks the request');
  return { ok: true };
}

test('BranchHub sends published events to every open socket', async () => {
  const { BranchHub } = await import('../src/realtime.js');
  const sockets = [{ got: [], send(m) { this.got.push(m); } }, { got: [], send(m) { this.got.push(m); } }];
  const hub = new BranchHub({ getWebSockets: () => sockets });
  const r = await hub.fetch(new Request('https://hub/publish', { method: 'POST', body: '{"type":"order"}' }));
  assert.equal((await r.json()).sent, 2);
  assert.deepEqual(sockets.map((x) => x.got[0]), ['{"type":"order"}', '{"type":"order"}']);
  assert.equal((await hub.fetch(new Request('https://hub/x'))).status, 426);
  const pong = { got: [], send(m) { this.got.push(m); } };
  await hub.webSocketMessage(pong, 'ping');
  assert.deepEqual(pong.got, ['pong']);
});
