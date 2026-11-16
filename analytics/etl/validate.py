"""Data-quality checks for daily OHLCV data.

Errors  = rows that must not be loaded (corrupt data).
Warnings = unusual but plausible; reported, still loaded.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

PRICE_COLUMNS = ["open", "high", "low", "close"]
EXTREME_LOG_RETURN = 0.5  # |log return| > 0.5 means a move of roughly +65% / -39% in a day


def _invalid_mask(df: pd.DataFrame) -> pd.Series:
    nonpositive = (df[PRICE_COLUMNS] <= 0).any(axis=1) | df[PRICE_COLUMNS].isna().any(axis=1)
    inverted = df["high"] < df["low"]
    tol = 1e-9
    outside = (df["close"] > df["high"] * (1 + tol)) | (df["close"] < df["low"] * (1 - tol))
    return nonpositive | inverted | outside


def validate_ohlcv(df: pd.DataFrame) -> dict:
    """df: DatetimeIndex named 'date', columns open/high/low/close/volume."""
    report: dict = {"rows": int(len(df))}
    if df.empty:
        report.update(passed=False, errors={"empty": 1}, warnings={})
        return report

    index = df.index
    full_range = pd.date_range(index.min(), index.max(), freq="D")
    missing = full_range.difference(index.drop_duplicates())

    nonpositive = int(((df[PRICE_COLUMNS] <= 0) | df[PRICE_COLUMNS].isna()).any(axis=1).sum())
    positive_close = df["close"].where(df["close"] > 0)
    log_ret = np.log(positive_close).diff()

    errors = {
        "duplicate_dates": int(index.duplicated().sum()),
        "non_positive_or_null_prices": nonpositive,
        "high_below_low": int((df["high"] < df["low"]).sum()),
        "close_outside_range": int(
            ((df["close"] > df["high"] * (1 + 1e-9)) | (df["close"] < df["low"] * (1 - 1e-9))).sum()
        ),
    }
    warnings = {
        "missing_days": int(len(missing)),
        "zero_volume_days": int((df["volume"] <= 0).sum()),
        "extreme_daily_moves": int((log_ret.abs() > EXTREME_LOG_RETURN).sum()),
    }
    report.update(
        start=str(index.min().date()),
        end=str(index.max().date()),
        errors=errors,
        warnings=warnings,
        missing_dates_sample=[str(d.date()) for d in missing[:5]],
        passed=sum(errors.values()) == 0,
    )
    return report


def clean_ohlcv(df: pd.DataFrame) -> pd.DataFrame:
    """Drop duplicate dates (keep last) and rows that fail the error checks."""
    df = df[~df.index.duplicated(keep="last")].sort_index()
    return df[~_invalid_mask(df)]
