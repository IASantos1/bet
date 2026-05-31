-- Migration: Tier-1 Payment System Architecture
-- Includes Deposits, Withdrawals, Bank Accounts, and User Profile updates

-- 1. Update User Profile with Phone
-- Column already exists in 0002_consolidate_schema.sql, so we comment this out to avoid duplication error.
-- ALTER TABLE user_profile ADD COLUMN phone TEXT;

-- 2. Create Deposits Table
CREATE TABLE deposits (
    id TEXT PRIMARY KEY, -- UUID
    user_id TEXT NOT NULL,
    amount_eur REAL NOT NULL,
    method TEXT CHECK (method IN ('MBWAY', 'MULTIBANCO')),
    status TEXT CHECK (status IN ('PENDING', 'PAID', 'FAILED')),
    provider_ref TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES user(id)
);

CREATE INDEX idx_deposits_user_id ON deposits(user_id);
CREATE INDEX idx_deposits_status ON deposits(status);

-- 3. Create User Bank Accounts Table
CREATE TABLE user_bank_accounts (
    id TEXT PRIMARY KEY, -- UUID
    user_id TEXT UNIQUE NOT NULL, -- 1 utilizador = 1 IBAN ativo
    iban TEXT NOT NULL,
    holder_name TEXT NOT NULL,
    country TEXT,
    verified INTEGER DEFAULT 0, -- Boolean
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES user(id)
);

CREATE INDEX idx_bank_accounts_user_id ON user_bank_accounts(user_id);

-- 4. Create Withdrawals Table (Replacing old withdraw_requests if necessary, but creating new one 'withdrawals' as requested)
-- We keep 'withdraw_requests' if needed for legacy, but 'withdrawals' is the new standard.
CREATE TABLE withdrawals (
    id TEXT PRIMARY KEY, -- UUID
    user_id TEXT NOT NULL,
    amount_eur REAL NOT NULL,
    status TEXT CHECK (status IN ('REQUESTED', 'IBAN_REQUIRED', 'IBAN_PENDING_REVIEW', 'AUTHORIZED', 'SCHEDULED', 'PAID', 'REJECTED')),
    iban_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    processed_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES user(id),
    FOREIGN KEY (iban_id) REFERENCES user_bank_accounts(id)
);

CREATE INDEX idx_withdrawals_user_id ON withdrawals(user_id);
CREATE INDEX idx_withdrawals_status ON withdrawals(status);
