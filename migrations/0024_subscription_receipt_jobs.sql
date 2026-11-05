-- Durable payment confirmation emails. No receipt is enqueued without paid activation.
-- Recipient, name, paid period and link snapshots keep retries identical for provider idempotency.
CREATE TABLE subscription_receipt_jobs (
  checkout_id TEXT NOT NULL REFERENCES billing_checkouts(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  recipient_email TEXT NOT NULL,
  recipient_name TEXT NOT NULL,
  period_end INTEGER NOT NULL,
  dashboard_url TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','sending','sent','unknown')),
  attempts INTEGER NOT NULL DEFAULT 0,
  first_attempt_at INTEGER,
  sender TEXT,
  next_attempt_at INTEGER NOT NULL,
  locked_at INTEGER,
  provider_message_id TEXT,
  sent_at INTEGER,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (checkout_id, user_id)
);
CREATE INDEX subscription_receipt_jobs_due ON subscription_receipt_jobs(state, next_attempt_at);
