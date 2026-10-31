-- Fallback storage for uploaded logos, item photos and fonts when no R2 bucket is bound.
-- Each row holds one file's bytes; the metadata stays in tenant_assets (quota triggers apply).
CREATE TABLE IF NOT EXISTS tenant_asset_blobs (
  asset_id TEXT PRIMARY KEY REFERENCES tenant_assets(id) ON DELETE CASCADE,
  data BLOB NOT NULL
);
