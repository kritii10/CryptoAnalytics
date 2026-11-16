# Findings

> **This file is a template.** The notebooks compute every number from your data, but the *interpretation* is yours to write. Run the pipeline on real data first:
>
> ```bash
> python -m analytics.etl.ingest        # real Binance data
> jupyter lab analytics/notebooks       # run 01, 02, 03 top to bottom
> ```
>
> Then replace each "TODO" below with 1-3 sentences and one number from the notebook's "Key takeaways" cell. Delete any prompt that doesn't apply. Findings that are *negative* ("no day-of-week effect", "no model beat naive") are good findings - report them plainly.

**Data:** TODO coins, date range, source (check `data.data_sources()` says `binance`, not `synthetic`).

## 1. Return distribution
TODO - excess kurtosis, worst day in standard deviations, implication for Gaussian risk models.

## 2. Volatility
TODO - autocorrelation of |returns| vs raw returns; which model forecast volatility best and by how much.

## 3. Correlation and diversification
TODO - average pairwise correlation overall vs on BTC's worst days; what that means for diversification.

## 4. Calendar and sentiment effects
TODO - day-of-week test result (with the multiple-testing caveat); Granger result for Fear & Greed in both directions.

## 5. Risk-adjusted performance
TODO - best/worst Sharpe, deepest drawdown and recovery time, Gaussian vs historical VaR gap.

## 6. Portfolio optimisation
TODO - in-sample vs out-of-sample Sharpe for max-Sharpe vs equal weight. Did optimisation help?

## 7. Forecasting
TODO - did any model beat naive? by how much? how did the original linear-trend method rank? what does its 5-year extrapolation imply?

## Recommendations
TODO - e.g. replace the multi-year price forecast with a short-horizon range forecast; show volatility instead of price targets.
