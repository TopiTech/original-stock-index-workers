-- Indices Table
CREATE TABLE IF NOT EXISTS indices (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    base_value REAL DEFAULT 1000
);

-- Basket Items Table
CREATE TABLE IF NOT EXISTS basket_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    index_id TEXT NOT NULL,
    ticker TEXT NOT NULL,
    name TEXT NOT NULL,
    weight REAL NOT NULL,
    theme TEXT,
    FOREIGN KEY (index_id) REFERENCES indices (id) ON DELETE CASCADE
);

-- Stock Prices Cache Table
CREATE TABLE IF NOT EXISTS stock_prices (
    ticker TEXT NOT NULL,
    date TEXT NOT NULL,
    price REAL NOT NULL,
    PRIMARY KEY (ticker, date)
);

CREATE INDEX IF NOT EXISTS idx_stock_prices_ticker ON stock_prices(ticker);
CREATE INDEX IF NOT EXISTS idx_basket_items_index_id ON basket_items(index_id);
