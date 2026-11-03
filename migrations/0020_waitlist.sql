-- Waitlist: guests join from a QR code, see their place and expected wait, and get
-- called on their phone. Staff can also add walk-ins.
CREATE TABLE waitlist_settings (
  branch_id TEXT PRIMARY KEY REFERENCES branches(id) ON DELETE CASCADE,
  active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0, 1)),
  minutes_per_party INTEGER NOT NULL DEFAULT 8 CHECK (minutes_per_party BETWEEN 1 AND 120),
  max_party INTEGER NOT NULL DEFAULT 12 CHECK (max_party BETWEEN 1 AND 50),
  updated_at INTEGER NOT NULL
);

-- status: waiting | called | seated | cancelled | no_show
CREATE TABLE waitlist (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  branch_id TEXT NOT NULL REFERENCES branches(id),
  number INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT,
  party INTEGER NOT NULL CHECK (party BETWEEN 1 AND 50),
  note TEXT,
  source TEXT NOT NULL DEFAULT 'guest' CHECK (source IN ('guest', 'staff')),
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'called', 'seated', 'cancelled', 'no_show')),
  called_at INTEGER,
  seen_at INTEGER,
  done_at INTEGER,
  alerts_sent INTEGER NOT NULL DEFAULT 0,
  last_alert_at INTEGER,
  created_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX waitlist_branch ON waitlist(branch_id, status, created_at);
-- One open number per branch, so two joins cannot take the same number.
CREATE UNIQUE INDEX waitlist_open_number ON waitlist(branch_id, number) WHERE status IN ('waiting', 'called');

CREATE TABLE waitlist_push (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL REFERENCES waitlist(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (entry_id, endpoint)
);
