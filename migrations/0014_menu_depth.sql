-- Menu depth (competitor parity batch 1): before-discount price, allergens,
-- caffeine/sodium disclosure, size/extra option groups, and customer order notes.
ALTER TABLE items ADD COLUMN compare_price INTEGER CHECK (compare_price IS NULL OR compare_price >= 0);
ALTER TABLE items ADD COLUMN allergens TEXT NOT NULL DEFAULT '[]';
ALTER TABLE items ADD COLUMN caffeine_mg INTEGER CHECK (caffeine_mg IS NULL OR caffeine_mg >= 0);
ALTER TABLE items ADD COLUMN sodium_mg INTEGER CHECK (sodium_mg IS NULL OR sodium_mg >= 0);
ALTER TABLE items ADD COLUMN options_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE customer_orders ADD COLUMN note TEXT;
