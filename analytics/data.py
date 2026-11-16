"""Data access for the analytics module.

Reads the same DB_* environment variables as the Express backend and
forecast/predict.py. If PostgreSQL is unreachable, falls back to a CSV export
(analytics/data/ohlcv.csv, created with `ingest.py --export-csv`) so the
notebooks can still run.
"""
from __future__ import annotations

import os
from decimal import Decimal
from pathlib import Path

import pandas as pd
import psycopg2

DEFAULT_CSV = Path(__file__).resolve().parent / "data" / "ohlcv.csv"

OHLCV_SQL = """
SELECT c.symbol, c.name, o.price_date AS date,
       o.open_usd AS open, o.high_usd AS high, o.low_usd AS low,
       o.close_usd AS close, o.volume_usd AS volume, o.source
FROM price_ohlcv o
JOIN coins c ON c.id = o.coin_id
WHERE (%(symbols)s::text[] IS NULL OR c.symbol = ANY(%(symbols)s::text[]))
  AND (%(start)s::date IS NULL OR o.price_date >= %(start)s::date)
ORDER BY c.symbol, o.price_date
"""


def db_settings() -> dict:
    # Avoid a frozen dashboard or test run when PostgreSQL is unavailable.
    # The CSV fallback (when present) can then be used promptly instead.
    settings = {
        "dbname": os.getenv("DB_NAME", "crypto_analytics"),
        "connect_timeout": int(os.getenv("DB_CONNECT_TIMEOUT", "5")),
    }
    for env_name, key in [("DB_USER", "user"), ("DB_PASSWORD", "password"),
                          ("DB_HOST", "host"), ("DB_PORT", "port")]:
        value = os.getenv(env_name)
        if value:
            settings[key] = value
    return settings


def get_connection():
    return psycopg2.connect(**db_settings())


def query(sql: str, params: dict | None = None) -> pd.DataFrame:
    """Run a SELECT and return a DataFrame (Decimal columns become float)."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            columns = [d[0] for d in cur.description]
            rows = cur.fetchall()
    finally:
        conn.close()
    df = pd.DataFrame(rows, columns=columns)
    for col in df.columns:
        non_null = df[col].dropna()
        if len(non_null) and isinstance(non_null.iloc[0], Decimal):
            df[col] = df[col].astype(float)
    return df


def load_ohlcv(symbols: list[str] | None = None, start: str | None = None) -> pd.DataFrame:
    """Long-format OHLCV: symbol, name, date, open, high, low, close, volume, source."""
    try:
        df = query(OHLCV_SQL, {"symbols": symbols, "start": start})
    except psycopg2.Error as db_error:
        if not DEFAULT_CSV.exists():
            raise RuntimeError(
                "Could not reach PostgreSQL and no CSV fallback exists. Set the DB_* "
                "environment variables, or create the fallback with "
                "`python -m analytics.etl.ingest --export-csv`."
            ) from db_error
        df = pd.read_csv(DEFAULT_CSV)
        if symbols:
            df = df[df["symbol"].isin(symbols)]
        if start:
            df = df[pd.to_datetime(df["date"]) >= pd.Timestamp(start)]
    df["date"] = pd.to_datetime(df["date"])
    return df.reset_index(drop=True)


def load_close_matrix(symbols: list[str] | None = None, start: str | None = None) -> pd.DataFrame:
    """Wide table of closing prices: index = date, one column per symbol."""
    df = load_ohlcv(symbols, start)
    return df.pivot(index="date", columns="symbol", values="close").sort_index()


def load_fear_greed() -> pd.DataFrame:
    df = query("SELECT signal_date AS date, value, classification FROM fear_greed_index ORDER BY signal_date")
    df["date"] = pd.to_datetime(df["date"])
    return df.set_index("date")


def load_transactions(user_id: int = 1) -> pd.DataFrame:
    df = query(
        """SELECT t.transaction_date AS date, c.symbol, t.transaction_type AS type,
                  t.quantity, t.price_usd AS price
           FROM transactions t JOIN coins c ON c.id = t.coin_id
           WHERE t.user_id = %(user_id)s ORDER BY t.transaction_date, t.id""",
        {"user_id": user_id},
    )
    df["date"] = pd.to_datetime(df["date"])
    return df


def load_portfolio_value(user_id: int = 1) -> pd.DataFrame:
    df = query(
        """SELECT price_date AS date, portfolio_value_usd AS value, open_positions
           FROM v_portfolio_daily_value WHERE user_id = %(user_id)s ORDER BY price_date""",
        {"user_id": user_id},
    )
    df["date"] = pd.to_datetime(df["date"])
    return df.set_index("date")


def data_sources() -> list[str]:
    """Which sources are in price_ohlcv, e.g. ['binance'] or ['synthetic']."""
    try:
        return query("SELECT DISTINCT source FROM price_ohlcv")["source"].tolist()
    except psycopg2.Error:
        return ["csv-fallback"]
