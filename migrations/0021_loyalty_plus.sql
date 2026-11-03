-- Loyalty depth: points as an alternative to stamps, the bill amount behind each
-- earn, guest segments, messages to card holders (one-off and automatic win-back).
ALTER TABLE loyalty_programs ADD COLUMN kind TEXT NOT NULL DEFAULT 'stamps' CHECK (kind IN ('stamps', 'points'));
ALTER TABLE loyalty_programs ADD COLUMN points_per_sar INTEGER NOT NULL DEFAULT 1 CHECK (points_per_sar BETWEEN 1 AND 100);
ALTER TABLE loyalty_programs ADD COLUMN reward_points INTEGER NOT NULL DEFAULT 100 CHECK (reward_points BETWEEN 10 AND 100000);
-- Win-back: guests away this many days get the message once (0 = off).
ALTER TABLE loyalty_programs ADD COLUMN winback_days INTEGER NOT NULL DEFAULT 0 CHECK (winback_days BETWEEN 0 AND 365);
ALTER TABLE loyalty_programs ADD COLUMN winback_ar TEXT;
ALTER TABLE loyalty_programs ADD COLUMN winback_en TEXT;
ALTER TABLE loyalty_ledger ADD COLUMN amount INTEGER;
ALTER TABLE loyalty_cards ADD COLUMN winback_at INTEGER;

CREATE TABLE card_push (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES loyalty_cards(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (card_id, endpoint)
);

-- segment: all | vip | regular | new | at_risk | dormant | winback (automatic)
CREATE TABLE loyalty_messages (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  segment TEXT NOT NULL,
  title_ar TEXT NOT NULL,
  title_en TEXT NOT NULL,
  body_ar TEXT NOT NULL,
  body_en TEXT NOT NULL,
  recipients INTEGER NOT NULL DEFAULT 0,
  sent INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX loyalty_messages_org ON loyalty_messages(org_id, created_at);

-- Which card got which message, so the card page and its notification show the right one.
CREATE TABLE card_inbox (
  card_id TEXT NOT NULL REFERENCES loyalty_cards(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL REFERENCES loyalty_messages(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (card_id, message_id)
);
CREATE INDEX card_inbox_card ON card_inbox(card_id, created_at);
