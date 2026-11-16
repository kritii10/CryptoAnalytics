# Methodology, assumptions and limitations

## Return and risk conventions
* **Annualisation uses 365 periods.** Crypto trades every day, unlike equities (252).
* **Simple returns** are used for portfolio maths and risk metrics (they aggregate across assets); **log returns** are used for distributions, volatility models and seasonality (they add across time).
* **Risk-free rate = 0** by default. Sharpe and Sortino accept an `rf` argument.
* **Sharpe** = mean excess return / std x sqrt(365). **Sortino** replaces std with downside deviation. **Calmar** = annual return / |max drawdown|.
* **VaR / CVaR** are *historical*: empirical quantile and tail mean of daily simple returns. The notebooks also show Gaussian VaR to quantify how much a normal assumption understates tail risk.
* **Beta** = covariance with BTC / variance of BTC.

## Portfolio analysis
* The efficient frontier is **long-only** with an optional per-asset cap, solved with SLSQP, using annualised arithmetic mean returns and the sample covariance matrix.
* In-sample optimisation overfits badly on noisy crypto returns, so notebook 02 re-tests weights **out-of-sample** (fit on the first 70% of days, score on the last 30%).
* **XIRR** is the money-weighted return from dated cash flows plus the final portfolio value. **FIFO** realised P&L matches each sale against the oldest purchase lots first.

## Forecast evaluation
* **Walk-forward validation:** at each origin date the model is fitted on data up to that day only, forecasts `h` days ahead, and is scored on the realised price. Origins are spaced `step` days apart (default 14). No random train/test splits - they leak future information in time series.
* **Baseline:** naive ("price in h days = price today"). `skill_vs_naive = 1 - MAE_model / MAE_naive`.
* **Models:** naive, random walk with drift, 30-day SMA, the app's original linear trend, ARIMA(1,1,1) on log prices, and gradient boosting on lagged return/volatility features (target = next-h-day log return; training rows whose target would extend past the origin are excluded).
* **Prediction intervals** use the empirical distribution of past h-day log returns; `interval_coverage` backtests whether a nominal 90% interval really covers ~90%.
* **Volatility** forecasts (trailing 30-day, EWMA, GARCH(1,1) with Student-t errors) are scored against the volatility realised over the following h days.

## Limitations
1. **USDT is not USD.** Small de-pegs are ignored.
2. **Survivorship bias.** The 12 coins were chosen *today*; coins that collapsed are absent, so historical returns look better than a real investor's opportunity set.
3. **Single venue.** Prices come from Binance only; no cross-exchange check.
4. **Overlapping forecast windows** make walk-forward errors correlated, so small skill differences between models are not statistically significant. Treat anything within a couple of percent of naive as "no skill".
5. **Multiple testing.** Testing many coins/lags yields ~5% false positives at p<0.05 by chance; the notebooks print the expected count.
6. **Not investment advice.** Nothing here is a trading signal.
