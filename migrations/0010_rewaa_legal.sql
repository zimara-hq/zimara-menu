-- Direct Rewaa polling connections. Credentials and tokens are AES-GCM encrypted with
-- POS_ENCRYPTION_KEY and bound to the connection id; list APIs never return them.
CREATE TABLE rewaa_connections (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  branch_id TEXT NOT NULL REFERENCES branches(id),
  label TEXT NOT NULL,
  location_id TEXT NOT NULL,
  credentials_ciphertext TEXT NOT NULL,
  token_ciphertext TEXT,
  token_expires_at INTEGER,
  since INTEGER NOT NULL,
  last_polled_at INTEGER NOT NULL DEFAULT 0,
  last_ok_at INTEGER,
  last_error TEXT,
  imported INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE INDEX rewaa_connections_poll ON rewaa_connections(active, last_polled_at);
CREATE UNIQUE INDEX rewaa_connections_branch ON rewaa_connections(branch_id) WHERE active = 1;

-- One pager ticket per Rewaa sale invoice, ever.
CREATE TABLE rewaa_invoices (
  connection_id TEXT NOT NULL REFERENCES rewaa_connections(id),
  invoice_id TEXT NOT NULL,
  ticket_id TEXT REFERENCES tickets(id),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (connection_id, invoice_id)
);

-- Platform legal identity (ZIMARA as seller), editable by admins, shown on legal pages and receipts.
CREATE TABLE platform_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_by TEXT,
  updated_at INTEGER NOT NULL
);

-- Subscriber billing identity for B2B invoices, and billing-email bookkeeping.
ALTER TABLE orgs ADD COLUMN billing_legal_name TEXT;
ALTER TABLE orgs ADD COLUMN billing_vat_number TEXT;
ALTER TABLE orgs ADD COLUMN billing_cr_number TEXT;
ALTER TABLE orgs ADD COLUMN billing_address TEXT;
CREATE TABLE billing_notices (
  org_id TEXT NOT NULL REFERENCES orgs(id),
  kind TEXT NOT NULL,
  period_end INTEGER NOT NULL,
  sent_at INTEGER NOT NULL,
  PRIMARY KEY (org_id, kind, period_end)
);
