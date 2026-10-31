-- Additive tenant configuration and isolated, revocable front-display credentials.
CREATE TABLE org_profiles (
  org_id TEXT PRIMARY KEY REFERENCES orgs(id),
  sector TEXT NOT NULL DEFAULT 'cafe' CHECK (sector IN ('cafe','restaurant','clinic','bank','service')),
  description_ar TEXT NOT NULL DEFAULT '',
  description_en TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  social_json TEXT NOT NULL DEFAULT '[]',
  banners_json TEXT NOT NULL DEFAULT '[]',
  sections_json TEXT NOT NULL DEFAULT '["menu","branches","hours","social","loyalty"]',
  font_url TEXT,
  updated_at INTEGER NOT NULL
);
CREATE TABLE branch_settings (
  branch_id TEXT PRIMARY KEY REFERENCES branches(id),
  orders_enabled INTEGER NOT NULL DEFAULT 0 CHECK (orders_enabled IN (0,1)),
  address TEXT NOT NULL DEFAULT '',
  maps_url TEXT,
  hours_json TEXT NOT NULL DEFAULT '[]',
  game TEXT NOT NULL DEFAULT 'none' CHECK (game IN ('none','memory','beans')),
  updated_at INTEGER NOT NULL
);
CREATE TABLE display_devices (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  branch_id TEXT NOT NULL REFERENCES branches(id),
  token_hash TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER
);
CREATE INDEX display_devices_branch ON display_devices(branch_id, revoked_at);
ALTER TABLE tickets ADD COLUMN invoice_number TEXT;
CREATE TABLE customer_orders (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  branch_id TEXT NOT NULL REFERENCES branches(id),
  token TEXT NOT NULL UNIQUE,
  idem_key TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
  total INTEGER NOT NULL CHECK(total >= 0),
  items_json TEXT NOT NULL,
  ticket_id TEXT REFERENCES tickets(id),
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  UNIQUE (branch_id, idem_key)
);
CREATE INDEX customer_orders_branch ON customer_orders(branch_id, status, created_at);
CREATE TABLE tenant_assets (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  object_key TEXT NOT NULL UNIQUE,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('image','font')),
  created_at INTEGER NOT NULL
);
CREATE TABLE menu_imports (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  item_count INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
