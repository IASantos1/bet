-- Migration: Create withdraw_requests table for Tier-1 Withdraw Flow
-- Date: 2025-12-28

CREATE TABLE IF NOT EXISTS withdraw_requests (
    id TEXT PRIMARY KEY, -- UUID
    wallet_id INTEGER NOT NULL,
    amount REAL NOT NULL CHECK (amount > 0),
    status TEXT NOT NULL CHECK (status IN ('requested', 'approved', 'processing', 'paid', 'rejected')),
    idempotency_key TEXT UNIQUE NOT NULL,
    requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    processed_at DATETIME,
    FOREIGN KEY (wallet_id) REFERENCES wallets(id)
);

CREATE INDEX IF NOT EXISTS idx_withdraw_requests_wallet_id ON withdraw_requests(wallet_id);
CREATE INDEX IF NOT EXISTS idx_withdraw_requests_status ON withdraw_requests(status);
