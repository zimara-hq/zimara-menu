#!/usr/bin/env node
/**
 * Build an isolated preview module with embedded public assets.
 * No Cloudflare credentials, .dev.vars, environment file or production config is read.
 */
import { readFile, readdir, lstat, mkdir, writeFile, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = join(root, 'public');
const outDir = join(root, '.wrangler', 'preview-build');
const MAX_ASSET_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.avif': 'image/avif', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.mp4': 'video/mp4',
  '.webm': 'video/webm', '.pdf': 'application/pdf', '.csv': 'text/csv; charset=utf-8',
};
const TEXT = new Set(['.html', '.css', '.js', '.mjs', '.json', '.webmanifest', '.txt', '.xml', '.svg', '.csv']);
const SKIP_NAMES = new Set(['_headers', '_redirects', 'node_modules', 'output', 'artifacts', 'test-results', 'playwright-report']);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function resolveEsbuild() {
  const localRequire = createRequire(join(root, 'package.json'));
  try { return localRequire('esbuild'); } catch {}
  for (const entry of ['wrangler/package.json', 'wrangler']) {
    try { return createRequire(localRequire.resolve(entry))('esbuild'); } catch {}
  }
  throw new Error('esbuild is unavailable. Install the project dependencies with npm ci before building a preview.');
}

async function collect(directory, records = []) {
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith('.') || SKIP_NAMES.has(entry.name) || entry.name.endsWith('.map')) continue;
    const path = join(directory, entry.name);
    const stat = await lstat(path);
    // Never follow a link from public into a secret or another workspace directory.
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) { await collect(path, records); continue; }
    if (!stat.isFile()) continue;
    const extension = extname(entry.name).toLowerCase();
    if (!Object.hasOwn(MIME, extension)) throw new Error('Unsupported public asset type: ' + relative(root, path));
    if (stat.size > MAX_ASSET_BYTES) throw new Error('Public asset exceeds 5 MiB preview limit: ' + relative(root, path));
    const bytes = await readFile(path);
    const key = '/' + relative(publicDir, path).split(sep).join('/');
    records.push({ key, bytes, mime: MIME[extension], text: TEXT.has(extension), sha256: sha256(bytes) });
  }
  return records;
}

async function headerRules() {
  let text;
  try { text = await readFile(join(publicDir, '_headers'), 'utf8'); } catch (e) { if (e.code === 'ENOENT') return []; throw e; }
  const rules = [];
  let rule;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    if (/^\//.test(line)) { rule = { pattern: line.trim(), headers: [] }; rules.push(rule); continue; }
    const match = line.match(/^\s+([!#$%&'*+.^_`|~0-9A-Za-z-]+):\s*(.*)$/);
    if (!rule || !match || /[\r\n]/.test(match[2])) throw new Error('Unsupported public/_headers line: ' + line.trim());
    rule.headers.push([match[1], match[2]]);
  }
  return rules;
}

const records = await collect(publicDir);
if (!records.some((asset) => asset.key === '/index.html')) throw new Error('public/index.html is required.');
const totalBytes = records.reduce((sum, asset) => sum + asset.bytes.length, 0);
if (totalBytes > MAX_TOTAL_BYTES) throw new Error('Public assets exceed the 20 MiB embedded-preview limit. Use the normal asset upload pipeline.');
const assets = Object.fromEntries(records.map((asset) => [asset.key, {
  body: asset.bytes.toString(asset.text ? 'utf8' : 'base64'),
  text: asset.text,
  mime: asset.mime,
  etag: '"' + asset.sha256 + '"',
}]));
const rules = await headerRules();
const wrapper = `
import sourceWorker from ${JSON.stringify(join(root, 'src', 'worker.js'))};
const assets = ${JSON.stringify(assets)};
const rules = ${JSON.stringify(rules)};
function ruleMatches(pattern, path) {
  if (pattern.endsWith('*')) return path.startsWith(pattern.slice(0, -1));
  return pattern === path;
}
function findAsset(path) {
  if (path === '/') return '/index.html';
  if (Object.hasOwn(assets, path)) return path;
  if (path.endsWith('/')) {
    if (Object.hasOwn(assets, path + 'index.html')) return path + 'index.html';
    const clean = path.slice(0, -1) + '.html';
    if (Object.hasOwn(assets, clean)) return clean;
  }
  if (Object.hasOwn(assets, path + '.html')) return path + '.html';
  if (Object.hasOwn(assets, path + '/index.html')) return path + '/index.html';
  return null;
}
const embeddedAssets = { async fetch(request) {
  if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD', 'X-Content-Type-Options': 'nosniff' } });
  let path;
  try { path = decodeURIComponent(new URL(request.url).pathname); } catch { return new Response('Bad request', { status: 400 }); }
  const key = findAsset(path);
  const asset = assets[key || '/404.html'];
  const status = key ? 200 : 404;
  if (!asset) return new Response('Not found', { status: 404, headers: { 'X-Content-Type-Options': 'nosniff' } });
  const headers = new Headers({
    'Content-Type': asset.mime, 'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin', 'ETag': asset.etag,
    'Cache-Control': asset.mime.startsWith('text/html') || path === '/sw.js' || path.endsWith('.webmanifest') ? 'no-cache' : 'public, max-age=3600',
  });
  for (const rule of rules) if (ruleMatches(rule.pattern, path)) for (const [name, value] of rule.headers) headers.set(name, value);
  if (key && request.headers.get('If-None-Match') === asset.etag) return new Response(null, { status: 304, headers });
  if (request.method === 'HEAD') return new Response(null, { status, headers });
  const body = asset.text ? asset.body : Uint8Array.from(atob(asset.body), (character) => character.charCodeAt(0));
  return new Response(body, { status, headers });
}};
export default {
  ...sourceWorker,
  fetch(request, env, ctx) {
    return sourceWorker.fetch(request, { ...env, ASSETS: env.ASSETS || embeddedAssets }, ctx);
  },
};
`;

const esbuild = resolveEsbuild();
const result = await esbuild.build({
  stdin: { contents: wrapper, resolveDir: root, sourcefile: 'embedded-preview-entry.mjs', loader: 'js' },
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'esm',
  target: 'es2022',
  minify: true,
  sourcemap: false,
  legalComments: 'eof',
  metafile: true,
  conditions: ['workerd', 'worker', 'browser'],
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'warning',
});
const moduleBytes = result.outputFiles[0].contents;
let gitSha = null;
try { gitSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch {}
const manifest = {
  kind: 'isolated-preview-embedded-assets',
  built_at: new Date().toISOString(),
  source_commit: gitSha,
  source_commit_note: 'HEAD identifies the base commit; working-tree edits are included at build time.',
  module: { path: '.wrangler/preview-build/index.js', sha256: sha256(moduleBytes), bytes: moduleBytes.length, gzip_bytes: gzipSync(moduleBytes, { level: 9 }).length },
  assets: { count: records.length, total_bytes: totalBytes, files: records.map((asset) => ({ path: asset.key, bytes: asset.bytes.length, sha256: asset.sha256, mime: asset.mime })) },
  scheduler_preserved: true,
  assets_binding_required: false,
  required_runtime_binding: 'DB (isolated preview D1 only)',
  config_or_secret_files_read: false,
  bundle_source_files: Object.keys(result.metafile.inputs).filter((path) => path !== 'embedded-preview-entry.mjs').sort(),
};
await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, 'index.js.tmp'), moduleBytes);
await rename(join(outDir, 'index.js.tmp'), join(outDir, 'index.js'));
await writeFile(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ ...manifest.module, asset_count: records.length, asset_bytes: totalBytes, manifest: '.wrangler/preview-build/manifest.json' }, null, 2));
