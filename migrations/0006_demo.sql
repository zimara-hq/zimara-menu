-- Public demonstrations have isolated synthetic tenants and bounded lifetimes.
CREATE TABLE demo_rooms (
 id TEXT PRIMARY KEY,
 token_hash TEXT NOT NULL UNIQUE,
 org_id TEXT NOT NULL UNIQUE REFERENCES orgs(id),
 branch_id TEXT NOT NULL REFERENCES branches(id),
 owner_id TEXT NOT NULL REFERENCES users(id),
 cashier_id TEXT NOT NULL REFERENCES users(id),
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL
);
CREATE INDEX demo_room_expiry ON demo_rooms(expires_at);
