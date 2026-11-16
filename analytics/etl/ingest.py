"""Load daily market data into PostgreSQL.

Examples (run from the repository root):
    python -m analytics.etl.ingest                          # 12 coins, 2022-01-01 -> yesterday
    python -m analytics.etl.ingest --start 2021-01-01 --coins BTC,ETH,SOL
    python -m analytics.etl.ingest --export-csv             # also write analytics/data/ohlcv.csv
    python -m analytics.etl.ingest --source synthetic       # fake data for demos/tests ONLY

Sources
    binance   Daily candles from Binance's public market-data API (no API key).
              Prices are against USDT, used here as a proxy for USD.
    Fear & Greed Index from alternative.me (also keyless).

The script is idempotent: re-running updates existing rows instead of duplicating.
It also upserts the daily close into price_history so the existing app/forecast
page benefits from the longer history.
"""
from __future__ import annotations

import argparse
import json
import time
from datetime import date, datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import requests
from psycopg2.extras import execute_values

from analytics.data import DEFAULT_CSV, get_connection
from analytics.etl.validate import clean_ohlcv, validate_ohlcv

# (coingecko_id, symbol, name) - coingecko_id matches coins.coingecko_id used by the app
COINS = [
    ("bitcoin", "BTC", "Bitcoin"),
    ("ethereum", "ETH", "Ethereum"),
    ("solana", "SOL", "Solana"),
    ("cardano", "ADA", "Cardano"),
    ("binancecoin", "BNB", "BNB"),
    ("ripple", "XRP", "XRP"),
    ("dogecoin", "DOGE", "Dogecoin"),
    ("avalanche-2", "AVAX", "Avalanche"),
    ("polkadot", "DOT", "Polkadot"),
    ("chainlink", "LINK", "Chainlink"),
    ("litecoin", "LTC", "Litecoin"),
    ("tron", "TRX", "TRON"),
]

BINANCE_URLS = ["https://data-api.binance.vision", "https://api.binance.com"]
FEAR_GREED_URL = "https://api.alternative.me/fng/"
DAY_MS = 86_400_000
REPORT_PATH = Path(__file__).resolve().parent.parent / "reports" / "data_quality.json"


# ---------------------------------------------------------------- fetching
def _get_json(session: requests.Session, path: str, params: dict, retries: int = 3):
    last_error: Exception | None = None
    for base in BINANCE_URLS:
        for attempt in range(retries):
            try:
                response = session.get(base + path, params=params, timeout=20)
                if response.status_code == 429:
                    time.sleep(2 ** attempt)
                    continue
                response.raise_for_status()
                return response.json()
            except requests.RequestException as error:
                last_error = error
                time.sleep(1)
    raise RuntimeError(f"Binance request failed for {params.get('symbol')}: {last_error}")


def parse_klines(rows: list, now_ms: int | None = None) -> pd.DataFrame:
    """Binance kline arrays -> DataFrame indexed by UTC date.

    Row layout: [open_time, open, high, low, close, base_volume, close_time,
                 quote_volume, ...]. volume = quote volume, i.e. USDT traded.
    The current, still-open candle is dropped.
    """
    now_ms = now_ms if now_ms is not None else int(datetime.now(timezone.utc).timestamp() * 1000)
    records = [
        {
            "date": pd.Timestamp(r[0], unit="ms").normalize(),
            "open": float(r[1]), "high": float(r[2]), "low": float(r[3]),
            "close": float(r[4]), "volume": float(r[7]),
        }
        for r in rows
        if int(r[6]) < now_ms
    ]
    df = pd.DataFrame(records, columns=["date", "open", "high", "low", "close", "volume"])
    return df.set_index("date")


def fetch_binance_klines(symbol: str, start: date, session: requests.Session | None = None) -> pd.DataFrame:
    session = session or requests.Session()
    cursor = int(pd.Timestamp(start).tz_localize("UTC").timestamp() * 1000)
    rows: list = []
    while True:
        batch = _get_json(session, "/api/v3/klines", {
            "symbol": f"{symbol}USDT", "interval": "1d", "startTime": cursor, "limit": 1000,
        })
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < 1000:
            break
        cursor = batch[-1][0] + DAY_MS
        time.sleep(0.2)
    return parse_klines(rows)


def fetch_fear_greed(session: requests.Session | None = None) -> pd.DataFrame:
    session = session or requests.Session()
    response = session.get(FEAR_GREED_URL, params={"limit": 0, "format": "json"}, timeout=20)
    response.raise_for_status()
    records = [
        {
            "date": pd.Timestamp(int(item["timestamp"]), unit="s").normalize(),
            "value": int(item["value"]),
            "classification": item["value_classification"],
        }
        for item in response.json()["data"]
    ]
    return pd.DataFrame(records).drop_duplicates("date").set_index("date").sort_index()


def generate_synthetic(symbols: list[str], start: date, end: date, seed: int = 42):
    """Correlated, fat-tailed, volatility-clustering fake prices. NOT real data.

    Returns (dict symbol -> OHLCV DataFrame, fear & greed DataFrame).
    """
    rng = np.random.default_rng(seed)
    dates = pd.date_range(start, end, freq="D", name="date")
    n = len(dates)

    def t_shocks(size):  # unit-variance Student-t, df=5
        return rng.standard_t(5, size) / np.sqrt(5 / 3)

    sigma2, market = np.empty(n), np.empty(n)
    omega, alpha, beta = 4.5e-5, 0.10, 0.85
    prev_var, prev_eps = omega / (1 - alpha - beta), 0.0
    shocks = t_shocks(n)
    for i in range(n):
        sigma2[i] = omega + alpha * prev_eps**2 + beta * prev_var
        prev_eps = np.sqrt(sigma2[i]) * shocks[i]
        prev_var = sigma2[i]
        market[i] = prev_eps

    frames = {}
    for k, symbol in enumerate(symbols):
        beta_i = 1.0 if symbol == "BTC" else 0.8 + 0.5 * rng.random()
        returns = beta_i * market + 0.015 * t_shocks(n) + 0.0003
        close = (100 * (k + 1)) * np.exp(np.cumsum(returns))
        open_ = np.concatenate([[close[0]], close[:-1]])
        spread = np.abs(t_shocks(n)) * 0.01
        frames[symbol] = pd.DataFrame({
            "open": open_,
            "high": np.maximum(open_, close) * (1 + spread),
            "low": np.minimum(open_, close) * (1 - spread),
            "close": close,
            "volume": np.exp(rng.normal(18, 0.6, n)) * (1 + 20 * np.abs(returns)),
        }, index=dates)

    # Sentiment loosely tied to a 14-day market trend, so tests have *some* signal.
    trend = pd.Series(market, index=dates).rolling(14, min_periods=1).sum()
    score = (50 + 400 * trend + rng.normal(0, 8, n)).clip(0, 100).round().astype(int)
    labels = pd.cut(score, [-1, 24, 44, 55, 75, 100],
                    labels=["Extreme Fear", "Fear", "Neutral", "Greed", "Extreme Greed"]).astype(str)
    return frames, pd.DataFrame({"value": score.values, "classification": labels}, index=dates)


# ---------------------------------------------------------------- loading
def upsert_coins(cur, coins) -> dict[str, int]:
    ids = {}
    for coingecko_id, symbol, name in coins:
        cur.execute(
            """INSERT INTO coins (coingecko_id, symbol, name) VALUES (%s, %s, %s)
               ON CONFLICT (coingecko_id) DO UPDATE SET symbol = EXCLUDED.symbol
               RETURNING id""",
            (coingecko_id, symbol, name),
        )
        ids[symbol] = cur.fetchone()[0]
    return ids


def upsert_ohlcv(cur, coin_id: int, df: pd.DataFrame, source: str) -> None:
    rows = [
        (coin_id, d.date(), float(r.open), float(r.high), float(r.low), float(r.close), float(r.volume), source)
        for d, r in df.iterrows()
    ]
    execute_values(cur, """
        INSERT INTO price_ohlcv (coin_id, price_date, open_usd, high_usd, low_usd, close_usd, volume_usd, source)
        VALUES %s
        ON CONFLICT (coin_id, price_date) DO UPDATE SET
            open_usd = EXCLUDED.open_usd, high_usd = EXCLUDED.high_usd, low_usd = EXCLUDED.low_usd,
            close_usd = EXCLUDED.close_usd, volume_usd = EXCLUDED.volume_usd, source = EXCLUDED.source
    """, rows)
    # keep the original app table in sync so the Forecast page gets the longer history
    execute_values(cur, """
        INSERT INTO price_history (coin_id, price_date, price_usd) VALUES %s
        ON CONFLICT (coin_id, price_date) DO UPDATE SET price_usd = EXCLUDED.price_usd
    """, [(coin_id, d.date(), float(c)) for d, c in df["close"].items()])


def upsert_fear_greed(cur, df: pd.DataFrame) -> None:
    execute_values(cur, """
        INSERT INTO fear_greed_index (signal_date, value, classification) VALUES %s
        ON CONFLICT (signal_date) DO UPDATE SET value = EXCLUDED.value, classification = EXCLUDED.classification
    """, [(d.date(), int(r.value), str(r.classification)) for d, r in df.iterrows()])


# ---------------------------------------------------------------- main
def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source", choices=["binance", "synthetic"], default="binance")
    parser.add_argument("--start", default="2022-01-01", help="first date, YYYY-MM-DD")
    parser.add_argument("--coins", default=None, help="comma-separated symbols (default: all 12)")
    parser.add_argument("--skip-sentiment", action="store_true")
    parser.add_argument("--export-csv", action="store_true", help=f"also write {DEFAULT_CSV}")
    args = parser.parse_args(argv)

    wanted = {s.strip().upper() for s in args.coins.split(",")} if args.coins else None
    coins = [c for c in COINS if wanted is None or c[1] in wanted]
    if not coins:
        parser.error("no matching coins; choose from " + ", ".join(c[1] for c in COINS))
    start = date.fromisoformat(args.start)
    yesterday = (datetime.now(timezone.utc) - pd.Timedelta(days=1)).date()

    if args.source == "synthetic":
        print("WARNING: generating SYNTHETIC data. Do not draw real conclusions from it.")
        frames, sentiment = generate_synthetic([c[1] for c in coins], start, yesterday)
        if args.skip_sentiment:
            sentiment = None
    else:
        session = requests.Session()
        frames = {}
        for _, symbol, _ in coins:
            print(f"Fetching {symbol}...", flush=True)
            frames[symbol] = fetch_binance_klines(symbol, start, session)
        sentiment = None if args.skip_sentiment else fetch_fear_greed(session)
        if sentiment is not None:
            sentiment = sentiment[sentiment.index >= pd.Timestamp(start)]

    quality, exported = {}, []
    conn = get_connection()
    try:
        with conn, conn.cursor() as cur:
            ids = upsert_coins(cur, coins)
            for symbol, df in frames.items():
                quality[symbol] = validate_ohlcv(df)
                cleaned = clean_ohlcv(df)
                upsert_ohlcv(cur, ids[symbol], cleaned, args.source)
                if args.source != "synthetic" and len(cleaned):
                    cur.execute("UPDATE coins SET current_price_usd = %s WHERE id = %s",
                                (float(cleaned['close'].iloc[-1]), ids[symbol]))
                exported.append(cleaned.assign(symbol=symbol, source=args.source))
                status = "OK" if quality[symbol]["passed"] else "ERRORS"
                print(f"  {symbol}: {len(cleaned)} rows loaded [{status}] warnings={quality[symbol]['warnings']}")
            if sentiment is not None:
                upsert_fear_greed(cur, sentiment)
                print(f"  Fear & Greed: {len(sentiment)} rows loaded")
    finally:
        conn.close()

    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps({"source": args.source, "coins": quality}, indent=2))
    print(f"Data-quality report: {REPORT_PATH}")

    if args.export_csv:
        DEFAULT_CSV.parent.mkdir(parents=True, exist_ok=True)
        pd.concat(exported).reset_index().to_csv(DEFAULT_CSV, index=False)
        print(f"CSV written: {DEFAULT_CSV}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
