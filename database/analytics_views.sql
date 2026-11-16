-- Analytical SQL views (window functions, CTEs). Re-runnable: CREATE OR REPLACE.
--   psql -U <user> -d crypto_analytics -f database/analytics_views.sql
-- Depends on: analytics_schema.sql and data loaded by analytics/etl/ingest.py

-- 1. Daily returns --------------------------------------------------------------
-- LAG() looks at the previous row *within each coin*, ordered by date.
CREATE OR REPLACE VIEW v_daily_returns AS
SELECT
    o.coin_id,
    c.symbol,
    o.price_date,
    o.close_usd,
    o.volume_usd,
    o.close_usd / LAG(o.close_usd) OVER w - 1        AS simple_return,
    LN(o.close_usd / LAG(o.close_usd) OVER w)        AS log_return
FROM price_ohlcv o
JOIN coins c ON c.id = o.coin_id
WINDOW w AS (PARTITION BY o.coin_id ORDER BY o.price_date);

-- 2. Moving averages and rolling volatility -------------------------------------
-- Rolling stats are NULL until a full window of observations exists.
CREATE OR REPLACE VIEW v_rolling_metrics AS
SELECT
    coin_id, symbol, price_date, close_usd, log_return,
    CASE WHEN COUNT(close_usd) OVER w7  = 7  THEN AVG(close_usd) OVER w7  END AS sma_7,
    CASE WHEN COUNT(close_usd) OVER w30 = 30 THEN AVG(close_usd) OVER w30 END AS sma_30,
    CASE WHEN COUNT(close_usd) OVER w90 = 90 THEN AVG(close_usd) OVER w90 END AS sma_90,
    -- annualised volatility: daily std-dev of log returns x sqrt(365) (crypto trades daily)
    CASE WHEN COUNT(log_return) OVER w30 = 30
         THEN STDDEV_SAMP(log_return) OVER w30 * SQRT(365) END               AS vol_30d_annualized
FROM v_daily_returns
WINDOW
    w7  AS (PARTITION BY coin_id ORDER BY price_date ROWS BETWEEN 6  PRECEDING AND CURRENT ROW),
    w30 AS (PARTITION BY coin_id ORDER BY price_date ROWS BETWEEN 29 PRECEDING AND CURRENT ROW),
    w90 AS (PARTITION BY coin_id ORDER BY price_date ROWS BETWEEN 89 PRECEDING AND CURRENT ROW);

-- 3. Drawdown from running peak ---------------------------------------------------
CREATE OR REPLACE VIEW v_drawdown AS
WITH peaks AS (
    SELECT
        o.coin_id, c.symbol, o.price_date, o.close_usd,
        MAX(o.close_usd) OVER (PARTITION BY o.coin_id ORDER BY o.price_date) AS running_peak
    FROM price_ohlcv o
    JOIN coins c ON c.id = o.coin_id
)
SELECT
    coin_id, symbol, price_date, close_usd, running_peak,
    close_usd / running_peak - 1 AS drawdown          -- 0 at a new high, -0.5 = 50% below peak
FROM peaks;

-- 4. Momentum ranking (latest day per coin) ---------------------------------------
CREATE OR REPLACE VIEW v_coin_momentum AS
WITH base AS (
    SELECT
        o.coin_id, c.symbol, o.price_date, o.close_usd,
        LAG(o.close_usd, 7)  OVER w AS close_7d_ago,
        LAG(o.close_usd, 30) OVER w AS close_30d_ago,
        LAG(o.close_usd, 90) OVER w AS close_90d_ago
    FROM price_ohlcv o
    JOIN coins c ON c.id = o.coin_id
    WINDOW w AS (PARTITION BY o.coin_id ORDER BY o.price_date)
),
latest AS (
    SELECT DISTINCT ON (coin_id) *
    FROM base
    ORDER BY coin_id, price_date DESC
)
SELECT
    symbol, price_date AS as_of, close_usd,
    close_usd / NULLIF(close_7d_ago, 0)  - 1 AS return_7d,
    close_usd / NULLIF(close_30d_ago, 0) - 1 AS return_30d,
    close_usd / NULLIF(close_90d_ago, 0) - 1 AS return_90d,
    RANK() OVER (ORDER BY close_usd / NULLIF(close_30d_ago, 0) DESC NULLS LAST) AS rank_30d
FROM latest;

-- 5. Day-of-week seasonality ------------------------------------------------------
CREATE OR REPLACE VIEW v_day_of_week_returns AS
SELECT
    symbol,
    EXTRACT(ISODOW FROM price_date)::INT AS iso_day_of_week,   -- 1 = Monday
    COUNT(log_return)                    AS observations,
    AVG(log_return)                      AS mean_log_return,
    STDDEV_SAMP(log_return)              AS std_log_return,
    AVG((log_return > 0)::INT)           AS share_of_up_days
FROM v_daily_returns
WHERE log_return IS NOT NULL
GROUP BY symbol, EXTRACT(ISODOW FROM price_date);

-- 6. Sentiment joined to returns --------------------------------------------------
CREATE OR REPLACE VIEW v_returns_with_sentiment AS
SELECT
    r.symbol, r.price_date, r.log_return,
    f.value AS fear_greed_value,
    f.classification AS fear_greed_class,
    LAG(f.value) OVER (PARTITION BY r.symbol ORDER BY r.price_date) AS fear_greed_prev_day
FROM v_daily_returns r
JOIN fear_greed_index f ON f.signal_date = r.price_date;

-- 7. Portfolio value over time, rebuilt from the transaction ledger ---------------
-- Quantity held on each day = running sum of buys minus sells (window SUM).
CREATE OR REPLACE VIEW v_position_daily AS
WITH user_coin AS (
    SELECT user_id, coin_id, MIN(transaction_date) AS first_transaction
    FROM transactions
    GROUP BY user_id, coin_id
),
daily_change AS (
    SELECT user_id, coin_id, transaction_date,
           SUM(CASE WHEN transaction_type = 'buy' THEN quantity ELSE -quantity END) AS qty_change
    FROM transactions
    GROUP BY user_id, coin_id, transaction_date
),
grid AS (
    SELECT uc.user_id, uc.coin_id, o.price_date, o.close_usd,
           COALESCE(dc.qty_change, 0) AS qty_change
    FROM user_coin uc
    JOIN price_ohlcv o
      ON o.coin_id = uc.coin_id AND o.price_date >= uc.first_transaction
    LEFT JOIN daily_change dc
      ON dc.user_id = uc.user_id AND dc.coin_id = uc.coin_id
     AND dc.transaction_date = o.price_date
)
SELECT
    g.user_id, g.coin_id, c.symbol, g.price_date, g.close_usd,
    SUM(g.qty_change) OVER (PARTITION BY g.user_id, g.coin_id ORDER BY g.price_date) AS quantity_held,
    g.close_usd * SUM(g.qty_change) OVER (PARTITION BY g.user_id, g.coin_id ORDER BY g.price_date) AS position_value_usd
FROM grid g
JOIN coins c ON c.id = g.coin_id;

CREATE OR REPLACE VIEW v_portfolio_daily_value AS
SELECT
    user_id, price_date,
    SUM(position_value_usd) AS portfolio_value_usd,
    COUNT(*) FILTER (WHERE quantity_held > 0) AS open_positions
FROM v_position_daily
GROUP BY user_id, price_date;
