"""Small statistical helpers used in the notebooks."""
from __future__ import annotations

import warnings

import numpy as np
import pandas as pd
from scipy import stats
from statsmodels.tsa.stattools import grangercausalitytests

DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def day_of_week_test(returns: pd.Series) -> tuple[pd.DataFrame, float, float]:
    """Mean return per weekday plus a Kruskal-Wallis test (H0: all weekdays share a distribution)."""
    returns = returns.dropna()
    groups = [returns[returns.index.dayofweek == d] for d in range(7)]
    table = pd.DataFrame({
        "mean": [g.mean() for g in groups],
        "std": [g.std() for g in groups],
        "share_up": [(g > 0).mean() for g in groups],
        "n": [len(g) for g in groups],
    }, index=DAY_NAMES)
    h_stat, p_value = stats.kruskal(*groups)
    return table, float(h_stat), float(p_value)


def lagged_correlation(x: pd.Series, y: pd.Series, max_lag: int = 14) -> pd.Series:
    """corr(x[t-k], y[t]) for k = 0..max_lag. Positive k means x LEADS y."""
    return pd.Series({k: x.shift(k).corr(y) for k in range(max_lag + 1)}, name="corr")


def granger_pvalues(effect: pd.Series, cause: pd.Series, max_lag: int = 7) -> pd.Series:
    """p-value that `cause` helps predict `effect` beyond effect's own history, per lag.

    Both series should be stationary (use returns / first differences, not levels).
    """
    data = pd.concat([effect, cause], axis=1).dropna()
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        result = grangercausalitytests(data.values, maxlag=max_lag)
    return pd.Series({lag: float(result[lag][0]["ssr_ftest"][1]) for lag in range(1, max_lag + 1)}, name="p_value")
