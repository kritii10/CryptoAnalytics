# Data dictionary

All prices are in USD terms (Binance prices are quoted in USDT, used as a USD proxy). Dates are UTC calendar days.

## Tables added by `database/analytics_schema.sql`

### `price_ohlcv` - one row per coin per day
| Column | Type | Description |
|---|---|---|
| `coin_id` | int | FK to `coins.id` |
| `price_date` | date | UTC day the candle covers (unique per coin) |
| `open_usd`, `high_usd`, `low_usd`, `close_usd` | numeric | Candle prices; all must be > 0 |
| `volume_usd` | numeric | Quote-asset (USDT) volume traded that day |
| `source` | text | `binance` for real data, `synthetic` for generated test data |

### `fear_greed_index` - one row per day
| Column | Type | Description |
|---|---|---|
| `signal_date` | date | Primary key |
| `value` | int | 0 (extreme fear) to 100 (extreme greed), from alternative.me |
| `classification` | text | Extreme Fear / Fear / Neutral / Greed / Extreme Greed |

## Views from `database/analytics_views.sql`

| View | Grain | What it gives you | SQL techniques |
|---|---|---|---|
| `v_daily_returns` | coin x day | `simple_return`, `log_return` (NULL on each coin's first day) | `LAG` over `PARTITION BY` |
| `v_rolling_metrics` | coin x day | 7/30/90-day SMA, 30-day annualised volatility (NULL until the window is full) | named windows, `ROWS BETWEEN`, `STDDEV_SAMP` |
| `v_drawdown` | coin x day | `running_peak`, `drawdown` (0 at a new high, -0.5 = 50% below peak) | running `MAX` window |
| `v_coin_momentum` | coin (latest day) | 7/30/90-day returns and 30-day rank | CTEs, `DISTINCT ON`, `RANK` |
| `v_day_of_week_returns` | coin x weekday | mean/std of log return and share of up days | `EXTRACT(ISODOW)`, aggregation |
| `v_returns_with_sentiment` | coin x day | returns joined to Fear & Greed | join + `LAG` |
| `v_position_daily` | user x coin x day | `quantity_held` and `position_value_usd` rebuilt from `transactions` | cumulative `SUM` window |
| `v_portfolio_daily_value` | user x day | total portfolio value and open positions | aggregation over the view above |

## Existing tables touched by the ingest script
* `coins` - new coins are inserted (matched on `coingecko_id`); `current_price_usd` is set to the latest close when loading real data.
* `price_history` - the daily close is upserted so the app's Forecast page sees the longer history.

## Reports
`analytics/reports/data_quality.json` is written by every ingest run (errors and warnings per coin).
