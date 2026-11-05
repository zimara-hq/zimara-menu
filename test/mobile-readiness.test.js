import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { mobileReadiness, readMobileEnvironment } from '../public/mobile-client.js';

const supported = { secure: true, serviceWorker: true, pushManager: true, notificationPermission: 'default' };
test('mobile readiness distinguishes permission, subscription prerequisites and iOS installation', () => {
  assert.equal(mobileReadiness(supported).notifications, 'permission-required');
  assert.equal(mobileReadiness({ ...supported, notificationPermission: 'granted' }).notifications, 'permission-granted');
  assert.equal(mobileReadiness({ ...supported, notificationPermission: 'denied' }).notifications, 'blocked');
  assert.equal(mobileReadiness({ ...supported, secure: false }).notifications, 'unsupported');
  assert.equal(mobileReadiness({ ...supported, ios: true }).notifications, 'install-required');
  assert.equal(mobileReadiness({ ...supported, ios: true, standalone: true }).notifications, 'permission-required');
  assert.equal(mobileReadiness({ ...supported, standalone: true }).install, 'installed');
});
test('iPad desktop user agent is treated as iOS; offline and standalone are detected', () => {
  const environment = readMobileEnvironment({
    isSecureContext: true, navigator: { userAgent: 'Macintosh', platform: 'MacIntel', maxTouchPoints: 5, standalone: true, onLine: false, serviceWorker: {} },
    matchMedia: () => ({ matches: false }), PushManager: class {}, Notification: { permission: 'denied' },
  });
  assert.equal(environment.ios, true);
  assert.equal(environment.standalone, true);
  assert.equal(mobileReadiness(environment).online, false);
  assert.equal(mobileReadiness(environment).notifications, 'blocked');
});

async function workerHarness() {
  const handlers = {};
  const buckets = new Map();
  const caches = {
    open: async (name) => {
      if (!buckets.has(name)) buckets.set(name, new Map());
      const entries = buckets.get(name);
      return {
        addAll: async (paths) => paths.forEach((path) => entries.set(path, new Response(path))),
        match: async (path) => entries.get(path)?.clone(),
        put: async (path, response) => entries.set(path, response),
      };
    },
    keys: async () => [...buckets.keys()],
    delete: async (name) => buckets.delete(name),
  };
  const context = {
    self: { location: { origin: 'https://menu.test' }, addEventListener: (name, handler) => { handlers[name] = handler; }, skipWaiting: async () => {}, clients: { claim: async () => {} } },
    caches, URL, Response, fetch: async () => { throw new Error('offline'); },
  };
  vm.runInNewContext(await readFile(new URL('../public/sw.js', import.meta.url), 'utf8'), context);
  const fire = async (name) => {
    let work;
    handlers[name]({ waitUntil: (p) => { work = p; } });
    await work;
  };
  return { handlers, buckets, caches, context, fire };
}

test('worker caches only generic recovery assets and retains pager tokens on activation', async () => {
  const worker = await workerHarness();
  await worker.caches.open('zm-state-v1');
  await worker.caches.open('zm-offline-v0');
  await worker.caches.open('another-application');
  await worker.fire('install');
  await worker.fire('activate');
  assert.deepEqual([...worker.buckets.get('zm-offline-v1').keys()], ['/offline', '/offline.js']);
  assert.equal(worker.buckets.has('zm-state-v1'), true);
  assert.equal(worker.buckets.has('zm-offline-v0'), false);
  assert.equal(worker.buckets.has('another-application'), true);
});
test('offline navigation gets recovery screen without intercepting APIs, writes or third-party requests', async () => {
  const worker = await workerHarness();
  await worker.fire('install');
  const dispatch = (path, mode = 'navigate', method = 'GET') => {
    let response;
    worker.handlers.fetch({ request: { url: new URL(path, 'https://menu.test').href, mode, method }, respondWith: (p) => { response = p; } });
    return response;
  };
  assert.equal(await (await dispatch('/t/private-token')).text(), '/offline');
  assert.equal(await (await dispatch('/app')).text(), '/offline');
  assert.equal(await (await dispatch('/offline.js', 'cors')).text(), '/offline.js');
  assert.equal(dispatch('/api/t/private-token'), undefined);
  assert.equal(dispatch('/api/v1/me'), undefined);
  assert.equal(dispatch('/t/private-token', 'navigate', 'POST'), undefined);
  assert.equal(dispatch('https://other.test/path'), undefined);
  assert.equal(dispatch('/styles.css', 'cors'), undefined);
  assert.equal(dispatch('/offline.js?anything', 'cors'), undefined);
});
test('online navigation preserves server errors and never stores tenant HTML', async () => {
  const worker = await workerHarness();
  await worker.fire('install');
  worker.context.fetch = async () => new Response('Server unavailable', { status: 503 });
  let response;
  worker.handlers.fetch({ request: { url: 'https://menu.test/c/secret', mode: 'navigate', method: 'GET' }, respondWith: (p) => { response = p; } });
  assert.equal((await response).status, 503);
  assert.equal(worker.buckets.get('zm-offline-v1').size, 2);
});
