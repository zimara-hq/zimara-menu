-- Saudi PDPL / e-commerce and App Store readiness.
-- Which terms and privacy version an owner accepted at sign-up, and when.
ALTER TABLE users ADD COLUMN terms_version TEXT;
ALTER TABLE users ADD COLUMN terms_accepted_at INTEGER;
-- Organisation erasure: a cancellable grace period, then automatic completion.
ALTER TABLE data_deletion_requests ADD COLUMN scheduled_for INTEGER;
ALTER TABLE data_deletion_requests ADD COLUMN completed_at INTEGER;
UPDATE data_deletion_requests SET scheduled_for = created_at + 1209600000 WHERE scheduled_for IS NULL;
-- Erased organisations keep only the rows the law requires (invoices, payments, audit).
ALTER TABLE orgs ADD COLUMN erased_at INTEGER;
