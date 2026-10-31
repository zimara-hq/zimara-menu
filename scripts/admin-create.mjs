// Create a platform admin (max 4) directly in D1, without printing the password.
// Usage: npm run admin:create -- [--remote] [--db zimara-menu-db]
// Reads ADMIN_EMAIL, ADMIN_NAME, ADMIN_PASSWORD from the environment, or prompts.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { hashPassword } from '../src/auth.js';

const args = process.argv.slice(2);
const remote = args.includes('--remote');
const db = args.includes('--db') ? args[args.indexOf('--db') + 1] : 'zimara-menu-db';

async function ask(q, hidden = false) {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (hidden) rl._writeToOutput = (s) => rl.output.write(s.includes(q) ? s : '');
  const a = await rl.question(q);
  rl.close();
  if (hidden) process.stdout.write('\n');
  return a.trim();
}

const email = (process.env.ADMIN_EMAIL || (await ask('Admin email: '))).toLowerCase();
const name = process.env.ADMIN_NAME || (await ask('Admin name: '));
const password = process.env.ADMIN_PASSWORD || (await ask('Password (10+ chars): ', true));
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name || password.length < 10) {
  console.error('Invalid email, name or password (10+ chars).');
  process.exit(1);
}
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const sql = `INSERT INTO users (id, email, name, role, password_hash, created_at)
SELECT ${q(crypto.randomUUID())}, ${q(email)}, ${q(name)}, 'admin', ${q(await hashPassword(password))}, ${Date.now()}
WHERE (SELECT COUNT(*) FROM users WHERE role = 'admin') < 4;
SELECT changes() AS created;`;
const dir = mkdtempSync(join(tmpdir(), 'zm-'));
const file = join(dir, 'admin.sql');
writeFileSync(file, sql, { mode: 0o600 });
try {
  execFileSync('npx', ['wrangler', 'd1', 'execute', db, remote ? '--remote' : '--local', '--file', file], { stdio: 'inherit' });
  console.log(`Done. If "created" is 0 the 4-admin limit was reached or the email exists.`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
