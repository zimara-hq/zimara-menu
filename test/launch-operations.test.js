import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { backupArgs } from '../scripts/launch-backup.mjs';
import { checkHealth } from '../scripts/launch-monitor.mjs';
import { legalReadiness } from '../src/legal.js';

test('legal completeness accepts a non-VAT seller without inventing registration', () => {
  assert.deepEqual(legalReadiness().missing, ['legal_name', 'cr_number', 'address', 'support_email']);
  const legal = { legal_name_ar: 'اسم مثال', cr_number: '1010123456', address_ar: 'عنوان مثال', support_email: 'support@example.test' };
  assert.deepEqual(legalReadiness(legal), { ready: true, missing: [], vat_registered: false });
  assert.ok(legalReadiness({ ...legal, vat_number: '123' }).missing.includes('valid_vat_number'));
  assert.ok(legalReadiness({ ...legal, support_email: 'invalid' }).missing.includes('support_email'));
});

test('backup requires explicit resource configuration and defaults to a local export', () => {
  assert.throws(() => backupArgs([]));
  assert.throws(() => backupArgs(['--config', 'a', '--database', 'b', '--output', 'c', '--restore']));
  assert.equal(backupArgs(['--config', 'a', '--database', 'b', '--output', 'c']).remote, false);
  assert.equal(backupArgs(['--config', 'a', '--database', 'b', '--output', 'c', '--remote']).remote, true);
});

test('health monitor rejects redirects/access pages/degraded state and accepts only explicit health JSON', async () => {
  for (const response of [new Response('Access login'), Response.json({ status: 'degraded' }, { status: 503 }), Response.json({ other: 'ok' }), Response.json({ status: 'ok', oversized: 'x'.repeat(5000) })]) {
    assert.equal((await checkHealth('https://example.test', { fetcher: async () => response })).status, 'failed');
  }
  const result = await checkHealth('https://example.test', { fetcher: async (url, options) => {
    assert.equal(String(url), 'https://example.test/api/health');
    assert.equal(options.redirect, 'error');
    assert.equal(options.cache, 'no-store');
    return Response.json({ status: 'ok' });
  } });
  assert.equal(result.status, 'ok');
  assert.equal((await checkHealth('https://example.test', { fetcher: async () => { throw new Error('timeout'); } })).status, 'failed');
  await assert.rejects(checkHealth('http://example.test'));
  await assert.rejects(checkHealth('https://secret@example.test'));
  await assert.rejects(checkHealth('https://example.test/another-path'));
});

test('isolated restore verifies full migrated application schema and rejects corrupt, stale, broken-FK and file-writing SQL', () => {
  const directory = mkdtempSync(join(tmpdir(), 'zimara-backup-test-'));
  const writeBackup = (sql, extra = {}) => {
    writeFileSync(join(directory, 'database.sql'), sql);
    writeFileSync(join(directory, 'manifest.json'), JSON.stringify({ version: 1, created_at: new Date().toISOString(), bytes: Buffer.byteLength(sql), sha256: createHash('sha256').update(sql).digest('hex'), source: 'local', ...extra }));
  };
  const verify = (...args) => spawnSync(process.execPath, [resolve('scripts/launch-restore-check.mjs'), directory, ...args], { encoding: 'utf8' });
  try {
    const schema = readdirSync('migrations').filter(f => f.endsWith('.sql')).sort().map(f => readFileSync(join('migrations', f), 'utf8')).join('\n');
    // Create a real SQLite dump, including a representative relational row pair.
    const seed = "\nINSERT INTO orgs (id,slug,name_ar,name_en,created_at) VALUES ('restore-org','restore-org','مثال','Restore fixture',0);\nINSERT INTO branches (id,org_id,slug,name_ar,name_en,created_at) VALUES ('restore-branch','restore-org','restore-branch','مثال','Restore branch',0);";
    const fixture = new DatabaseSync(':memory:');
    let dump;
    try {
      fixture.exec(schema + seed);
      const objects = fixture.prepare("SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY rowid").all();
      const quoteIdentifier = name => '"' + name.replaceAll('"', '""') + '"';
      const statements = ['PRAGMA foreign_keys=OFF;', 'BEGIN TRANSACTION;'];
      for (const table of objects.filter(row => row.type === 'table')) {
        statements.push(table.sql + ';');
        const columns = fixture.prepare('PRAGMA table_info(' + quoteIdentifier(table.name) + ')').all().map(column => column.name);
        const rows = fixture.prepare('SELECT ' + columns.map(name => 'quote(' + quoteIdentifier(name) + ')').join(',') + ' FROM ' + quoteIdentifier(table.name)).all();
        for (const row of rows) statements.push('INSERT INTO ' + quoteIdentifier(table.name) + ' (' + columns.map(quoteIdentifier).join(',') + ') VALUES (' + Object.values(row).join(',') + ');');
      }
      for (const object of objects.filter(row => row.type !== 'table')) statements.push(object.sql + ';');
      statements.push('COMMIT;');
      dump = statements.join('\n');
    } finally { fixture.close(); }
    writeBackup(dump);
    let result = verify();
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(JSON.parse(result.stdout).isolated, true);
    assert.ok(JSON.parse(result.stdout).tables > 20);
    assert.ok(JSON.parse(result.stdout).rows >= 2);
    writeBackup(dump, { sha256: '0'.repeat(64) });
    assert.equal(verify().status, 1);
    writeBackup(dump, { created_at: '2000-01-01T00:00:00Z' });
    assert.equal(verify().status, 1);
    writeBackup(dump + '\nPRAGMA foreign_keys=OFF; CREATE TABLE restore_child (parent TEXT REFERENCES orgs(id)); INSERT INTO restore_child VALUES (\'missing\');');
    assert.equal(verify().status, 1);
    const forbidden = join(directory, 'outside.sqlite');
    const forbiddenLiteral = "'" + forbidden.replaceAll("'", "''") + "'";
    for (const unsafe of [
      'ATTACH DATABASE ' + forbiddenLiteral + ' AS other;',
      'VACUUM INTO ' + forbiddenLiteral + ';',
      'SELECT load_extension(' + forbiddenLiteral + ');',
      'SELECT writefile(' + forbiddenLiteral + ", 'forbidden');",
      'PRAGMA writable_schema=ON;',
      'CREATE VIRTUAL TABLE unsafe USING fts5(value);',
    ]) {
      writeBackup(dump + '\n' + unsafe);
      assert.equal(verify().status, 1, unsafe);
      assert.equal(readdirSync(directory).includes('outside.sqlite'), false, unsafe);
    }
    writeBackup(dump, { created_at: 'invalid-date' });
    assert.equal(verify().status, 1);
    writeBackup(dump);
    assert.equal(verify('--max-age-hours', 'NaN').status, 1);
    assert.equal(verify('--max-age-hours', '-1').status, 1);
    writeBackup('CREATE TABLE unrelated (id TEXT);');
    assert.equal(verify().status, 1);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
