-- 0014_implement_ledger.sql
-- Tier-1 Wallet + Ledger Implementation
-- "Saldo NÃO é um campo editável. O saldo é a soma das transações confirmadas no ledger."

-- 1. Create strict ledger_transactions table (Append-Only)
CREATE TABLE IF NOT EXISTS ledger_transactions (
    id TEXT PRIMARY KEY, -- UUID
    wallet_id INTEGER NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('credit', 'debit', 'hold', 'release')),
    amount REAL NOT NULL CHECK (amount > 0),
    reference TEXT,
    status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'cancelled')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (wallet_id) REFERENCES wallets(id)
);

CREATE INDEX IF NOT EXISTS idx_ledger_wallet_id ON ledger_transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_ledger_reference ON ledger_transactions(reference);

-- 2. Clean up old tables if necessary (we keep them for now to avoid data loss during transition, or we could drop 'ledger_entries')
-- DROP TABLE IF EXISTS ledger_entries; -- Let's keep it safe and just not use it.

-- 3. Note: The 'wallets' table 'balance' column will now be treated as a cache/snapshot, NOT the source of truth.
