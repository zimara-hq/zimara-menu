import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, setupOrg, client } from './helpers.js';
import { menuPage } from '../src/menu-page.js';

const shell = '<!doctype html><html><head><title>Menu</title></head><body><main id="main"></main></body></html>';
const bootstrap = html => {
  const match = html.match(/<script type="application\/json" id="menu-bootstrap">([\s\S]*?)<\/script>/);
  return match ? JSON.parse(match[1]) : null;
};
const stable = data => { const copy = structuredClone(data); if (copy?.discovery) delete copy.discovery.generated_at; return copy; };

test('public menu HTML embeds the API public payload with inert escaping and no private draft or tokens', async () => {
  const env = makeEnv({ ASSETS: { fetch: async () => new Response(shell, { headers: { 'content-type': 'text/html', etag: 'old', 'content-length': '12', 'content-encoding': 'gzip' } }) } });
  const s = await setupOrg(env), guest = client(env);
  const hostile = '</script><script>alert(1)</script>&>\u2028\u2029';
  await env.DB.prepare('UPDATE orgs SET name_en=? WHERE slug=?').bind(hostile, s.orgSlug).run();
  await s.owner.post('/api/owner/design/presets/smash-photo/apply', {});
  const ticket = await s.cashier.post('/api/branch/tickets', {});
  const expected = (await guest.get('/api/public/menu/' + s.branchSlug)).json;
  const page = await s.owner.get('/m/' + s.branchSlug);
  assert.deepEqual(stable(bootstrap(page.text)), stable(expected));
  assert.equal(bootstrap(page.text).design, null);
  assert.equal(page.text.includes(hostile), false);
  assert.match(page.text, /\\u003c\/script\\u003e/);
  assert.equal(page.text.includes(ticket.json.token), false);
  assert.equal(page.text.includes('owner@cafe.test'), false);
  assert.equal(page.headers.get('cache-control'), 'no-store');
  assert.equal(page.headers.get('cdn-cache-control'), 'no-store');
  assert.equal(page.headers.get('cloudflare-cdn-cache-control'), 'no-store');
  for (const key of ['etag', 'content-length', 'content-encoding']) assert.equal(page.headers.get(key), null);
  assert.equal(page.headers.get('content-security-policy').split(';').find(rule => rule.trim().startsWith('script-src')).includes("'unsafe-inline'"), false);
  assert.match(page.headers.get('content-security-policy'), /script-src 'self' https:/);
  assert.deepEqual(stable(bootstrap((await guest.get('/m/' + s.branchSlug + '/')).text)), stable(expected));
});

test('menu shell fetch bypasses conditional asset responses and preserves preview protection', async () => {
  let seen;
  const env = makeEnv({ ENVIRONMENT: 'preview', ASSETS: { fetch: async req => { seen = req; return new Response(shell, { headers: { 'content-type': 'text/html' } }); } } });
  const s = await setupOrg(env);
  const page = await client(env).get('/m/' + s.branchSlug, { 'if-none-match': 'old', 'if-modified-since': 'yesterday' });
  assert.equal(new URL(seen.url).pathname, '/menu');
  assert.equal(seen.headers.get('if-none-match'), null);
  assert.equal(seen.headers.get('if-modified-since'), null);
  assert.ok(bootstrap(page.text));
  assert.equal(page.headers.get('x-robots-tag'), 'noindex, nofollow');
});

test('inactive or missing branches and data read failures retain the recoverable shell', async () => {
  const env = makeEnv({ ASSETS: { fetch: async () => new Response(shell, { headers: { 'content-type': 'text/html' } }) } });
  const s = await setupOrg(env), guest = client(env);
  assert.equal(bootstrap((await guest.get('/m/unknown')).text), null);
  await env.DB.prepare('UPDATE branches SET active=0 WHERE id=?').bind(s.branchId).run();
  assert.equal(bootstrap((await guest.get('/m/' + s.branchSlug)).text), null);
  await env.DB.prepare('UPDATE branches SET active=1 WHERE id=?').bind(s.branchId).run();
  await env.DB.prepare('UPDATE orgs SET active=0 WHERE slug=?').bind(s.orgSlug).run();
  assert.equal(bootstrap((await guest.get('/m/' + s.branchSlug)).text), null);
  env.DB = { prepare() { throw new Error('unavailable'); } };
  assert.equal((await guest.get('/m/' + s.branchSlug)).text, shell);
});

test('asset errors and non HTML responses keep their status and body', async () => {
  for (const [status, type] of [[503, 'text/html'], [200, 'text/plain']]) {
    const env = makeEnv({ ASSETS: { fetch: async () => new Response('unavailable', { status, headers: { 'content-type': type } }) } });
    const s = await setupOrg(env);
    const page = await client(env).get('/m/' + s.branchSlug);
    assert.equal(page.status, status);
    assert.equal(page.text, 'unavailable');
  }
});

test('bootstrap rejects mismatched branches and oversized public data', async () => {
  const env = { ASSETS: { fetch: async () => new Response(shell, { headers: { 'content-type': 'text/html' } }) } };
  for (const data of [{ branch: { slug: 'foreign' } }, { branch: { slug: 'requested' }, description: 'x'.repeat(256 * 1024) }]) {
    const response = await menuPage(env, new Request('https://menu.test/m/requested'), 'requested', async () => data);
    assert.equal(bootstrap(await response.text()), null);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
});

test('escaped bootstrap bytes stay inside the payload cap',async()=>{
 const env={ASSETS:{fetch:async()=>new Response(shell,{headers:{'content-type':'text/html'}})}};
 const data={branch:{slug:'requested'},items:[],categories:[],description:'<'.repeat(50000)};
 assert.ok(Buffer.byteLength(JSON.stringify(data))<256*1024);
 const page=await menuPage(env,new Request('https://test.invalid/m/requested'),'requested',async()=>data);
 assert.equal(bootstrap(await page.text()),null,'escaped serialized payload must not exceed 256KiB');
});

test('head preloads match visible menu media and skip hidden images or custom fonts', async () => {
  const env = { ASSETS: { fetch: async () => new Response(shell, { headers: { 'content-type': 'text/html' } }) } };
  const data = {
    branch: { slug: 'requested' }, categories: [{ id: 'c' }], items: [{ category_id: 'c', available: true, image_url: '/image.webp?x="&y=1' }],
    profile_data: { profile: { theme: { show_images: true, font: 'tajawal' } } }, design: null,
  };
  const render = async () => (await menuPage(env, new Request('https://menu.test/m/requested'), 'requested', async () => data)).text();
  const visible = await render();
  assert.match(visible, /as="image" data-menu-first-image href="\/image.webp\?x=&quot;&amp;y=1"/);
  assert.match(visible, /href="\/fonts\/menu-tajawal.woff2"/);
  assert.match(visible, /href="\/fonts\/menu-jakarta-core.woff2"/);
  data.profile_data.profile.theme.show_images = false;
  data.profile_data.profile.theme.font = 'custom';
  const hidden = await render();
  assert.equal(hidden.includes('as="image"'), false);
  assert.equal(hidden.includes('as="font"'), false);
});
