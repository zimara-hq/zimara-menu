-- Add-on store: one row per installed add-on, with its validated settings.
CREATE TABLE org_addons (
  org_id TEXT NOT NULL REFERENCES orgs(id),
  addon TEXT NOT NULL,
  config_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (org_id, addon)
);

-- Telegram chats that receive an organisation's notifications. branch_id NULL means all branches.
CREATE TABLE telegram_links (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  branch_id TEXT REFERENCES branches(id),
  chat_id TEXT NOT NULL,
  chat_title TEXT NOT NULL DEFAULT '',
  events_json TEXT NOT NULL DEFAULT '["orders"]',
  created_at INTEGER NOT NULL,
  UNIQUE (org_id, chat_id)
);
CREATE INDEX telegram_links_org ON telegram_links(org_id);

-- One-time link codes, valid for 30 minutes.
CREATE TABLE telegram_codes (
  code TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  branch_id TEXT REFERENCES branches(id),
  events_json TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
