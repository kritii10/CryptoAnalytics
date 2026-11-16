"""Risk / return metrics for crypto price series.

Conventions
-----------
* Crypto trades every day, so annualisation uses 365 periods, not 252.
* Functions named *_returns take prices; every other function takes SIMPLE returns
  (pd.Series / pd.DataFrame) unless the docstring says otherwise.
* Risk-free rate defaults to 0 - a common simplification for crypto; pass rf to change it.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from scipy import stats
from scipy.optimize import minimize

PERIODS = 365


# ------------------------------------------------------------------ returns
def simple_returns(prices: pd.DataFrame | pd.Series):
    return prices.pct_change().dropna(how="all")


def log_returns(prices: pd.DataFrame | pd.Series):
    return np.log(prices).diff().dropna(how="all")


# ------------------------------------------------------------------ single asset
def annualized_return(returns: pd.Series, periods: int = PERIODS) -> float:
    """Geometric (compound) annualised return."""
    returns = returns.dropna()
    if returns.empty:
        return float("nan")
    return float((1 + returns).prod() ** (periods / len(returns)) - 1)


def annualized_vol(returns: pd.Series, periods: int = PERIODS) -> float:
    return float(returns.std(ddof=1) * np.sqrt(periods))


def sharpe_ratio(returns: pd.Series, rf: float = 0.0, periods: int = PERIODS) -> float:
    excess = returns - rf / periods
    sd = excess.std(ddof=1)
    return float(excess.mean() / sd * np.sqrt(periods)) if sd > 0 else float("nan")


def sortino_ratio(returns: pd.Series, rf: float = 0.0, periods: int = PERIODS) -> float:
    excess = returns - rf / periods
    downside = np.sqrt(np.mean(np.minimum(excess, 0) ** 2))
    return float(excess.mean() / downside * np.sqrt(periods)) if downside > 0 else float("nan")


def drawdown_series(prices: pd.Series) -> pd.Series:
    """Fractional distance below the running peak (0 at a new high, -0.5 = 50% down)."""
    return prices / prices.cummax() - 1


def max_drawdown(prices: pd.Series) -> dict:
    dd = drawdown_series(prices)
    trough = dd.idxmin()
    peak = prices.loc[:trough].idxmax()
    recovered = prices.loc[trough:][prices.loc[trough:] >= prices.loc[peak]]
    return {
        "max_drawdown": float(dd.min()),
        "peak_date": peak,
        "trough_date": trough,
        "recovery_date": recovered.index[0] if len(recovered) else None,
    }


def historical_var(returns: pd.Series, level: float = 0.95) -> float:
    """Historical Value-at-Risk as a positive loss fraction: 'on 95% of days we lose less than x'."""
    return float(-np.quantile(returns.dropna(), 1 - level))


def historical_cvar(returns: pd.Series, level: float = 0.95) -> float:
    """Expected shortfall: average loss on the days worse than the VaR threshold."""
    returns = returns.dropna()
    cutoff = np.quantile(returns, 1 - level)
    return float(-returns[returns <= cutoff].mean())


def beta(asset: pd.Series, market: pd.Series) -> float:
    joined = pd.concat([asset, market], axis=1, join="inner").dropna()
    cov = np.cov(joined.iloc[:, 0], joined.iloc[:, 1], ddof=1)
    return float(cov[0, 1] / cov[1, 1])


# ------------------------------------------------------------------ cross-asset
def correlation_matrix(returns: pd.DataFrame) -> pd.DataFrame:
    return returns.corr()


def average_pairwise_correlation(corr: pd.DataFrame) -> float:
    n = len(corr)
    off_diagonal = corr.values[~np.eye(n, dtype=bool)]
    return float(off_diagonal.mean())


def rolling_correlation(a: pd.Series, b: pd.Series, window: int = 90) -> pd.Series:
    return a.rolling(window).corr(b)


def risk_table(prices: pd.DataFrame, market: str | None = "BTC", rf: float = 0.0) -> pd.DataFrame:
    """One row per coin with the headline risk/return numbers."""
    rets = simple_returns(prices)
    rows = {}
    for symbol in prices.columns:
        r = rets[symbol].dropna()
        p = prices[symbol].dropna()
        mdd = max_drawdown(p)["max_drawdown"]
        ann_ret = annualized_return(r)
        rows[symbol] = {
            "total_return": p.iloc[-1] / p.iloc[0] - 1,
            "ann_return": ann_ret,
            "ann_volatility": annualized_vol(r),
            "sharpe": sharpe_ratio(r, rf),
            "sortino": sortino_ratio(r, rf),
            "max_drawdown": mdd,
            "calmar": ann_ret / abs(mdd) if mdd < 0 else float("nan"),
            "var_95": historical_var(r, 0.95),
            "cvar_95": historical_cvar(r, 0.95),
            "skew": float(stats.skew(r)),
            "excess_kurtosis": float(stats.kurtosis(r)),
        }
        if market and market in rets.columns:
            rows[symbol]["beta_vs_" + market.lower()] = beta(r, rets[market])
    return pd.DataFrame(rows).T


# ------------------------------------------------------------------ portfolio construction
def portfolio_stats(weights, returns: pd.DataFrame, rf: float = 0.0, periods: int = PERIODS) -> dict:
    w = np.asarray(weights, dtype=float)
    mu = returns.mean().values * periods          # arithmetic annualised mean
    cov = returns.cov().values * periods
    ret = float(w @ mu)
    vol = float(np.sqrt(w @ cov @ w))
    return {"return": ret, "volatility": vol, "sharpe": (ret - rf) / vol if vol > 0 else float("nan")}


def _optimise(objective, n: int, max_weight: float, extra_constraints=()):
    result = minimize(
        objective,
        x0=np.full(n, 1 / n),
        method="SLSQP",
        bounds=[(0, max_weight)] * n,
        constraints=[{"type": "eq", "fun": lambda w: w.sum() - 1}, *extra_constraints],
    )
    return result


def min_variance_weights(returns: pd.DataFrame, max_weight: float = 1.0) -> pd.Series:
    cov = returns.cov().values * PERIODS
    res = _optimise(lambda w: w @ cov @ w, returns.shape[1], max_weight)
    return pd.Series(res.x, index=returns.columns)


def max_sharpe_weights(returns: pd.DataFrame, rf: float = 0.0, max_weight: float = 1.0) -> pd.Series:
    mu = returns.mean().values * PERIODS
    cov = returns.cov().values * PERIODS
    res = _optimise(lambda w: -(w @ mu - rf) / np.sqrt(w @ cov @ w), returns.shape[1], max_weight)
    return pd.Series(res.x, index=returns.columns)


def efficient_frontier(returns: pd.DataFrame, n_points: int = 25, max_weight: float = 1.0) -> pd.DataFrame:
    """Long-only minimum-variance portfolios for a range of target returns."""
    mu = returns.mean().values * PERIODS
    cov = returns.cov().values * PERIODS
    lo = float(min_variance_weights(returns, max_weight).values @ mu)
    hi = float(mu.max())
    rows = []
    for target in np.linspace(lo, hi * 0.999, n_points):
        res = _optimise(lambda w: w @ cov @ w, len(mu), max_weight,
                        [{"type": "eq", "fun": lambda w, t=target: w @ mu - t}])
        if res.success:
            rows.append({"return": float(target), "volatility": float(np.sqrt(res.fun)), "weights": res.x})
    return pd.DataFrame(rows)


def risk_contributions(weights, returns: pd.DataFrame) -> pd.Series:
    """Share of total portfolio variance contributed by each asset (sums to 1)."""
    w = np.asarray(weights, dtype=float)
    cov = returns.cov().values * PERIODS
    marginal = cov @ w
    return pd.Series(w * marginal / (w @ cov @ w), index=returns.columns)


def diversification_ratio(weights, returns: pd.DataFrame) -> float:
    """Weighted-average asset volatility / portfolio volatility. 1 = no diversification benefit."""
    w = np.asarray(weights, dtype=float)
    vols = returns.std(ddof=1).values * np.sqrt(PERIODS)
    port_vol = np.sqrt(w @ (returns.cov().values * PERIODS) @ w)
    return float(w @ vols / port_vol)
