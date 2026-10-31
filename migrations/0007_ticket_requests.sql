-- Cashier retries reuse their original ticket without mixing invoice and pager IDs.
CREATE TABLE cashier_ticket_requests (
 branch_id TEXT NOT NULL REFERENCES branches(id),
 idem_key TEXT NOT NULL,
 fingerprint TEXT NOT NULL,
 ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
 created_at INTEGER NOT NULL,
 PRIMARY KEY (branch_id, idem_key)
);
