-- Additive: preserve tenant designs, existing staff access and public URLs.
ALTER TABLE org_designs ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
CREATE TABLE branch_permissions (
 branch_id TEXT PRIMARY KEY REFERENCES branches(id) ON DELETE CASCADE,
 permissions_json TEXT NOT NULL,
 updated_at INTEGER NOT NULL
);
