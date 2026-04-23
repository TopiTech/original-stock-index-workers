-- Drop existing tables (development: clean slate on each migrate)
DROP TABLE IF EXISTS rate_limits;
DROP TABLE IF EXISTS snapshot_cache;
DROP TABLE IF EXISTS sync_logs;
DROP TABLE IF EXISTS stock_prices;
DROP TABLE IF EXISTS basket_items;
DROP TABLE IF EXISTS indices;

-- Indices Table
CREATE TABLE indices (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    base_value REAL DEFAULT 1000,
    sort_order INTEGER DEFAULT 99
);

-- Basket Items Table
CREATE TABLE basket_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    index_id TEXT NOT NULL,
    ticker TEXT NOT NULL,
    name TEXT NOT NULL,
    weight REAL NOT NULL,
    theme TEXT,
    FOREIGN KEY (index_id) REFERENCES indices (id) ON DELETE CASCADE,
    UNIQUE(index_id, ticker)
);

-- Stock Prices Cache Table
-- NOTE: date format is YYYY-MM-DD (year-aware, sortable across year boundaries)
CREATE TABLE stock_prices (
    ticker TEXT NOT NULL,
    date TEXT NOT NULL,
    price REAL NOT NULL,
    PRIMARY KEY (ticker, date)
);

-- Sync Logs Table
CREATE TABLE sync_logs (
    ticker TEXT PRIMARY KEY,
    last_synced_at INTEGER NOT NULL -- Unix timestamp
);

-- Snapshot Cache Table (singleton for Nikkei 225 snapshot)
CREATE TABLE snapshot_cache (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    data TEXT NOT NULL,
    cached_at INTEGER NOT NULL
);

-- Rate Limits Table (per-IP request tracking)
CREATE TABLE rate_limits (
    ip TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    request_count INTEGER DEFAULT 1,
    window_start INTEGER NOT NULL,
    PRIMARY KEY (ip, endpoint)
);

CREATE INDEX idx_stock_prices_ticker ON stock_prices(ticker);
CREATE INDEX idx_basket_items_index_id ON basket_items(index_id);
