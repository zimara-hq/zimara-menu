// Verify SQL in a fresh in-memory SQLite database. No remote or persistent target.
import { DatabaseSync, constants } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function verifyBackup(directory, { maxAgeHours = 48, requiredTables = ['orgs', 'users', 'branches', 'platform_settings'] } = {}) {
  if (!Number.isFinite(maxAgeHours) || maxAgeHours <= 0) throw new Error('Invalid freshness threshold');
  const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'));
  const sql = readFileSync(join(directory, 'database.sql'));
  if (manifest.version !== 1 || manifest.bytes !== sql.length) throw new Error('Backup manifest version or byte count mismatch');
  if (createHash('sha256').update(sql).digest('hex') !== manifest.sha256) throw new Error('Backup checksum mismatch');
  const ageHours = (Date.now() - Date.parse(manifest.created_at)) / 3600000;
  if (!Number.isFinite(ageHours) || ageHours < -0.1 || ageHours > maxAgeHours) throw new Error('Backup timestamp is stale or in the future');
  const db = new DatabaseSync(':memory:', { allowExtension: false, enableForeignKeyConstraints: false });
  try {
    // Fail closed on older Node builds. SQL string filtering cannot replace SQLite's
    // authorizer: e.g. VACUUM INTO can write files without an ATTACH token in SQL.
    if (typeof db.setAuthorizer !== 'function') throw new Error('SQLite authorizer is required');
    const deniedActions = new Set([constants.SQLITE_ATTACH, constants.SQLITE_DETACH, constants.SQLITE_CREATE_VTABLE, constants.SQLITE_DROP_VTABLE]);
    db.setAuthorizer((action, arg1, arg2) => {
      if (deniedActions.has(action)) return constants.SQLITE_DENY;
      if (action === constants.SQLITE_FUNCTION && ['load_extension', 'writefile', 'readfile'].includes((arg2 || '').toLowerCase())) return constants.SQLITE_DENY;
      if (action === constants.SQLITE_PRAGMA && !['foreign_keys', 'defer_foreign_keys', 'encoding'].includes((arg1 || '').toLowerCase())) return constants.SQLITE_DENY;
      return constants.SQLITE_OK;
    });
    db.exec(new TextDecoder('utf-8', { fatal: true }).decode(sql));
    // Keep restrictions active during checks too: restored triggers/views must
    // never gain file access. Only add the two diagnostic read-only PRAGMAs.
    db.setAuthorizer((action, arg1, arg2) => {
      if (deniedActions.has(action)) return constants.SQLITE_DENY;
      if (action === constants.SQLITE_FUNCTION && ['load_extension', 'writefile', 'readfile'].includes((arg2 || '').toLowerCase())) return constants.SQLITE_DENY;
      if (action === constants.SQLITE_PRAGMA && !['integrity_check', 'foreign_key_check'].includes((arg1 || '').toLowerCase())) return constants.SQLITE_DENY;
      return constants.SQLITE_OK;
    });
    const integrity = db.prepare('PRAGMA integrity_check').all();
    if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok') throw new Error('SQLite integrity check failed');
    if (db.prepare('PRAGMA foreign_key_check').get()) throw new Error('Restored backup has foreign key violations');
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(row => row.name);
    if (!requiredTables.every(name => tables.includes(name))) throw new Error('Restored backup is missing required application tables');
    const applicationTables = tables.filter(name => !name.startsWith('sqlite_'));
    const rows = applicationTables.reduce((count, name) => count + db.prepare('SELECT COUNT(*) AS count FROM "' + name.replaceAll('"', '""') + '"').get().count, 0);
    return { status: 'ok', isolated: true, sha256: manifest.sha256, age_hours: Math.round(ageHours * 100) / 100, tables: applicationTables.length, rows, source: manifest.source, restored_to_production: false };
  } finally { db.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (!(args.length === 1 || (args.length === 3 && args[1] === '--max-age-hours'))) throw new Error('Invalid arguments');
    console.log(JSON.stringify(verifyBackup(args[0], args.length === 3 ? { maxAgeHours: Number(args[2]) } : {})));
  } catch (error) {
    // Never print SQL, file contents or database rows in diagnostics.
    console.log(JSON.stringify({ status: 'failed', reason: error.name }));
    process.exitCode = 1;
  }
}
