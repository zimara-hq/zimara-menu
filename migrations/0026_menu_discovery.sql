ALTER TABLE items ADD COLUMN gallery_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE items ADD COLUMN dietary_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE items ADD COLUMN complementary_ids_json TEXT NOT NULL DEFAULT '[]';
CREATE TABLE menu_category_schedules (
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  days_json TEXT NOT NULL,
  start TEXT NOT NULL,
  end TEXT NOT NULL,
  PRIMARY KEY(branch_id,category_id)
);
CREATE INDEX menu_discovery_orders ON customer_orders(branch_id,org_id,status,created_at);
