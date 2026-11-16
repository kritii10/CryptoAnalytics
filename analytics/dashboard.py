"""Streamlit analytics dashboard.

    pip install -r analytics/requirements.txt
    streamlit run analytics/dashboard.py
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

from analytics import data, forecasting, metrics
from analytics.portfolio import fifo_realized_pnl, xirr

st.set_page_config(page_title="Crypto Analytics", layout="wide")


@st.cache_data(ttl=600, show_spinner="Loading prices...")
def get_prices() -> pd.DataFrame:
    return data.load_close_matrix()


@st.cache_data(ttl=600)
def get_sources() -> list[str]:
    return data.data_sources()


@st.cache_data(ttl=600, show_spinner="Running walk-forward evaluation...")
def run_forecast_eval(symbol: str, horizon: int) -> pd.DataFrame:
    return forecasting.evaluate(forecasting.walk_forward(get_prices()[symbol].dropna(), horizon, step=21))


def pct(df: pd.DataFrame, columns: list[str]):
    return df.style.format({c: "{:.1%}" for c in columns}, na_rep="-")


try:
    prices = get_prices()
except Exception as error:  # surface a friendly message instead of a stack trace
    st.error(f"Could not load price data: {error}")
    st.info("Run `python -m analytics.etl.ingest` after loading the schema, then refresh.")
    st.stop()

if "synthetic" in get_sources():
    st.warning("Synthetic demo data is loaded. Numbers below are NOT real market results.")

st.sidebar.title("Crypto Analytics")
page = st.sidebar.radio("View", ["Market overview", "Risk & correlation", "Forecast evaluation", "My portfolio"])
symbols = st.sidebar.multiselect("Coins", list(prices.columns), default=list(prices.columns)[:6])
min_date, max_date = prices.index.min().date(), prices.index.max().date()
date_range = st.sidebar.date_input("Date range", (min_date, max_date), min_value=min_date, max_value=max_date)
if not symbols or len(date_range) != 2:
    st.info("Select at least one coin and a start and end date.")
    st.stop()
window = prices.loc[str(date_range[0]):str(date_range[1]), symbols].dropna(how="all")

# ------------------------------------------------------------------ market overview
if page == "Market overview":
    st.header("Market overview")
    rebased = window / window.bfill().iloc[0] * 100
    st.plotly_chart(px.line(rebased, title="Growth of 100 (log scale)", log_y=True), width="stretch")

    momentum = data.query("SELECT * FROM v_coin_momentum ORDER BY rank_30d")
    momentum = momentum[momentum["symbol"].isin(symbols)]
    st.subheader("Momentum ranking (SQL view `v_coin_momentum`)")
    st.dataframe(pct(momentum.set_index("symbol"), ["return_7d", "return_30d", "return_90d"]), width="stretch")

    vol = data.query("SELECT symbol, price_date, vol_30d_annualized FROM v_rolling_metrics WHERE vol_30d_annualized IS NOT NULL")
    vol = vol[vol["symbol"].isin(symbols)]
    st.plotly_chart(px.line(vol, x="price_date", y="vol_30d_annualized", color="symbol",
                            title="30-day annualised volatility"), width="stretch")

# ------------------------------------------------------------------ risk & correlation
elif page == "Risk & correlation":
    st.header("Risk & correlation")
    table = metrics.risk_table(window)
    shown = ["total_return", "ann_return", "ann_volatility", "max_drawdown", "var_95", "cvar_95"]
    st.dataframe(pct(table[shown], shown), width="stretch")
    st.dataframe(table[["sharpe", "sortino", "calmar", "skew", "excess_kurtosis"]].round(2), width="stretch")

    returns = metrics.simple_returns(window).dropna()
    if returns.shape[1] > 1:
        corr = metrics.correlation_matrix(returns)
        left, right = st.columns(2)
        left.plotly_chart(px.imshow(corr.round(2), text_auto=True, zmin=-1, zmax=1,
                                    color_continuous_scale="RdBu_r", title="Return correlation"),
                          width="stretch")
        dd = pd.concat({s: metrics.drawdown_series(window[s].dropna()) for s in window.columns}, axis=1)
        right.plotly_chart(px.line(dd, title="Drawdown from peak"), width="stretch")
        st.caption(f"Average pairwise correlation: {metrics.average_pairwise_correlation(corr):.2f}")

        st.subheader("Efficient frontier (long-only, in-sample)")
        frontier = metrics.efficient_frontier(returns, max_weight=0.6)
        fig = px.line(frontier, x="volatility", y="return", markers=True)
        for symbol in returns.columns:
            fig.add_trace(go.Scatter(x=[metrics.annualized_vol(returns[symbol])],
                                     y=[returns[symbol].mean() * metrics.PERIODS],
                                     mode="markers+text", text=[symbol], textposition="top center", showlegend=False))
        st.plotly_chart(fig, width="stretch")
        st.caption("In-sample optimisation overfits: weights that looked best in the past are unstable going forward.")

# ------------------------------------------------------------------ forecast evaluation
elif page == "Forecast evaluation":
    st.header("Forecast evaluation (walk-forward)")
    st.caption("Each model is retrained at every origin using only past data, then judged against "
               "a naive 'price stays the same' baseline. Skill > 0 means it beat the baseline.")
    symbol = st.selectbox("Coin", symbols)
    horizon = st.select_slider("Horizon (days)", [1, 7, 14, 30], value=7)
    try:
        results = run_forecast_eval(symbol, horizon)
        st.dataframe(results.style.format({"MAE": "{:,.2f}", "RMSE": "{:,.2f}", "MAPE": "{:.1%}", "bias": "{:,.2f}",
                                           "directional_accuracy": "{:.1%}", "skill_vs_naive": "{:+.1%}"}),
                     width="stretch")
        st.plotly_chart(px.bar(results.reset_index(), x="model", y="skill_vs_naive",
                               title="Skill vs naive baseline (higher is better)"), width="stretch")
        series = prices[symbol].dropna()
        low, high = forecasting.empirical_interval(series, horizon, 0.9)
        st.metric(f"{symbol} latest close", f"${series.iloc[-1]:,.2f}")
        st.write(f"90% empirical range for {horizon} days ahead: **${low:,.2f} - ${high:,.2f}** "
                 f"(historical coverage check: {forecasting.interval_coverage(series, horizon, step=21):.0%}).")
    except ValueError as error:
        st.warning(str(error))

# ------------------------------------------------------------------ portfolio
else:
    st.header("My portfolio")
    user_id = st.number_input("User id", min_value=1, value=1, step=1)
    value = data.load_portfolio_value(int(user_id))
    tx = data.load_transactions(int(user_id))
    if value.empty:
        st.info("No transactions with matching price history for this user.")
        st.stop()
    st.plotly_chart(px.area(value, y="value", title="Portfolio value over time (rebuilt from the ledger)"),
                    width="stretch")

    flows = pd.DataFrame({"date": tx["date"], "amount": np.where(tx["type"] == "buy", -1, 1) * tx["quantity"] * tx["price"]})
    flows = pd.concat([flows, pd.DataFrame({"date": [value.index[-1]], "amount": [value["value"].iloc[-1]]})])
    irr = xirr(flows["date"], flows["amount"])
    realised, open_lots = fifo_realized_pnl(tx)
    a, b, c = st.columns(3)
    a.metric("Current value", f"${value['value'].iloc[-1]:,.0f}")
    b.metric("Money-weighted return (XIRR)", "n/a" if pd.isna(irr) else f"{irr:.1%}")
    c.metric("Realised P&L (FIFO)", f"${realised['realized_pnl'].sum():,.2f}" if len(realised) else "$0.00")
    st.subheader("Realised sales (FIFO)")
    st.dataframe(realised, width="stretch")
    st.subheader("Transactions")
    st.dataframe(tx, width="stretch")
