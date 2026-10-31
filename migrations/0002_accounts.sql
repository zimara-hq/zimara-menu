-- Additive account and subscription foundation. No existing accounts are reset.
ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN mfa_secret TEXT;
ALTER TABLE users ADD COLUMN mfa_pending TEXT;
ALTER TABLE users ADD COLUMN mfa_last_counter INTEGER NOT NULL DEFAULT -1;
ALTER TABLE sessions ADD COLUMN mfa_verified INTEGER NOT NULL DEFAULT 0;
CREATE TABLE subscriptions (
 org_id TEXT PRIMARY KEY REFERENCES orgs(id),
 plan TEXT NOT NULL CHECK(plan IN ('pager','basic','pro','chains')),
 status TEXT NOT NULL CHECK(status IN ('trial','active','past_due','suspended','cancelled')),
 trial_ends_at INTEGER,
 current_period_end INTEGER,
 cancel_at_period_end INTEGER NOT NULL DEFAULT 0 CHECK(cancel_at_period_end IN(0,1)),
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE TABLE request_limits (key TEXT PRIMARY KEY,count INTEGER NOT NULL,window_start INTEGER NOT NULL);
CREATE TABLE mfa_recovery_codes (user_id TEXT NOT NULL REFERENCES users(id), code_hash TEXT NOT NULL,PRIMARY KEY(user_id,code_hash));
-- SQLite constraints protect limits even when requests race across Worker instances.
CREATE TRIGGER subscription_branch_quota BEFORE INSERT ON branches
WHEN EXISTS (SELECT 1 FROM subscriptions s WHERE s.org_id=NEW.org_id AND
 (SELECT COUNT(*) FROM branches b WHERE b.org_id=NEW.org_id) >=
 CASE s.plan WHEN 'pager' THEN 1 WHEN 'basic' THEN 1 WHEN 'pro' THEN 3 ELSE 100 END)
BEGIN SELECT RAISE(ABORT,'plan_branches_limit'); END;
CREATE TRIGGER subscription_item_quota BEFORE INSERT ON items
WHEN EXISTS (SELECT 1 FROM subscriptions s WHERE s.org_id=NEW.org_id AND
 (SELECT COUNT(*) FROM items i WHERE i.org_id=NEW.org_id) >=
 CASE s.plan WHEN 'pager' THEN 0 WHEN 'basic' THEN 500 WHEN 'pro' THEN 5000 ELSE 50000 END)
BEGIN SELECT RAISE(ABORT,'plan_items_limit'); END;
