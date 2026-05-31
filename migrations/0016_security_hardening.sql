-- Security Hardening Tables

-- Refresh Tokens
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires_at DATETIME NOT NULL,
    revoked INTEGER DEFAULT 0, -- Boolean
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES user(id)
);

-- Login Audit
CREATE TABLE IF NOT EXISTS login_audit (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    ip TEXT,
    user_agent TEXT,
    success INTEGER, -- Boolean
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- User Extensions (SQLite doesn't support multiple ADD COLUMN in one statement properly in all versions, so separate them)
-- Check if columns exist before adding (using separate statements which D1 handles sequentially)
ALTER TABLE user ADD COLUMN twofa_enabled INTEGER DEFAULT 0;
ALTER TABLE user ADD COLUMN twofa_secret TEXT;
ALTER TABLE user ADD COLUMN failed_attempts INTEGER DEFAULT 0;
ALTER TABLE user ADD COLUMN locked_until DATETIME;
