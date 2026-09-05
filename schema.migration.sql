-- Migration: Add owner_token_hash and created_at to indices table
-- Run this if your D1 database was created with an earlier schema without these columns.
-- This is a one-time migration for legacy databases; do not run it after a fresh schema.sql deployment.
-- SQLite does not support IF NOT EXISTS in ALTER TABLE ADD COLUMN.
ALTER TABLE indices ADD COLUMN owner_token_hash TEXT;
ALTER TABLE indices ADD COLUMN created_at INTEGER;

-- Legacy releases stored issued passwords in plain text. Scrub those values
-- before enabling the password-management API on an existing database.
-- Keep the legacy column for compatibility with old schemas; application code
-- must never read from or write to it.
UPDATE access_passwords SET plain_password = NULL;

-- Migration: Add max_indices to access_passwords and creator_id to indices table
ALTER TABLE access_passwords ADD COLUMN max_indices INTEGER DEFAULT NULL;
ALTER TABLE indices ADD COLUMN creator_id TEXT;

