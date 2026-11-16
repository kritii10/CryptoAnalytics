"""Portfolio accounting: money-weighted return (XIRR) and FIFO realised P&L."""
from __future__ import annotations

from collections import deque

import pandas as pd
from scipy.optimize import brentq


def xirr(dates, amounts) -> float:
    """Annualised money-weighted return.

    Sign convention: money you put in is NEGATIVE, money you get back (sales and the
    final portfolio value) is POSITIVE. Returns NaN if no sign change exists.
    """
    dates = pd.to_datetime(pd.Series(list(dates)))
    amounts = [float(a) for a in amounts]
    if not (any(a < 0 for a in amounts) and any(a > 0 for a in amounts)):
        return float("nan")
    t0 = dates.min()
    years = [(d - t0).days / 365.0 for d in dates]

    def npv(rate):
        return sum(a / (1 + rate) ** t for a, t in zip(amounts, years))

    try:
        return float(brentq(npv, -0.9999, 1e3, maxiter=500))
    except (ValueError, OverflowError):
        return float("nan")


def fifo_realized_pnl(transactions: pd.DataFrame):
    """First-in-first-out realised P&L.

    transactions columns: date, symbol, type ('buy'/'sell'), quantity, price.
    Returns (realised, open_lots):
        realised  - one row per sale: date, symbol, quantity, proceeds, cost_basis, realized_pnl
        open_lots - remaining lots per symbol: symbol, quantity, price (unit cost)
    Raises ValueError when a sale exceeds the quantity held.
    """
    lots: dict[str, deque] = {}
    realised = []
    for tx in transactions.sort_values("date", kind="stable").itertuples():
        queue = lots.setdefault(tx.symbol, deque())
        if tx.type == "buy":
            queue.append([float(tx.quantity), float(tx.price)])
            continue
        remaining, cost = float(tx.quantity), 0.0
        while remaining > 1e-12:
            if not queue:
                raise ValueError(f"Sold more {tx.symbol} than held on {tx.date}")
            lot = queue[0]
            take = min(remaining, lot[0])
            cost += take * lot[1]
            lot[0] -= take
            remaining -= take
            if lot[0] <= 1e-12:
                queue.popleft()
        proceeds = float(tx.quantity) * float(tx.price)
        realised.append({"date": tx.date, "symbol": tx.symbol, "quantity": float(tx.quantity),
                         "proceeds": proceeds, "cost_basis": cost, "realized_pnl": proceeds - cost})
    open_lots = [{"symbol": s, "quantity": q, "price": p} for s, queue in lots.items() for q, p in queue]
    return pd.DataFrame(realised), pd.DataFrame(open_lots)
