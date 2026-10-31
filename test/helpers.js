import app from '../src/app.js';
import { createD1 } from './d1.js';
import { hashPassword } from '../src/auth.js';

export function makeEnv(extra = {}) {
  return {
    DB: createD1(),
    AUTH_SECRET: 'test-secret-test-secret-test-secret',
    ASSETS: { fetch: async (req) => new Response('asset:' + new URL(req.url).pathname) },
    ...extra,
  };
}

export async function seedAdmin(env, email = 'root@zimara.test', password = 'correct-horse-1') {
  await env.DB.prepare("INSERT INTO users (id, email, name, role, password_hash, created_at) VALUES (?, ?, 'Root', 'admin', ?, 0)")
    .bind(crypto.randomUUID(), email, await hashPassword(password))
    .run();
  return { email, password };
}

// A tiny cookie-keeping client so each test "device" has its own session.
export function client(env, ip = '1.1.1.1') {
  let cookie = '';
  async function call(method, path, body, headers = {}) {
    const init = { method, headers: { 'cf-connecting-ip': ip, ...headers } };
    if (cookie) init.headers.cookie = cookie;
    if (body !== undefined) {
      init.headers['content-type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const res = await app.request('https://menu.test' + path, init, env);
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {}
    return { status: res.status, json, text, headers: res.headers };
  }
  return {
    get: (p, h) => call('GET', p, undefined, h),
    post: (p, b = {}, h) => call('POST', p, b, h),
    patch: (p, b = {}) => call('PATCH', p, b),
    put: (p, b = {}) => call('PUT', p, b),
    del: (p) => call('DELETE', p, {}),
    raw: call,
    login: (email, password) => call('POST', '/api/login', { email, password }),
  };
}

// Admin -> org with owner -> branch with account, returns logged-in clients.
export async function setupOrg(env) {
  const root = await seedAdmin(env);
  const admin = client(env);
  await admin.login(root.email, root.password);
  const org = await admin.post('/api/admin/orgs', {
    name_ar: 'مقهى الاختبار',
    name_en: 'Test Cafe',
    owner: { email: 'owner@cafe.test', name: 'Owner', password: 'owner-pass-123' },
  });
  const owner = client(env);
  await owner.login('owner@cafe.test', 'owner-pass-123');
  const br = await owner.post('/api/owner/branches', {
    name_ar: 'فرع حائل',
    name_en: 'Hail',
    google_review_url: 'https://g.page/r/test/review',
    account: { email: 'hail@cafe.test', name: 'Hail cashier', password: 'branch-pass-123' },
  });
  const cashier = client(env);
  await cashier.login('hail@cafe.test', 'branch-pass-123');
  return { admin, owner, cashier, orgSlug: org.json.slug, branchSlug: br.json.slug, branchId: br.json.id };
}
