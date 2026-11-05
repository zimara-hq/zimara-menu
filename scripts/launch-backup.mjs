// Read-only D1 export. No restore command here can target a remote database.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function backupArgs(args) {
  const result = { remote: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--remote') result.remote = true;
    else if (['--config', '--database', '--output', '--env'].includes(arg) && args[i + 1] && !args[i + 1].startsWith('--')) result[arg.slice(2)] = args[++i];
    else throw new Error('Use --config FILE --database NAME --output NEW_DIRECTORY [--env NAME] [--remote]');
  }
  if (!result.config || !result.database || !result.output) throw new Error('Explicit --config, --database and --output are required');
  if (!/^[a-zA-Z0-9_-]+$/.test(result.database)) throw new Error('Invalid database name');
  return result;
}

export function exportBackup(options) {
  const output = resolve(options.output);
  // Exclusive directory creation prevents overwriting an earlier backup or following a symlink.
  mkdirSync(dirname(output), { recursive: true, mode: 0o700 });
  mkdirSync(output, { mode: 0o700 });
  const sql = resolve(output, 'database.sql');
  try {
    const args = ['d1', 'export', options.database, '--config', resolve(options.config), options.remote ? '--remote' : '--local', '--output', sql];
    if (options.env) args.push('--env', options.env);
    const run = spawnSync(resolve('node_modules/.bin/wrangler'), args, { encoding: 'utf8', stdio: 'pipe', env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } });
    if (run.error || run.status !== 0) throw new Error('D1 export failed; inspect Wrangler locally without sharing credentials or database content');
    chmodSync(sql, 0o600);
    const data = readFileSync(sql);
    if (!data.length) throw new Error('D1 export was empty');
    const manifest = { version: 1, created_at: new Date().toISOString(), database: options.database, source: options.remote ? 'remote' : 'local', environment: options.env || null, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') };
    writeFileSync(resolve(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    return { directory: output, ...manifest };
  } catch (error) {
    rmSync(output, { recursive: true, force: true });
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(exportBackup(backupArgs(process.argv.slice(2))))); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
