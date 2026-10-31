-- Hosted checkout sessions. A row becomes 'paid' only after the provider API confirms it
-- server-to-server; a browser redirect or an unverified webhook body never activates a plan.
CREATE TABLE billing_checkouts (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  plan TEXT NOT NULL CHECK (plan IN ('pager','basic','pro')),
  cycle TEXT NOT NULL CHECK (cycle IN ('monthly','annual')),
  provider TEXT NOT NULL,
  provider_invoice_id TEXT,
  subtotal INTEGER NOT NULL CHECK (subtotal > 0),
  vat INTEGER NOT NULL CHECK (vat >= 0),
  total INTEGER NOT NULL CHECK (total = subtotal + vat),
  status TEXT NOT NULL CHECK (status IN ('pending','paid','failed','expired')),
  created_by TEXT REFERENCES users(id),
  created_at INTEGER NOT NULL,
  paid_at INTEGER,
  UNIQUE (provider, provider_invoice_id)
);
CREATE INDEX billing_checkouts_org ON billing_checkouts(org_id, created_at);

-- Single-use, hashed, short-lived tokens for email verification and password reset.
CREATE TABLE email_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  purpose TEXT NOT NULL CHECK (purpose IN ('verify','reset')),
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX email_tokens_user ON email_tokens(user_id, purpose);
