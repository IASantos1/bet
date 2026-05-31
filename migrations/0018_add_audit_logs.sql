-- Migration number: 0018 	 2024-05-24T12:00:00.000Z
-- Audit Logs Table (Tier-1 Compliance)

CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY, -- UUID
    actor_type TEXT CHECK (actor_type IN ('user', 'system', 'admin')),
    actor_id TEXT, -- UUID of user/admin
    action TEXT NOT NULL, -- e.g. LOGIN_FAILED, DEPOSIT, KYC_VERIFIED
    entity TEXT NOT NULL, -- e.g. user, wallet, kyc_profile
    entity_id TEXT, -- UUID of the entity
    before_state TEXT, -- JSON string
    after_state TEXT, -- JSON string
    ip_address TEXT,
    user_agent TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Trigger to prevent updates (Tier-1 Immutability)
-- SQLite/D1 supports triggers.
CREATE TRIGGER IF NOT EXISTS prevent_audit_update
BEFORE UPDATE ON audit_logs
BEGIN
    SELECT RAISE(ABORT, 'Audit logs are immutable');
END;

CREATE TRIGGER IF NOT EXISTS prevent_audit_delete
BEFORE DELETE ON audit_logs
BEGIN
    SELECT RAISE(ABORT, 'Audit logs are immutable');
END;
