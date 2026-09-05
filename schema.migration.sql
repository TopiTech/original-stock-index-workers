-- Migration: Add owner_token_hash and created_at to indices table
-- Run this if your D1 database was created with an earlier schema without these columns.
-- SQLite does not support IF NOT EXISTS in ALTER TABLE ADD COLUMN.
ALTER TABLE indices ADD COLUMN owner_token_hash TEXT;
ALTER TABLE indices ADD COLUMN created_at INTEGER;
