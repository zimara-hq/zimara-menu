CREATE TABLE automation_deliveries (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  dedupe_key TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','delivering','delivered','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL,
  lease_token TEXT,
  lease_expires_at INTEGER,
  last_status INTEGER,
  created_at INTEGER NOT NULL,
  delivered_at INTEGER,
  UNIQUE(org_id,dedupe_key)
);
CREATE INDEX automation_deliveries_due ON automation_deliveries(status,next_attempt_at);
