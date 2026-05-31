-- Migration: Create locks table for concurrency control
-- Date: 2025-12-28

CREATE TABLE IF NOT EXISTS locks (
    key TEXT PRIMARY KEY,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
