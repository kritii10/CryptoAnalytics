"""Honest forecast evaluation for crypto prices.

The point of this module is not to find a magic model - it is to MEASURE models the
right way. Everything is evaluated with walk-forward validation: at each forecast
origin the model sees only data up to that day, then predicts `horizon` days ahead.
Every model is compared against a naive "tomorrow = today" baseline.

    python -m analytics.forecasting --symbol BTC --horizon 7
    python -m analytics.forecasting --symbol ETH --horizon 30 --volatility
"""
from __future__ import annotations

import argparse
import warnings
from pathlib import Path
from typing import Callable

import numpy as np
import pandas as pd
from arch import arch_model
from sklearn.ensemble import GradientBoostingRegressor
from statsmodels.tsa.arima.model import ARIMA

REPORT_DIR = Path(__file__).resolve().parent / "reports"
Forecaster = Callable[[pd.Series, int], float]


# ============================================================ price forecasters
# Each takes (train prices up to the origin day, horizon in days) -> predicted price.
def naive_forecast(train: pd.Series, horizon: int) -> float:
    return float(train.iloc[-1])


def drift_forecast(train: pd.Series, horizon: int) -> float:
    """Random walk with drift: extrapolate the historical mean daily log return."""
    mean_log_return = np.log(train).diff().dropna().mean()
    return float(train.iloc[-1] * np.exp(mean_log_return * horizon))


def sma_forecast(train: pd.Series, horizon: int, window: int = 30) -> float:
    return float(train.iloc[-window:].mean())


def linear_trend_forecast(train: pd.Series, horizon: int) -> float:
    """The method the original app uses: OLS of price on day number, extrapolated."""
    x = np.arange(len(train))
    slope, intercept = np.polyfit(x, train.values, 1)
    return float(slope * (len(train) - 1 + horizon) + intercept)


def arima_forecast(train: pd.Series, horizon: int, order=(1, 1, 1), max_history: int = 730) -> float:
    log_prices = np.log(train.iloc[-max_history:].values)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            fitted = ARIMA(log_prices, order=order).fit()
            return float(np.exp(fitted.forecast(horizon)[-1]))
    except Exception:  # numerical failures happen; fall back rather than abort the evaluation
        return naive_forecast(train, horizon)


def _lag_features(log_ret: pd.Series) -> pd.DataFrame:
    return pd.DataFrame({
        "r1": log_ret, "r2": log_ret.shift(1), "r3": log_ret.shift(2),
        "mean5": log_ret.rolling(5).mean(), "mean10": log_ret.rolling(10).mean(),
        "mean30": log_ret.rolling(30).mean(),
        "vol7": log_ret.rolling(7).std(), "vol30": log_ret.rolling(30).std(),
    })


def gbm_forecast(train: pd.Series, horizon: int) -> float:
    """Gradient boosting on lagged returns/volatility, predicting the next `horizon`-day log return.

    No look-ahead: a training row's target (sum of the following `horizon` returns) is only
    used if it ends on or before the origin day.
    """
    log_ret = np.log(train).diff().dropna()
    features = _lag_features(log_ret)
    target = log_ret.rolling(horizon).sum().shift(-horizon)
    data = pd.concat([features, target.rename("y")], axis=1).dropna()
    model = GradientBoostingRegressor(n_estimators=100, max_depth=2, learning_rate=0.05,
                                      subsample=0.8, random_state=0)
    model.fit(data.drop(columns="y"), data["y"])
    predicted_log_return = model.predict(features.iloc[[-1]])[0]
    return float(train.iloc[-1] * np.exp(predicted_log_return))


PRICE_MODELS: dict[str, Forecaster] = {
    "naive": naive_forecast,
    "drift": drift_forecast,
    "sma_30": sma_forecast,
    "linear_trend (original app)": linear_trend_forecast,
    "arima(1,1,1)": arima_forecast,
    "gbm_lag_features": gbm_forecast,
}


# ============================================================ walk-forward machinery
def walk_forward(prices: pd.Series, horizon: int = 7, models: dict[str, Forecaster] | None = None,
                 min_train: int = 365, step: int = 14) -> pd.DataFrame:
    """Long table of forecasts: origin_date, target_date, model, origin_price, actual, forecast."""
    models = models or PRICE_MODELS
    prices = prices.dropna()
    if len(prices) < min_train + horizon + 1:
        raise ValueError(f"Need at least {min_train + horizon + 1} days of prices, got {len(prices)}")
    rows = []
    for t in range(min_train - 1, len(prices) - horizon, step):
        train = prices.iloc[: t + 1]
        actual = float(prices.iloc[t + horizon])
        for name, forecaster in models.items():
            rows.append({
                "origin_date": prices.index[t], "target_date": prices.index[t + horizon],
                "model": name, "origin_price": float(train.iloc[-1]),
                "actual": actual, "forecast": forecaster(train, horizon),
            })
    return pd.DataFrame(rows)


def evaluate(forecasts: pd.DataFrame, baseline: str = "naive") -> pd.DataFrame:
    """Per-model error metrics. skill_vs_naive > 0 means the model beat the baseline on MAE."""
    f = forecasts.copy()
    f["error"] = f["forecast"] - f["actual"]
    f["abs_error"] = f["error"].abs()
    f["pct_error"] = f["abs_error"] / f["actual"]
    f["direction_hit"] = np.sign(f["forecast"] - f["origin_price"]) == np.sign(f["actual"] - f["origin_price"])
    summary = f.groupby("model").agg(
        MAE=("abs_error", "mean"),
        RMSE=("error", lambda e: float(np.sqrt((e ** 2).mean()))),
        MAPE=("pct_error", "mean"),
        bias=("error", "mean"),
        directional_accuracy=("direction_hit", "mean"),
        n_forecasts=("error", "size"),
    )
    if baseline in summary.index:
        summary["skill_vs_naive"] = 1 - summary["MAE"] / summary.loc[baseline, "MAE"]
    return summary.sort_values("MAE")


# ============================================================ prediction intervals
def empirical_interval(prices: pd.Series, horizon: int, level: float = 0.9, lookback: int = 730):
    """Interval from the empirical distribution of past `horizon`-day log returns."""
    log_ret = np.log(prices).diff().dropna().iloc[-lookback:]
    cumulative = log_ret.rolling(horizon).sum().dropna()
    low, high = cumulative.quantile([(1 - level) / 2, 1 - (1 - level) / 2])
    last = float(prices.iloc[-1])
    return last * np.exp(low), last * np.exp(high)


def interval_coverage(prices: pd.Series, horizon: int = 7, level: float = 0.9,
                      min_train: int = 365, step: int = 14) -> float:
    """Walk-forward check: how often does the realised price land inside the interval?

    A well-calibrated 90% interval should cover about 90%.
    """
    prices = prices.dropna()
    hits, total = 0, 0
    for t in range(min_train - 1, len(prices) - horizon, step):
        low, high = empirical_interval(prices.iloc[: t + 1], horizon, level)
        hits += low <= prices.iloc[t + horizon] <= high
        total += 1
    return hits / total


# ============================================================ volatility forecasting
# Take (train daily log returns, horizon) -> predicted daily volatility over the horizon.
def trailing_vol(train_returns: pd.Series, horizon: int, window: int = 30) -> float:
    return float(train_returns.iloc[-window:].std())


def ewma_vol(train_returns: pd.Series, horizon: int, lam: float = 0.94) -> float:
    variance = train_returns.iloc[:30].var()
    for r in train_returns.iloc[30:]:
        variance = lam * variance + (1 - lam) * r ** 2
    return float(np.sqrt(variance))


def garch_vol(train_returns: pd.Series, horizon: int) -> float:
    """GARCH(1,1) with Student-t errors; returns the average forecast daily vol over the horizon."""
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            res = arch_model(train_returns * 100, vol="GARCH", p=1, q=1, dist="t").fit(disp="off")
            variance_path = res.forecast(horizon=horizon).variance.values[-1]
        return float(np.sqrt(variance_path.mean()) / 100)
    except Exception:
        return trailing_vol(train_returns, horizon)


VOL_MODELS = {"trailing_30d": trailing_vol, "ewma_0.94": ewma_vol, "garch(1,1)-t": garch_vol}


def walk_forward_volatility(prices: pd.Series, horizon: int = 30, min_train: int = 365, step: int = 14) -> pd.DataFrame:
    """Compare volatility forecasts with the volatility that was actually realised afterwards."""
    log_ret = np.log(prices.dropna()).diff().dropna()
    rows = []
    for t in range(min_train - 1, len(log_ret) - horizon, step):
        train = log_ret.iloc[: t + 1]
        realised = float(log_ret.iloc[t + 1: t + 1 + horizon].std())
        for name, model in VOL_MODELS.items():
            rows.append({"origin_date": train.index[-1], "model": name,
                         "forecast": model(train, horizon), "realised": realised})
    return pd.DataFrame(rows)


def evaluate_volatility(table: pd.DataFrame) -> pd.DataFrame:
    t = table.assign(error=table["forecast"] - table["realised"])
    return t.groupby("model").agg(
        MAE=("error", lambda e: float(e.abs().mean())),
        RMSE=("error", lambda e: float(np.sqrt((e ** 2).mean()))),
        bias=("error", "mean"),
        correlation=("forecast", lambda s: float(s.corr(t.loc[s.index, "realised"]))),
    ).sort_values("RMSE")


# ============================================================ CLI
def main(argv: list[str] | None = None) -> int:
    from analytics.data import load_close_matrix

    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--symbol", default="BTC")
    parser.add_argument("--horizon", type=int, default=7, help="forecast horizon in days")
    parser.add_argument("--step", type=int, default=14, help="days between forecast origins")
    parser.add_argument("--volatility", action="store_true", help="evaluate volatility models instead of price models")
    args = parser.parse_args(argv)

    prices = load_close_matrix([args.symbol])[args.symbol].dropna()
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    pd.set_option("display.float_format", lambda v: f"{v:,.4f}")

    if args.volatility:
        results = evaluate_volatility(walk_forward_volatility(prices, args.horizon, step=args.step))
        out = REPORT_DIR / f"vol_eval_{args.symbol}_h{args.horizon}.csv"
    else:
        results = evaluate(walk_forward(prices, args.horizon, step=args.step))
        out = REPORT_DIR / f"forecast_eval_{args.symbol}_h{args.horizon}.csv"
        coverage = interval_coverage(prices, args.horizon, step=args.step)
        print(f"90% empirical interval coverage: {coverage:.0%} (target 90%)")
    print(results)
    results.to_csv(out)
    print(f"Saved {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
