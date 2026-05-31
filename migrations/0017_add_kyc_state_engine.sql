-- Migration: Add KYC State Engine Tables

-- 1. KYC Profiles (State Machine)
CREATE TABLE IF NOT EXISTS kyc_profiles (
    id TEXT PRIMARY KEY, -- UUID
    user_id TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL CHECK (status IN ('unverified', 'pending', 'verified', 'rejected', 'suspended', 'closed')) DEFAULT 'unverified',
    risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high')) DEFAULT 'low',
    verified_at INTEGER, -- Timestamp
    rejection_reason TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (user_id) REFERENCES user(id)
);

-- 2. KYC Documents (Linked to Profile)
CREATE TABLE IF NOT EXISTS kyc_documents (
    id TEXT PRIMARY KEY, -- UUID
    kyc_profile_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('id_document', 'selfie', 'address_proof')),
    file_path TEXT, -- Path or URL to storage
    status TEXT NOT NULL CHECK (status IN ('uploaded', 'approved', 'rejected')) DEFAULT 'uploaded',
    uploaded_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (kyc_profile_id) REFERENCES kyc_profiles(id)
);

-- 3. KYC Audit Logs
CREATE TABLE IF NOT EXISTS kyc_audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kyc_profile_id TEXT NOT NULL,
    admin_id TEXT, -- ID of operator who made the decision
    action TEXT NOT NULL, -- e.g., 'approve', 'reject', 'suspend'
    reason TEXT,
    previous_status TEXT,
    new_status TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (kyc_profile_id) REFERENCES kyc_profiles(id)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_kyc_profiles_user_id ON kyc_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_kyc_profiles_status ON kyc_profiles(status);
CREATE INDEX IF NOT EXISTS idx_kyc_documents_profile_id ON kyc_documents(kyc_profile_id);
