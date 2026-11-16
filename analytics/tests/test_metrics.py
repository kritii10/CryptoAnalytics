import numpy as np
import pandas as pd
import pytest

from analytics import metrics as m


def _prices(values):
    return pd.Series(values, index=pd.date_range("2024-01-01", periods=len(values)), dtype=float)


def test_max_drawdown_known_case():
    # peak 200 -> trough 100 is a 50% drawdown, then recovers past the peak
    p = _prices([100, 150, 200, 150, 100, 120, 210])
    result = m.max_drawdown(p)
    assert result["max_drawdown"] == pytest.approx(-0.5)
    assert result["peak_date"] == p.index[2]
    assert result["trough_date"] == p.index[4]
    assert result["recovery_date"] == p.index[6]


def test_max_drawdown_no_recovery():
    assert m.max_drawdown(_prices([100, 80, 90]))["recovery_date"] is None


def test_drawdown_is_never_positive():
    rng = np.random.default_rng(0)
    p = _prices(100 * np.exp(np.cumsum(rng.normal(0, 0.02, 500))))
    assert m.drawdown_series(p).max() <= 0


def test_sharpe_scales_with_sqrt_periods():
    rng = np.random.default_rng(1)
    r = pd.Series(rng.normal(0.001, 0.02, 1000))
    assert m.sharpe_ratio(r, periods=365) == pytest.approx(m.sharpe_ratio(r, periods=1) * np.sqrt(365))


def test_sortino_ignores_upside_volatility():
    base = pd.Series([0.01, -0.01] * 100)
    bigger_upside = pd.Series([0.05, -0.01] * 100)
    assert m.sortino_ratio(bigger_upside) > m.sortino_ratio(base)


def test_var_and_cvar_ordering():
    rng = np.random.default_rng(2)
    r = pd.Series(rng.standard_t(4, 5000) * 0.02)
    assert 0 < m.historical_var(r, 0.95) < m.historical_cvar(r, 0.95)
    assert m.historical_var(r, 0.99) > m.historical_var(r, 0.95)


def test_beta_of_scaled_market_is_the_scale():
    rng = np.random.default_rng(3)
    market = pd.Series(rng.normal(0, 0.02, 500))
    assert m.beta(1.5 * market, market) == pytest.approx(1.5)


def test_annualized_return_compounds():
    daily = pd.Series([0.001] * 365)
    assert m.annualized_return(daily) == pytest.approx(1.001 ** 365 - 1)


def test_average_pairwise_correlation_excludes_diagonal():
    corr = pd.DataFrame([[1, 0.5, 0.5], [0.5, 1, 0.5], [0.5, 0.5, 1]])
    assert m.average_pairwise_correlation(corr) == pytest.approx(0.5)


@pytest.fixture
def returns():
    rng = np.random.default_rng(4)
    common = rng.normal(0, 0.02, 800)
    return pd.DataFrame({
        "A": common + rng.normal(0, 0.01, 800),
        "B": common * 0.5 + rng.normal(0, 0.02, 800),
        "C": rng.normal(0, 0.03, 800),
    })


def test_optimised_weights_are_valid(returns):
    for weights in (m.min_variance_weights(returns), m.max_sharpe_weights(returns, max_weight=0.6)):
        assert weights.sum() == pytest.approx(1.0, abs=1e-6)
        assert (weights >= -1e-9).all()
    assert m.max_sharpe_weights(returns, max_weight=0.6).max() <= 0.6 + 1e-6


def test_min_variance_beats_equal_weight(returns):
    eq = m.portfolio_stats(np.full(3, 1 / 3), returns)["volatility"]
    mv = m.portfolio_stats(m.min_variance_weights(returns), returns)["volatility"]
    assert mv <= eq + 1e-9


def test_risk_contributions_sum_to_one(returns):
    assert m.risk_contributions([0.5, 0.3, 0.2], returns).sum() == pytest.approx(1.0)


def test_diversification_ratio_at_least_one_for_long_only(returns):
    assert m.diversification_ratio(np.full(3, 1 / 3), returns) >= 1.0


def test_frontier_volatility_increases_with_return(returns):
    frontier = m.efficient_frontier(returns, n_points=10)
    assert len(frontier) >= 5
    assert frontier["volatility"].is_monotonic_increasing or frontier["volatility"].iloc[-1] > frontier["volatility"].iloc[0]
