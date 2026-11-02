-- Template sample items stay hidden from guests until the owner edits them.
ALTER TABLE items ADD COLUMN is_sample INTEGER NOT NULL DEFAULT 0 CHECK (is_sample IN (0,1));

-- Owner's own domain (Cloudflare for SaaS custom hostname). One per organisation.
CREATE TABLE org_domains (
  org_id TEXT PRIMARY KEY REFERENCES orgs(id),
  hostname TEXT NOT NULL UNIQUE,
  cf_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','failed')),
  ssl_status TEXT NOT NULL DEFAULT '',
  verify_json TEXT NOT NULL DEFAULT '[]',
  checked_at INTEGER,
  created_at INTEGER NOT NULL
);
