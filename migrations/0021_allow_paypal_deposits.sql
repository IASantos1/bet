-- Migration: Allow PayPal in Deposits and add provider_entity
PRAGMA foreign_keys=OFF;

CREATE TABLE deposits_new (
    id TEXT PRIMARY KEY, -- UUID
    user_id TEXT NOT NULL,
    amount_eur REAL NOT NULL,
    method TEXT CHECK (method IN ('MBWAY', 'MULTIBANCO', 'PAYPAL')),
    status TEXT CHECK (status IN ('PENDING', 'PAID', 'FAILED')),
    provider_ref TEXT,
    provider_entity TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES user(id)
);

INSERT INTO deposits_new (id, user_id, amount_eur, method, status, provider_ref, created_at)
SELECT id, user_id, amount_eur, method, status, provider_ref, created_at FROM deposits;

DROP TABLE deposits;

ALTER TABLE deposits_new RENAME TO deposits;

CREATE INDEX idx_deposits_user_id ON deposits(user_id);
CREATE INDEX idx_deposits_status ON deposits(status);

PRAGMA foreign_keys=ON;
