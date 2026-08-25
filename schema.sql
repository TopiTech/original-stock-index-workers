CREATE TABLE IF NOT EXISTS indices (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    base_value REAL DEFAULT 1000,
    sort_order INTEGER DEFAULT 99
);

CREATE TABLE IF NOT EXISTS basket_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    index_id TEXT NOT NULL,
    ticker TEXT NOT NULL,
    name TEXT NOT NULL,
    weight REAL NOT NULL,
    theme TEXT,
    FOREIGN KEY (index_id) REFERENCES indices (id) ON DELETE CASCADE,
    UNIQUE(index_id, ticker)
);

CREATE TABLE IF NOT EXISTS stock_prices (
    ticker TEXT NOT NULL,
    date TEXT NOT NULL,
    price REAL NOT NULL,
    PRIMARY KEY (ticker, date)
);

CREATE TABLE IF NOT EXISTS sync_logs (
    ticker TEXT PRIMARY KEY,
    last_synced_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS snapshot_cache (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    data TEXT NOT NULL,
    cached_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS rate_limits (
    ip TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    request_count INTEGER DEFAULT 1,
    window_start INTEGER NOT NULL,
    PRIMARY KEY (ip, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_stock_prices_ticker ON stock_prices(ticker);
CREATE INDEX IF NOT EXISTS idx_basket_items_index_id ON basket_items(index_id);
