-- Additive schema for the analytics module.
-- Safe to run on top of schema.sql: it never drops or alters existing tables.
--   psql -U <user> -d crypto_analytics -f database/analytics_schema.sql

-- Daily OHLCV candles (richer than price_history, which only stores a close).
CREATE TABLE IF NOT EXISTS price_ohlcv (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    coin_id INT NOT NULL REFERENCES coins(id) ON DELETE CASCADE,
    price_date DATE NOT NULL,
    open_usd NUMERIC(24, 8) NOT NULL CHECK (open_usd > 0),
    high_usd NUMERIC(24, 8) NOT NULL CHECK (high_usd > 0),
    low_usd NUMERIC(24, 8) NOT NULL CHECK (low_usd > 0),
    close_usd NUMERIC(24, 8) NOT NULL CHECK (close_usd > 0),
    volume_usd NUMERIC(30, 8) NOT NULL DEFAULT 0 CHECK (volume_usd >= 0),
    -- 'binance' = real data, 'synthetic' = generated for tests/demos only
    source VARCHAR(30) NOT NULL DEFAULT 'binance',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (coin_id, price_date)
);

CREATE INDEX IF NOT EXISTS idx_price_ohlcv_coin_date ON price_ohlcv(coin_id, price_date);

-- Crypto Fear & Greed Index (0 = extreme fear, 100 = extreme greed).
CREATE TABLE IF NOT EXISTS fear_greed_index (
    signal_date DATE PRIMARY KEY,
    value INT NOT NULL CHECK (value BETWEEN 0 AND 100),
    classification VARCHAR(30) NOT NULL
);
