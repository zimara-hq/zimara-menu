-- Runtime integration records are tenant scoped. Secrets are encrypted, never returned by list APIs.
CREATE TABLE pos_connections (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  branch_id TEXT NOT NULL REFERENCES branches(id),
  provider TEXT NOT NULL CHECK (provider = 'generic_bridge'),
  label TEXT NOT NULL,
  secret_ciphertext TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE INDEX pos_connections_org ON pos_connections(org_id, created_at);

CREATE TABLE pos_orders (
  connection_id TEXT NOT NULL REFERENCES pos_connections(id),
  external_order_id TEXT NOT NULL,
  ticket_id TEXT NOT NULL REFERENCES tickets(id),
  PRIMARY KEY (connection_id, external_order_id)
);

CREATE TABLE pos_events (
  connection_id TEXT NOT NULL REFERENCES pos_connections(id),
  event_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  event_type TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  PRIMARY KEY (connection_id, event_id)
);

-- Only authoritative billing-provider results may populate these records.
-- No test invoice or payment is seeded by the application.
CREATE TABLE subscription_invoices (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  provider TEXT NOT NULL,
  provider_reference TEXT NOT NULL,
  number TEXT,
  state TEXT NOT NULL CHECK (state IN ('pending', 'issued', 'rejected', 'voided')),
  currency TEXT NOT NULL DEFAULT 'SAR' CHECK (currency = 'SAR'),
  subtotal INTEGER NOT NULL CHECK (subtotal >= 0),
  vat INTEGER NOT NULL CHECK (vat >= 0),
  total INTEGER NOT NULL CHECK (total = subtotal + vat),
  pdf_url TEXT,
  issued_at INTEGER,
  created_at INTEGER NOT NULL,
  UNIQUE (provider, provider_reference)
);
CREATE INDEX subscription_invoices_org ON subscription_invoices(org_id, created_at);
