import pandas as pd
import pytest

from analytics.portfolio import fifo_realized_pnl, xirr


def test_xirr_simple_one_year():
    assert xirr(["2023-01-01", "2024-01-01"], [-100, 110]) == pytest.approx(0.10, abs=1e-3)


def test_xirr_nan_without_sign_change():
    assert pd.isna(xirr(["2023-01-01", "2024-01-01"], [-100, -50]))


def test_fifo_uses_oldest_lots_first():
    tx = pd.DataFrame([
        {"date": "2025-01-01", "symbol": "BTC", "type": "buy", "quantity": 1, "price": 100},
        {"date": "2025-02-01", "symbol": "BTC", "type": "buy", "quantity": 1, "price": 200},
        {"date": "2025-03-01", "symbol": "BTC", "type": "sell", "quantity": 1.5, "price": 300},
    ])
    realised, open_lots = fifo_realized_pnl(tx)
    # cost = 1 x 100 + 0.5 x 200 = 200 ; proceeds = 450
    assert realised.loc[0, "cost_basis"] == pytest.approx(200)
    assert realised.loc[0, "realized_pnl"] == pytest.approx(250)
    assert open_lots.loc[0, "quantity"] == pytest.approx(0.5)
    assert open_lots.loc[0, "price"] == 200


def test_fifo_rejects_overselling():
    tx = pd.DataFrame([
        {"date": "2025-01-01", "symbol": "ETH", "type": "buy", "quantity": 1, "price": 10},
        {"date": "2025-01-02", "symbol": "ETH", "type": "sell", "quantity": 2, "price": 10},
    ])
    with pytest.raises(ValueError):
        fifo_realized_pnl(tx)
