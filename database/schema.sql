DROP TABLE IF EXISTS price_history;
DROP TABLE IF EXISTS watchlist;
DROP TABLE IF EXISTS portfolio;
DROP TABLE IF EXISTS transactions;
DROP TABLE IF EXISTS coins;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE coins (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    coingecko_id VARCHAR(100) NOT NULL UNIQUE,
    symbol VARCHAR(20) NOT NULL,
    name VARCHAR(100) NOT NULL,
    current_price_usd NUMERIC(18, 8) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE transactions (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    coin_id INT NOT NULL REFERENCES coins(id) ON DELETE CASCADE,
    transaction_type VARCHAR(10) NOT NULL CHECK (transaction_type IN ('buy', 'sell')),
    quantity NUMERIC(18, 8) NOT NULL CHECK (quantity > 0),
    price_usd NUMERIC(18, 8) NOT NULL CHECK (price_usd >= 0),
    total_usd NUMERIC(18, 2) NOT NULL CHECK (total_usd >= 0),
    transaction_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- portfolio stores the latest holding summary for each user and coin.
CREATE TABLE portfolio (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    coin_id INT NOT NULL REFERENCES coins(id) ON DELETE CASCADE,
    quantity NUMERIC(18, 8) NOT NULL DEFAULT 0,
    average_buy_price NUMERIC(18, 8) NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, coin_id)
);

CREATE TABLE watchlist (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    coin_id INT NOT NULL REFERENCES coins(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, coin_id)
);

-- price_history keeps one daily price per coin for analytics and forecasting.
CREATE TABLE price_history (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    coin_id INT NOT NULL REFERENCES coins(id) ON DELETE CASCADE,
    price_date DATE NOT NULL,
    price_usd NUMERIC(18, 8) NOT NULL CHECK (price_usd >= 0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (coin_id, price_date)
);

CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_coin_id ON transactions(coin_id);
CREATE INDEX idx_portfolio_user_id ON portfolio(user_id);
CREATE INDEX idx_watchlist_user_id ON watchlist(user_id);
CREATE INDEX idx_price_history_coin_date ON price_history(coin_id, price_date);
