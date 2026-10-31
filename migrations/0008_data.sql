-- Privacy controls preserve the append-only, non-identifying loyalty ledger.
ALTER TABLE loyalty_cards ADD COLUMN revoked_at INTEGER;
CREATE TABLE revoked_card_tokens (
  token_hash TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES loyalty_cards(id),
  org_id TEXT NOT NULL REFERENCES orgs(id),
  revoked_at INTEGER NOT NULL
);
CREATE TABLE data_deletion_requests (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  requested_by TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','cancelled','completed')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX one_pending_data_deletion ON data_deletion_requests(org_id)
  WHERE status = 'pending';
CREATE INDEX data_deletion_org ON data_deletion_requests(org_id, created_at);
