-- Design engine: each organisation has a draft and a published design recipe,
-- named and automatic snapshots, and scheduled designs (Ramadan, Eid, National Day).
CREATE TABLE org_designs (
  org_id TEXT PRIMARY KEY REFERENCES orgs(id),
  draft_json TEXT NOT NULL,
  published_json TEXT,
  preset_id TEXT,
  updated_at INTEGER NOT NULL,
  published_at INTEGER
);

CREATE TABLE design_versions (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  name TEXT NOT NULL,
  recipe_json TEXT NOT NULL,
  auto INTEGER NOT NULL DEFAULT 0 CHECK (auto IN (0,1)),
  created_at INTEGER NOT NULL
);
CREATE INDEX design_versions_org ON design_versions(org_id, created_at);

CREATE TABLE design_schedules (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  version_id TEXT NOT NULL REFERENCES design_versions(id) ON DELETE CASCADE,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  CHECK (ends_at > starts_at)
);
CREATE INDEX design_schedules_org ON design_schedules(org_id, starts_at);
