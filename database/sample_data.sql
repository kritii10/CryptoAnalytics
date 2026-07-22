INSERT INTO users (name, email, password_hash)
VALUES
('Demo User', 'demo@example.com', '$2b$10$asEOlc9PVeSI9Z4S9vug8.f8eQxM0fxTyZuxiiTHEv.tn937Gfu/W');

INSERT INTO coins (coingecko_id, symbol, name, current_price_usd)
VALUES
('bitcoin', 'BTC', 'Bitcoin', 65000),
('ethereum', 'ETH', 'Ethereum', 3200),
('solana', 'SOL', 'Solana', 145),
('cardano', 'ADA', 'Cardano', 0.45);

INSERT INTO transactions (user_id, coin_id, transaction_type, quantity, price_usd, total_usd, transaction_date)
VALUES
(1, 1, 'buy', 0.05000000, 42000, 2100, '2025-01-15'),
(1, 1, 'buy', 0.02000000, 50000, 1000, '2025-03-10'),
(1, 2, 'buy', 1.20000000, 2600, 3120, '2025-02-20'),
(1, 3, 'buy', 10.00000000, 95, 950, '2025-04-05'),
(1, 3, 'sell', 2.00000000, 130, 260, '2025-06-18'),
(1, 4, 'buy', 800.00000000, 0.38, 304, '2025-05-12');

INSERT INTO portfolio (user_id, coin_id, quantity, average_buy_price)
VALUES
(1, 1, 0.07000000, 44285.71428571),
(1, 2, 1.20000000, 2600),
(1, 3, 8.00000000, 95),
(1, 4, 800.00000000, 0.38);

INSERT INTO watchlist (user_id, coin_id)
VALUES
(1, 1),
(1, 2),
(1, 3);

INSERT INTO price_history (coin_id, price_date, price_usd)
VALUES
(1, '2025-01-01', 42000),
(1, '2025-02-01', 45000),
(1, '2025-03-01', 50000),
(1, '2025-04-01', 54000),
(1, '2025-05-01', 58000),
(1, '2025-06-01', 61000),
(1, '2025-07-01', 65000),
(2, '2025-01-01', 2400),
(2, '2025-02-01', 2600),
(2, '2025-03-01', 2750),
(2, '2025-04-01', 2900),
(2, '2025-05-01', 3050),
(2, '2025-06-01', 3150),
(2, '2025-07-01', 3200),
(3, '2025-01-01', 85),
(3, '2025-02-01', 92),
(3, '2025-03-01', 110),
(3, '2025-04-01', 125),
(3, '2025-05-01', 135),
(3, '2025-06-01', 140),
(3, '2025-07-01', 145),
(4, '2025-01-01', 0.34),
(4, '2025-02-01', 0.36),
(4, '2025-03-01', 0.39),
(4, '2025-04-01', 0.42),
(4, '2025-05-01', 0.44),
(4, '2025-06-01', 0.43),
(4, '2025-07-01', 0.45);
