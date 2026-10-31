import { now } from '../util.js';

const API = 'https://api.simplefatoora.com';
const http = (env) => env.HTTP_FETCH || fetch;
const targetEnvironment = (env) => env.SIMPLE_FATOORA_ENV === 'live' ? 'live' : 'sandbox';

export function simpleFatooraConfigured(env) {
  if (env.SIMPLE_FATOORA_ENABLED !== 'true' || env.SIMPLE_FATOORA_SELLER_PROFILE_APPROVED !== 'true' || !env.SIMPLE_FATOORA_API_KEY) return false;
  return targetEnvironment(env) !== 'live' || env.SIMPLE_FATOORA_LIVE_ISSUING_ENABLED === 'true';
}

async function request(env, path, payload) {
  if (!simpleFatooraConfigured(env)) throw Object.assign(new Error('simple_fatoora_not_configured'), { kind: 'rejected' });
  const response = await http(env)(API + path, {
    method: 'POST',
    headers: { 'X-API-Key': env.SIMPLE_FATOORA_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    // A provider rejection is definite for 4xx. A 5xx may have happened after document creation.
    throw Object.assign(new Error('simple_fatoora_http_' + response.status), { kind: response.status < 500 ? 'rejected' : 'unknown' });
  }
  if (!data || data.status !== true || !data.response) throw Object.assign(new Error('simple_fatoora_rejected'), { kind: 'rejected' });
  return data.response;
}

export async function validateSimpleFatooraKey(env) {
  const response = await request(env, '/sdk/users/validate_user_api_key', { api_key: env.SIMPLE_FATOORA_API_KEY });
  const keyMatches = targetEnvironment(env) === 'sandbox'
    ? response.sandbox_api_key === env.SIMPLE_FATOORA_API_KEY
    : response.production_api_key === env.SIMPLE_FATOORA_API_KEY;
  if (!keyMatches) throw Object.assign(new Error('simple_fatoora_api_key_environment_mismatch'), { kind: 'rejected' });
}

export async function createSimpleFatooraInvoice(env, payload) {
  const response = await request(env, '/sdk/invoice/create', payload);
  const receivedEnvironment = response.environment === 'live' ? 'live' : 'sandbox';
  if (receivedEnvironment !== targetEnvironment(env)) throw Object.assign(new Error('simple_fatoora_environment_mismatch'), { kind: 'unknown' });
  if (!response.id || !response.invoice_number) throw Object.assign(new Error('simple_fatoora_incomplete_response'), { kind: 'unknown' });
  return {
    id: String(response.id),
    number: String(response.invoice_number),
    pdfUrl: typeof response.invoice === 'string' ? response.invoice : null,
    environment: receivedEnvironment,
    totalHalalas: Number.isFinite(Number(response.total)) ? Math.round(Number(response.total) * 100) : null,
  };
}

export async function findSimpleFatooraInvoice(env, reference) {
  const response = await request(env, '/sdk/invoice/get_all', { page: 1, per_page: 20, search_key: reference });
  const rows = Array.isArray(response.invoices) ? response.invoices : [];
  const matches = rows.filter((row) => String(row.reference_number || '') === reference);
  if (matches.length !== 1) return matches.length ? { ambiguous: true } : null;
  const row = matches[0];
  if (!row.id || !row.invoice_number) return { ambiguous: true };
  const receivedEnvironment = row.environment === 'live' ? 'live' : 'sandbox';
  if (receivedEnvironment !== targetEnvironment(env)) return { ambiguous: true };
  return {
    id: String(row.id),
    number: String(row.invoice_number),
    pdfUrl: typeof row.invoice === 'string' ? row.invoice : null,
    environment: receivedEnvironment,
    totalHalalas: Number.isFinite(Number(row.total)) ? Math.round(Number(row.total) * 100) : null,
  };
}

const markUnknown = (env, invoiceId, error) => env.DB.batch([
  env.DB.prepare("UPDATE subscription_invoice_jobs SET state = 'unknown', locked_at = NULL, last_error = ?, updated_at = ? WHERE invoice_id = ?")
    .bind(String(error?.message || 'provider_response_unknown').slice(0, 80), now(), invoiceId),
]);

async function finishInvoice(env, job, issued) {
  const expected = await env.DB.prepare('SELECT total FROM subscription_invoices WHERE id = ? AND state = ?').bind(job.invoice_id, 'pending').first();
  if (!expected || issued.totalHalalas === null || issued.totalHalalas !== Number(expected.total)) {
    await markUnknown(env, job.invoice_id, new Error('provider_amount_mismatch'));
    return false;
  }
  const t = now();
  await env.DB.batch([
    env.DB.prepare("UPDATE subscription_invoices SET provider = 'simple_fatoora', provider_reference = ?, number = ?, state = 'issued', pdf_url = ?, issued_at = ? WHERE id = ? AND state = 'pending'")
      .bind(issued.id, issued.number, issued.pdfUrl, t, job.invoice_id),
    env.DB.prepare("UPDATE subscription_invoice_jobs SET state = 'issued', locked_at = NULL, last_error = NULL, updated_at = ? WHERE invoice_id = ?")
      .bind(t, job.invoice_id),
  ]);
  return true;
}

function invoicePayload(row, reference) {
  const subtotal = Number(row.subtotal);
  const vat = Number(row.vat);
  const percent = subtotal > 0 ? Number(((vat / subtotal) * 100).toFixed(4)) : 0;
  return {
    invoice_type: vat > 0 ? 1 : 0,
    created_type: 'api',
    client_name: row.billing_legal_name,
    client_address: row.billing_address,
    client_email_id: row.owner_email,
    ...(row.billing_vat_number ? { client_vat_number: row.billing_vat_number } : {}),
    ...(row.billing_cr_number ? { client_cr_number: row.billing_cr_number } : {}),
    currency: 'SAR',
    taxes_included: 0,
    reference_number: reference,
    invoice_detail: [{
      description: 'ZIMARA Menu subscription · ' + row.plan + ' · ' + row.cycle,
      unit_price: Number((subtotal / 100).toFixed(2)),
      quantity: 1,
      vat_percent: percent,
    }],
  };
}

export async function processSimpleFatooraInvoices(env) {
  if (!simpleFatooraConfigured(env)) return { processed: 0, configured: false };
  const t = now();

  // A worker can be terminated after the provider creates a document but before D1 records it.
  // Never blindly repeat an ambiguous create; reconcile it by the stable reference instead.
  await env.DB.prepare("UPDATE subscription_invoice_jobs SET state = 'unknown', locked_at = NULL, last_error = 'worker_interrupted', updated_at = ? WHERE state = 'issuing' AND locked_at < ?")
    .bind(t, t - 60000).run();

  const { results } = await env.DB.prepare("SELECT * FROM subscription_invoice_jobs WHERE state IN ('pending','unknown') AND next_attempt_at <= ? ORDER BY created_at LIMIT 10").bind(t).all();
  if (!results.length) return { processed: 0, configured: true, keyValidated: false };
  try { await validateSimpleFatooraKey(env); } catch { return { processed: 0, configured: true, keyValidated: false }; }
  let processed = 0;
  for (const job of results) {
    if (job.state === 'unknown') {
      try {
        const recovered = await findSimpleFatooraInvoice(env, job.reference_number);
        if (recovered && !recovered.ambiguous) await finishInvoice(env, job, recovered);
        else if (recovered?.ambiguous) await env.DB.prepare("UPDATE subscription_invoice_jobs SET last_error = 'reconciliation_ambiguous', updated_at = ? WHERE invoice_id = ?").bind(now(), job.invoice_id).run();
      } catch { /* keep unknown and retry the read-only reconciliation next time */ }
      processed++;
      continue;
    }

    const claimed = await env.DB.prepare("UPDATE subscription_invoice_jobs SET state = 'issuing', locked_at = ?, attempts = attempts + 1, updated_at = ? WHERE invoice_id = ? AND state = 'pending' AND next_attempt_at <= ?")
      .bind(t, t, job.invoice_id, t).run();
    if (!claimed.meta?.changes) continue;
    const row = await env.DB.prepare(
      'SELECT i.id AS invoice_id, i.subtotal, i.vat, i.total, b.plan, b.cycle, ' +
      'o.billing_legal_name, o.billing_vat_number, o.billing_cr_number, o.billing_address, u.email AS owner_email ' +
      'FROM subscription_invoices i ' +
      'JOIN subscription_invoice_jobs j ON j.invoice_id = i.id ' +
      'JOIN billing_checkouts b ON b.provider_invoice_id = j.payment_reference AND b.org_id = i.org_id ' +
      'JOIN orgs o ON o.id = i.org_id ' +
      "JOIN users u ON u.org_id = i.org_id AND u.role = 'owner' " +
      'WHERE i.id = ? LIMIT 1'
    ).bind(job.invoice_id).first();

    if (!row?.billing_legal_name || !row?.billing_address || !row?.owner_email || (row.vat > 0 && !row.billing_vat_number)) {
      await env.DB.prepare("UPDATE subscription_invoice_jobs SET state = 'needs_details', locked_at = NULL, last_error = 'billing_profile_incomplete', updated_at = ? WHERE invoice_id = ?")
        .bind(now(), job.invoice_id).run();
      processed++;
      continue;
    }

    try {
      const issued = await createSimpleFatooraInvoice(env, invoicePayload(row, job.reference_number));
      await finishInvoice(env, job, issued);
    } catch (error) {
      if (error.kind === 'rejected') {
        await env.DB.batch([
          env.DB.prepare("UPDATE subscription_invoice_jobs SET state = 'rejected', locked_at = NULL, last_error = ?, updated_at = ? WHERE invoice_id = ?")
            .bind(String(error.message).slice(0, 80), now(), job.invoice_id),
          env.DB.prepare("UPDATE subscription_invoices SET state = 'rejected' WHERE id = ? AND state = 'pending'").bind(job.invoice_id),
        ]);
      } else {
        await markUnknown(env, job.invoice_id, error);
      }
    }
    processed++;
  }
  return { processed, configured: true };
}
