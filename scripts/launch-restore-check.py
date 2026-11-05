#!/usr/bin/env python3
"""Verify a D1 SQL backup in a newly created temporary SQLite database only.

Does not invoke Wrangler, load credentials, connect to a provider, or retain rows.
"""
import argparse
import hashlib
import json
import pathlib
import sqlite3
import tempfile


def verify(directory, max_age_hours=48, required_tables=None):
    directory = pathlib.Path(directory)
    manifest = json.loads((directory / 'manifest.json').read_text())
    sql_bytes = (directory / 'database.sql').read_bytes()
    if manifest.get('version') != 1 or manifest.get('bytes') != len(sql_bytes):
        raise ValueError('Backup manifest version or byte count mismatch')
    if hashlib.sha256(sql_bytes).hexdigest() != manifest.get('sha256'):
        raise ValueError('Backup checksum mismatch')
    from datetime import datetime, timezone
    age_hours = (datetime.now(timezone.utc) - datetime.fromisoformat(manifest['created_at'].replace('Z', '+00:00'))).total_seconds() / 3600
    if age_hours < -0.1 or age_hours > max_age_hours:
        raise ValueError('Backup timestamp is stale or in the future')
    required_tables = required_tables or ['orgs', 'users', 'branches', 'platform_settings']
    with tempfile.TemporaryDirectory(prefix='zimara-restore-check-') as isolated:
        db = sqlite3.connect(str(pathlib.Path(isolated) / 'restore.sqlite'))
        try:
            db.enable_load_extension(False)
            # Dumps are SQL. Prevent file attachments, extensions, virtual-table
            # modules and unsafe PRAGMAs even if an input dump is tampered with.
            def authorize(action, arg1, arg2, _database, _trigger):
                if action in (sqlite3.SQLITE_ATTACH, sqlite3.SQLITE_DETACH, sqlite3.SQLITE_CREATE_VTABLE, sqlite3.SQLITE_DROP_VTABLE):
                    return sqlite3.SQLITE_DENY
                if action == sqlite3.SQLITE_FUNCTION and (arg2 or '').lower() in ('load_extension', 'writefile', 'readfile'):
                    return sqlite3.SQLITE_DENY
                if action == sqlite3.SQLITE_PRAGMA and (arg1 or '').lower() not in ('foreign_keys', 'defer_foreign_keys', 'encoding'):
                    return sqlite3.SQLITE_DENY
                return sqlite3.SQLITE_OK
            db.set_authorizer(authorize)
            db.executescript(sql_bytes.decode('utf-8'))
            db.set_authorizer(None)
            if db.execute('PRAGMA integrity_check').fetchall() != [('ok',)]:
                raise ValueError('SQLite integrity check failed')
            if db.execute('PRAGMA foreign_key_check').fetchone():
                raise ValueError('Restored backup has foreign key violations')
            tables = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
            if not set(required_tables).issubset(tables):
                raise ValueError('Restored backup is missing required application tables')
            counts = {name: db.execute('SELECT COUNT(*) FROM "' + name.replace('"', '""') + '"').fetchone()[0] for name in sorted(tables) if not name.startswith('sqlite_')}
            return {'status': 'ok', 'isolated': True, 'sha256': manifest['sha256'], 'age_hours': round(age_hours, 2), 'tables': len(counts), 'rows': sum(counts.values()), 'source': manifest.get('source'), 'restored_to_production': False}
        finally:
            db.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', help='Directory containing database.sql and manifest.json')
    parser.add_argument('--max-age-hours', type=float, default=48)
    args = parser.parse_args()
    try:
        if args.max_age_hours <= 0:
            raise ValueError('max-age-hours must be positive')
        print(json.dumps(verify(args.directory, args.max_age_hours)))
    except Exception as error:
        # Avoid printing SQL or rows on a failure.
        print(json.dumps({'status': 'failed', 'reason': type(error).__name__}))
        raise SystemExit(1)
