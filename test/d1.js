// Minimal D1 stand-in over node:sqlite, enough for the app's prepare/bind/first/all/run/batch use.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';

export function createD1() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  const dir = new URL('../migrations/', import.meta.url);
  for (const f of readdirSync(dir).sort()) db.exec(readFileSync(new URL(f, dir), 'utf8'));

  const norm = (v) => (v === undefined ? null : typeof v === 'boolean' ? Number(v) : v);
  class Stmt {
    constructor(sql, params = []) {
      this.sql = sql;
      this.params = params;
    }
    bind(...p) {
      return new Stmt(this.sql, p.map(norm));
    }
    exec() {
      const s = db.prepare(this.sql);
      if (/^\s*(SELECT|WITH)/i.test(this.sql)) return { rows: s.all(...this.params), changes: 0 };
      const r = s.run(...this.params);
      return { rows: [], changes: Number(r.changes) };
    }
    async first() {
      return this.exec().rows[0] ?? null;
    }
    async all() {
      return { results: this.exec().rows };
    }
    async run() {
      return { meta: { changes: this.exec().changes } };
    }
  }
  return {
    raw: db,
    prepare: (sql) => new Stmt(sql),
    async batch(stmts) {
      db.exec('BEGIN');
      try {
        const out = stmts.map((s) => ({ meta: { changes: s.exec().changes } }));
        db.exec('COMMIT');
        return out;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  };
}
