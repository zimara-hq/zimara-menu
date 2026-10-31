-- Durable, idempotency-aware invoice issuance after authoritative subscription payment confirmation.
CREATE TABLE subscription_invoice_jobs (
  invoice_id TEXT PRIMARY KEY REFERENCES subscription_invoices(id) ON DELETE CASCADE,
  payment_reference TEXT NOT NULL UNIQUE,
  reference_number TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL CHECK (state IN ('pending','issuing','unknown','needs_details','rejected','issued')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL,
  locked_at INTEGER,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX subscription_invoice_jobs_state ON subscription_invoice_jobs(state, next_attempt_at, created_at);
