-- ZIMARA Menu initial schema. Money in halalas (1 SAR = 100). Times are unix ms.

CREATE TABLE orgs (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  brand_color TEXT,
  logo_url TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE branches (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  slug TEXT NOT NULL UNIQUE,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  google_review_url TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE INDEX branches_org ON branches(org_id);

-- role: admin (platform, max 4, no org) | owner (manages one org) | branch (one per branch)
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'owner', 'branch')),
  org_id TEXT REFERENCES orgs(id),
  branch_id TEXT UNIQUE REFERENCES branches(id),
  password_hash TEXT NOT NULL,
  disabled INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  CHECK ((role = 'admin' AND org_id IS NULL AND branch_id IS NULL)
      OR (role = 'owner' AND org_id IS NOT NULL AND branch_id IS NULL)
      OR (role = 'branch' AND org_id IS NOT NULL AND branch_id IS NOT NULL))
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE login_attempts (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);

CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX categories_org ON categories(org_id, sort);

CREATE TABLE items (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  category_id TEXT NOT NULL REFERENCES categories(id),
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  desc_ar TEXT NOT NULL DEFAULT '',
  desc_en TEXT NOT NULL DEFAULT '',
  price INTEGER NOT NULL CHECK (price >= 0),
  calories INTEGER,
  image_url TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX items_org ON items(org_id, category_id, sort);

-- A branch can mark an item sold out without touching the org menu.
CREATE TABLE branch_unavailable (
  branch_id TEXT NOT NULL REFERENCES branches(id),
  item_id TEXT NOT NULL REFERENCES items(id),
  PRIMARY KEY (branch_id, item_id)
);

-- Pager tickets. status: preparing | ready | collected | cancelled
CREATE TABLE tickets (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  branch_id TEXT NOT NULL REFERENCES branches(id),
  number TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('preparing', 'ready', 'collected', 'cancelled')),
  linked_at INTEGER,
  ready_at INTEGER,
  seen_at INTEGER,
  collected_at INTEGER,
  alerts_sent INTEGER NOT NULL DEFAULT 0,
  last_alert_at INTEGER,
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  rating_comment TEXT,
  created_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX tickets_branch ON tickets(branch_id, status, created_at);
-- An open number is unique per branch so two cashiers cannot issue the same one.
CREATE UNIQUE INDEX tickets_open_number ON tickets(branch_id, number)
  WHERE status IN ('preparing', 'ready');

CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id),
  endpoint TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (ticket_id, endpoint)
);

CREATE TABLE loyalty_programs (
  org_id TEXT PRIMARY KEY REFERENCES orgs(id),
  stamps_required INTEGER NOT NULL DEFAULT 8 CHECK (stamps_required BETWEEN 2 AND 50),
  reward_ar TEXT NOT NULL DEFAULT 'مشروب مجاني',
  reward_en TEXT NOT NULL DEFAULT 'Free drink',
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE loyalty_cards (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  token TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (org_id, code)
);

-- Balance is SUM(delta). Rows are append-only; idem_key makes staff retries safe.
CREATE TABLE loyalty_ledger (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES loyalty_cards(id),
  branch_id TEXT REFERENCES branches(id),
  user_id TEXT REFERENCES users(id),
  kind TEXT NOT NULL CHECK (kind IN ('stamp', 'redeem', 'adjust')),
  delta INTEGER NOT NULL,
  balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
  idem_key TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
CREATE INDEX loyalty_ledger_card ON loyalty_ledger(card_id, created_at);

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  org_id TEXT,
  action TEXT NOT NULL,
  detail TEXT,
  created_at INTEGER NOT NULL
);
