-- Idempotent bulk imports and a transactional per-tenant media ceiling.
ALTER TABLE menu_imports ADD COLUMN idem_key TEXT;
ALTER TABLE menu_imports ADD COLUMN fingerprint TEXT;
CREATE UNIQUE INDEX menu_import_idempotency ON menu_imports(org_id, idem_key);
CREATE TRIGGER tenant_asset_storage_quota BEFORE INSERT ON tenant_assets
WHEN (SELECT COUNT(*) FROM tenant_assets WHERE org_id=NEW.org_id)>=1000
 OR (SELECT COALESCE(SUM(size),0) FROM tenant_assets WHERE org_id=NEW.org_id)+NEW.size>100000000
BEGIN SELECT RAISE(ABORT,'asset_storage_limit'); END;
