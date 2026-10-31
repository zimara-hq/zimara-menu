import { requireRole, body, audit } from './context.js';
import { bad, now, str } from './util.js';

// ZIMARA's own legal identity as the seller. Empty until Az enters the issued details; the
// public pages show only what is filled in, never placeholder numbers.
export const LEGAL_KEYS = ['legal_name_ar', 'legal_name_en', 'cr_number', 'vat_number', 'address_ar', 'address_en', 'support_email', 'support_phone'];
const LIMITS = { cr_number: /^\d{10}$/, vat_number: /^3\d{13}3$/ };

export async function legalInfo(env) {
  const { results } = await env.DB.prepare(`SELECT key, value FROM platform_settings WHERE key IN (${LEGAL_KEYS.map(() => '?').join(',')})`).bind(...LEGAL_KEYS).all();
  return Object.fromEntries(LEGAL_KEYS.map((k) => [k, results.find((r) => r.key === k)?.value || '']));
}

const BILLING = { billing_legal_name: 200, billing_vat_number: 15, billing_cr_number: 10, billing_address: 300 };

export function registerLegal(app) {
  app.get('/api/legal', async (c) => {
    c.header('cache-control', 'public, max-age=300');
    return c.json({ legal: await legalInfo(c.env) });
  });

  app.put('/api/admin/legal', requireRole('admin'), async (c) => {
    const b = await body(c);
    const t = now(), u = c.get('user');
    const stmts = [];
    for (const k of LEGAL_KEYS) {
      if (!(k in b)) continue;
      const v = String(b[k] ?? '').trim();
      if (v && LIMITS[k] && !LIMITS[k].test(v)) throw bad('invalid_' + k);
      if (v) str(v, k, { max: 300 });
      stmts.push(v
        ? c.env.DB.prepare('INSERT INTO platform_settings (key, value, updated_by, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at').bind(k, v, u.id, t)
        : c.env.DB.prepare('DELETE FROM platform_settings WHERE key = ?').bind(k));
    }
    if (stmts.length) await c.env.DB.batch(stmts);
    await audit(c.env, u, 'platform.legal.update', { keys: Object.keys(b).filter((k) => LEGAL_KEYS.includes(k)) });
    return c.json({ legal: await legalInfo(c.env) });
  });

  // The subscriber's details printed on their B2B subscription invoices.
  app.get('/api/owner/billing-profile', requireRole('owner'), async (c) => {
    const row = await c.env.DB.prepare('SELECT billing_legal_name, billing_vat_number, billing_cr_number, billing_address FROM orgs WHERE id = ?').bind(c.get('user').org_id).first();
    return c.json({ profile: row });
  });

  app.put('/api/owner/billing-profile', requireRole('owner'), async (c) => {
    const b = await body(c);
    const vals = {};
    for (const [k, max] of Object.entries(BILLING)) {
      const v = String(b[k] ?? '').trim();
      if (v.length > max) throw bad('invalid_' + k);
      vals[k] = v || null;
    }
    if (vals.billing_vat_number && !LIMITS.vat_number.test(vals.billing_vat_number)) throw bad('invalid_billing_vat_number');
    if (vals.billing_cr_number && !LIMITS.cr_number.test(vals.billing_cr_number)) throw bad('invalid_billing_cr_number');
    await c.env.DB.prepare('UPDATE orgs SET billing_legal_name = ?, billing_vat_number = ?, billing_cr_number = ?, billing_address = ? WHERE id = ?')
      .bind(vals.billing_legal_name, vals.billing_vat_number, vals.billing_cr_number, vals.billing_address, c.get('user').org_id).run();
    const orgId = c.get('user').org_id, t = now();
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE subscription_invoices SET state = 'pending' WHERE org_id = ? AND state = 'rejected' AND id IN (SELECT invoice_id FROM subscription_invoice_jobs WHERE state IN ('needs_details','rejected'))").bind(orgId),
      c.env.DB.prepare("UPDATE subscription_invoice_jobs SET state = 'pending', next_attempt_at = ?, locked_at = NULL, last_error = NULL, updated_at = ? WHERE state IN ('needs_details','rejected') AND invoice_id IN (SELECT id FROM subscription_invoices WHERE org_id = ? AND state = 'pending')").bind(t, t, orgId),
    ]);
    await audit(c.env, c.get('user'), 'org.billing_profile.update', null);
    return c.json({ profile: vals });
  });
}
