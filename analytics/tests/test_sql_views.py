"""Integration tests for database/analytics_views.sql. Skipped when no database is reachable
or price_ohlcv is empty (run `python -m analytics.etl.ingest` first)."""
import numpy as np
import pytest

psycopg2 = pytest.importorskip("psycopg2")
from analytics import data, metrics  # noqa: E402


@pytest.fixture(scope="module")
def has_data():
    try:
        n = data.query("SELECT COUNT(*) AS n FROM price_ohlcv")["n"].iloc[0]
        data.query("SELECT 1 FROM v_daily_returns LIMIT 1")
    except psycopg2.Error:
        pytest.skip("database or views not available")
    if n == 0:
        pytest.skip("price_ohlcv is empty")


def test_drawdown_view_never_positive(has_data):
    assert data.query("SELECT MAX(drawdown) AS m FROM v_drawdown")["m"].iloc[0] <= 0


def test_first_return_per_coin_is_null(has_data):
    df = data.query("""SELECT symbol, MIN(price_date) AS d FROM v_daily_returns GROUP BY symbol""")
    first = data.query("SELECT symbol, price_date, simple_return FROM v_daily_returns")
    merged = first.merge(df, left_on=["symbol", "price_date"], right_on=["symbol", "d"])
    assert merged["simple_return"].isna().all()


def test_sql_rolling_vol_matches_pandas(has_data):
    sql = data.query("""SELECT vol_30d_annualized AS v FROM v_rolling_metrics
                        WHERE symbol = 'BTC' ORDER BY price_date DESC LIMIT 1""")["v"].iloc[0]
    close = data.load_close_matrix(["BTC"])["BTC"]
    expected = np.log(close).diff().dropna().iloc[-30:].std() * np.sqrt(365)
    assert sql == pytest.approx(expected, rel=1e-6)


def test_momentum_ranks_are_consistent(has_data):
    df = data.query("SELECT return_30d, rank_30d FROM v_coin_momentum").dropna()
    assert df.sort_values("rank_30d")["return_30d"].is_monotonic_decreasing


def test_sql_drawdown_matches_python(has_data):
    sql = data.query("SELECT MIN(drawdown) AS d FROM v_drawdown WHERE symbol = 'BTC'")["d"].iloc[0]
    close = data.load_close_matrix(["BTC"])["BTC"]
    assert sql == pytest.approx(metrics.max_drawdown(close)["max_drawdown"], rel=1e-6)
