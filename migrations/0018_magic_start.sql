-- Magic start: item badges (new, popular, spicy...) and a log of AI menu
-- imports so each organisation has a fair daily limit.
ALTER TABLE items ADD COLUMN badges TEXT NOT NULL DEFAULT '[]';

CREATE TABLE ai_imports (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  kind TEXT NOT NULL CHECK (kind IN ('image','pdf','text','link')),
  item_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX ai_imports_org ON ai_imports(org_id, created_at);
