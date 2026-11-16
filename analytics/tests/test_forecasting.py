import numpy as np
import pandas as pd
import pytest

from analytics import forecasting as fc


def _walk(n=500, seed=0):
    rng = np.random.default_rng(seed)
    return pd.Series(100 * np.exp(np.cumsum(rng.normal(0.0005, 0.02, n))),
                     index=pd.date_range("2022-01-01", periods=n))


def test_every_price_model_returns_a_positive_float():
    p = _walk()
    for name, model in fc.PRICE_MODELS.items():
        value = model(p.iloc[:400], 7)
        assert np.isfinite(value) and value > 0, name


def test_linear_trend_recovers_a_perfect_line():
    p = pd.Series(np.arange(100, 200, dtype=float), index=pd.date_range("2022-01-01", periods=100))
    assert fc.linear_trend_forecast(p, 10) == pytest.approx(209.0)


def test_walk_forward_never_peeks_at_the_future():
    p = _walk()
    seen = []

    def spy(train, horizon):
        seen.append((train.index[-1], len(train)))
        return float(train.iloc[-1])

    table = fc.walk_forward(p, horizon=7, models={"naive": spy}, min_train=200, step=50)
    assert (table["target_date"] > table["origin_date"]).all()
    assert all(last == p.index[n - 1] for last, n in seen)      # train always ends at the origin
    assert (table["actual"].values == p.reindex(table["target_date"]).values).all()


def test_walk_forward_requires_enough_data():
    with pytest.raises(ValueError):
        fc.walk_forward(_walk(100), horizon=7, min_train=365)


def test_evaluate_gives_naive_zero_skill_and_ranks_by_mae():
    table = fc.walk_forward(_walk(), horizon=7, models={"naive": fc.naive_forecast, "drift": fc.drift_forecast},
                            min_train=250, step=20)
    summary = fc.evaluate(table)
    assert summary.loc["naive", "skill_vs_naive"] == pytest.approx(0.0)
    assert summary["MAE"].is_monotonic_increasing


def test_empirical_interval_brackets_last_price_and_widens_with_level():
    p = _walk()
    lo90, hi90 = fc.empirical_interval(p, 7, 0.90)
    lo50, hi50 = fc.empirical_interval(p, 7, 0.50)
    assert lo90 < lo50 < p.iloc[-1] < hi50 < hi90


def test_interval_coverage_is_in_a_sane_range():
    assert 0.7 <= fc.interval_coverage(_walk(900), horizon=7, level=0.9, min_train=300, step=10) <= 1.0


def test_volatility_models_are_positive():
    lr = np.log(_walk()).diff().dropna()
    for name, model in fc.VOL_MODELS.items():
        assert model(lr.iloc[:400], 30) > 0, name
