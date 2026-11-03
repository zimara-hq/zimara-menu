-- Ordering depth: order types (dine-in with table, pickup, delivery, curbside),
-- WhatsApp ordering, delivery fee and minimum, and coupons.
CREATE TABLE branch_ordering (
  branch_id TEXT PRIMARY KEY REFERENCES branches(id),
  types_json TEXT NOT NULL DEFAULT '["pickup"]',
  tables INTEGER NOT NULL DEFAULT 0 CHECK (tables BETWEEN 0 AND 500),
  whatsapp TEXT,
  delivery_fee INTEGER NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
  delivery_min INTEGER NOT NULL DEFAULT 0 CHECK (delivery_min >= 0),
  updated_at INTEGER NOT NULL
);

CREATE TABLE coupons (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  code TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('percent','amount')),
  value INTEGER NOT NULL CHECK (value > 0),
  min_total INTEGER NOT NULL DEFAULT 0 CHECK (min_total >= 0),
  max_uses INTEGER CHECK (max_uses IS NULL OR max_uses > 0),
  used INTEGER NOT NULL DEFAULT 0,
  starts_at INTEGER,
  ends_at INTEGER,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at INTEGER NOT NULL,
  UNIQUE (org_id, code)
);

ALTER TABLE customer_orders ADD COLUMN order_type TEXT NOT NULL DEFAULT 'pickup';
ALTER TABLE customer_orders ADD COLUMN details_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE customer_orders ADD COLUMN subtotal INTEGER;
ALTER TABLE customer_orders ADD COLUMN discount INTEGER NOT NULL DEFAULT 0;
ALTER TABLE customer_orders ADD COLUMN delivery_fee INTEGER NOT NULL DEFAULT 0;
ALTER TABLE customer_orders ADD COLUMN coupon_code TEXT;
