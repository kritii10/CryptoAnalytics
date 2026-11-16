from datetime import date

import numpy as np
import pandas as pd

from analytics.etl.ingest import generate_synthetic, parse_klines
from analytics.etl.validate import clean_ohlcv, validate_ohlcv


def _kline(open_time_ms, o, h, l, c, quote_volume, close_time_ms):
    return [open_time_ms, str(o), str(h), str(l), str(c), "1.0", close_time_ms, str(quote_volume), 10, "0", "0", "0"]


DAY = 86_400_000


def test_parse_klines_maps_fields_and_drops_open_candle():
    base = 1_700_000_000_000 // DAY * DAY
    rows = [
        _kline(base, 1, 2, 0.5, 1.5, 1000, base + DAY - 1),
        _kline(base + DAY, 1.5, 2, 1, 1.8, 2000, base + 2 * DAY - 1),   # still open at "now"
    ]
    df = parse_klines(rows, now_ms=base + DAY + 1000)
    assert len(df) == 1
    assert df.iloc[0]["close"] == 1.5 and df.iloc[0]["volume"] == 1000    # quote volume used
    assert df.index[0] == pd.Timestamp(base, unit="ms").normalize()


def _good_frame(n=10):
    idx = pd.date_range("2024-01-01", periods=n, freq="D", name="date")
    return pd.DataFrame({"open": 10.0, "high": 12.0, "low": 9.0, "close": 11.0, "volume": 100.0}, index=idx)


def test_validate_clean_data_passes():
    report = validate_ohlcv(_good_frame())
    assert report["passed"] and report["warnings"]["missing_days"] == 0


def test_validate_flags_each_problem():
    df = _good_frame()
    df.loc[df.index[1], "high"] = 5.0            # high < low and close above high
    df.loc[df.index[2], "close"] = -1.0          # non-positive
    df = df.drop(df.index[4])                    # missing day
    df.loc[df.index[5], "volume"] = 0.0          # zero volume
    report = validate_ohlcv(df)
    assert not report["passed"]
    assert report["errors"]["high_below_low"] == 1
    assert report["errors"]["non_positive_or_null_prices"] == 1
    assert report["warnings"]["missing_days"] == 1
    assert report["warnings"]["zero_volume_days"] == 1


def test_validate_flags_extreme_move():
    df = _good_frame()
    df.iloc[5:, df.columns.get_indexer(["open", "high", "low", "close"])] *= 3
    assert validate_ohlcv(df)["warnings"]["extreme_daily_moves"] == 1


def test_clean_drops_bad_rows_and_duplicates():
    df = _good_frame()
    df.loc[df.index[2], "close"] = -1.0
    df = pd.concat([df, df.iloc[[0]]])           # duplicate date
    cleaned = clean_ohlcv(df)
    assert len(cleaned) == 9 and cleaned.index.is_unique and validate_ohlcv(cleaned)["passed"]


def test_synthetic_data_is_valid_reproducible_and_fat_tailed():
    frames, sentiment = generate_synthetic(["BTC", "ETH"], date(2023, 1, 1), date(2024, 12, 31), seed=7)
    again, _ = generate_synthetic(["BTC", "ETH"], date(2023, 1, 1), date(2024, 12, 31), seed=7)
    pd.testing.assert_frame_equal(frames["BTC"], again["BTC"])
    assert validate_ohlcv(frames["BTC"])["passed"]
    assert sentiment["value"].between(0, 100).all()
    log_ret = np.log(frames["BTC"]["close"]).diff().dropna()
    assert log_ret.kurt() > 0   # heavier tails than a normal distribution
