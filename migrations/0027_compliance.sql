-- Saudi PDPL / e-commerce and App Store readiness.
-- Which terms and privacy version an owner accepted at sign-up, and when.
ALTER TABLE users ADD COLUMN terms_version TEXT;
ALTER TABLE users ADD COLUMN terms_accepted_at INTEGER;
-- Organisation erasure: a cancellable grace period, then automatic completion.
ALTER TABLE data_deletion_requests ADD COLUMN scheduled_for INTEGER;
ALTER TABLE data_deletion_requests ADD COLUMN completed_at INTEGER;
-- Existing review-only requests stay unscheduled: deployment is not fresh erasure consent.
ALTER TABLE data_deletion_requests ADD COLUMN execution_token TEXT;
-- Erased organisations keep only the rows the law requires (invoices, payments, audit).
ALTER TABLE orgs ADD COLUMN erased_at INTEGER;
