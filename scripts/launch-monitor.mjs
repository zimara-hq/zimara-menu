// A single read-only probe, suitable for an external scheduler that alerts on nonzero exit.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function checkHealth(baseUrl, { fetcher = fetch, timeoutMs = 10000 } = {}) {
  const base = new URL(baseUrl);
  if (base.username || base.password || base.search || base.hash || base.pathname !== '/') throw new Error('Supply an origin without credentials, path, query or fragment');
  if (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname))) throw new Error('HTTPS is required except on localhost');
  const start = performance.now();
  try {
    const response = await fetcher(new URL('/api/health', base), {
      method: 'GET', redirect: 'error', cache: 'no-store',
      headers: { accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs),
    });
    // Small diagnostic responses only. Never print response bodies or headers.
    const type = response.headers.get('content-type') || '';
    let healthy = false;
    if (response.status === 200 && type.includes('application/json') && response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let value = '', bytes = 0;
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > 4096) break;
          value += decoder.decode(chunk.value, { stream: true });
        }
        if (bytes <= 4096) healthy = JSON.parse(value + decoder.decode()).status === 'ok';
      } finally { await reader.cancel().catch(() => {}); }
    } else { await response.body?.cancel(); }
    return { status: healthy ? 'ok' : 'failed', http_status: response.status, latency_ms: Math.round(performance.now() - start) };
  } catch {
    return { status: 'failed', reason: 'request_or_response_failed', latency_ms: Math.round(performance.now() - start) };
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) throw new Error('Use node scripts/launch-monitor.mjs https://YOUR_APPROVED_ORIGIN');
    const result = await checkHealth(process.argv[2]);
    console.log(JSON.stringify(result));
    if (result.status !== 'ok') process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
