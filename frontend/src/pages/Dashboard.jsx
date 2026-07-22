import React, { useEffect, useState } from "react";
import axios from "axios";
import {
  ArrowDownRight,
  ArrowUpRight,
  CircleDollarSign,
  Crosshair,
  PieChart as PieChartIcon,
  TrendingUp,
  Wallet
} from "lucide-react";
import api from "../api.js";
import Navbar from "../components/Navbar.jsx";
import Chart from "../components/Chart.jsx";
import Table from "../components/Table.jsx";

function money(value) {
  return `$${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function percent(value) {
  return `${Number(value || 0).toFixed(2)}%`;
}

function Dashboard() {
  const [summary, setSummary] = useState({});
  const [allocation, setAllocation] = useState([]);
  const [monthly, setMonthly] = useState([]);
  const [watchlist, setWatchlist] = useState([]);
  const [portfolio, setPortfolio] = useState([]);
  const [coins, setCoins] = useState([]);
  const [marketStats, setMarketStats] = useState({});
  const [timeframe, setTimeframe] = useState("3M");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function loadDashboard() {
    setLoading(true);
    setMessage("");

    try {
      const [summaryRes, allocationRes, monthlyRes, watchlistRes, portfolioRes, coinsRes] = await Promise.all([
        api.get("/analytics/summary"),
        api.get("/analytics/allocation"),
        api.get("/analytics/monthly-investment"),
        api.get("/analytics/watchlist"),
        api.get("/analytics/portfolio"),
        api.get("/coins")
      ]);

      setSummary(summaryRes.data);
      setAllocation(allocationRes.data);
      setMonthly(monthlyRes.data);
      setWatchlist(watchlistRes.data);
      setPortfolio(portfolioRes.data);
      setCoins(coinsRes.data);

      if (coinsRes.data.length) {
        const ids = coinsRes.data.map((coin) => coin.coingecko_id).join(",");
        const marketResponse = await axios.get("https://api.coingecko.com/api/v3/coins/markets", {
          params: {
            vs_currency: "usd",
            ids,
            price_change_percentage: "24h"
          }
        });

        const marketMap = Object.fromEntries(
          marketResponse.data.map((coin) => [coin.symbol?.toUpperCase(), coin.price_change_percentage_24h || 0])
        );

        setMarketStats(marketMap);
      }
    } catch (error) {
      setMessage(error.response?.data?.message || "Could not load dashboard data");
    } finally {
      setLoading(false);
    }
  }

  async function refreshPrices() {
    await api.post("/analytics/refresh-prices");
    await loadDashboard();
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  const portfolioValue = Number(summary.portfolio_value || 0);
  const profitLoss = Number(summary.profit_loss || 0);
  const totalInvestment = Number(summary.total_investment || 0);
  const averagePositionSize = portfolio.length ? portfolioValue / portfolio.length : 0;
  const todayGain = portfolio.reduce((total, row) => {
    const change = Number(marketStats[row.symbol] || 0);
    return total + (Number(row.current_value || 0) * change) / 100;
  }, 0);
  const timeframeMap = {
    "1D": 1,
    "7D": 2,
    "1M": 3,
    "3M": 4,
    "1Y": monthly.length
  };
  const visibleMonths = monthly.slice(-timeframeMap[timeframe] || monthly.length);
  const chartData = visibleMonths.map((row, index) => ({
    month: row.month,
    amount: Number(row.amount || 0),
    cumulative: visibleMonths
      .slice(0, index + 1)
      .reduce((total, current) => total + Number(current.amount || 0), 0)
  }));
  const movers = portfolio
    .map((row) => ({
      ...row,
      change: Number(marketStats[row.symbol] || 0)
    }))
    .sort((first, second) => Math.abs(second.change) - Math.abs(first.change))
    .slice(0, 3);
  const holdings = portfolio.map((row) => ({
    ...row,
    change: Number(marketStats[row.symbol] || 0),
    prediction: Number(row.profit_loss || 0) >= 0 ? "Bullish" : "Bearish"
  }));
  const cards = [
    {
      label: "Portfolio Value",
      value: money(portfolioValue),
      detail: `${portfolioValue && totalInvestment ? (((portfolioValue - totalInvestment) / totalInvestment) * 100).toFixed(1) : "0.0"}% net return`,
      icon: CircleDollarSign,
      text: "text-[#3B82F6]"
    },
    {
      label: "Net Change",
      value: `${profitLoss >= 0 ? "+" : "-"}${money(Math.abs(profitLoss))}`,
      detail: "Current profit / loss",
      icon: TrendingUp,
      text: profitLoss >= 0 ? "text-[#22C55E]" : "text-[#EF4444]"
    },
    {
      label: "Assets Owned",
      value: `${summary.total_assets || 0}`,
      detail: `${watchlist.length} in watchlist`,
      icon: Wallet,
      text: "text-[#F9FAFB]"
    },
    {
      label: "Average Position",
      value: money(averagePositionSize),
      detail: "Mean holding value",
      icon: Crosshair,
      text: "text-[#3B82F6]"
    }
  ];

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-[#0B1220] px-4 pb-8 pt-32 md:ml-64 md:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="rounded-2xl border border-[#1F2937] bg-[#111827] p-6 shadow-sm">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-[#9CA3AF]">Executive Summary</p>
                <h1 className="mt-2 text-3xl font-bold text-[#F9FAFB]">Portfolio analytics dashboard</h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-[#9CA3AF]">Monitor exposure, movements and forecast signals in a reporting-first workspace.</p>
              </div>

              <button className="rounded-2xl bg-[#3B82F6] px-5 py-3 text-sm font-semibold text-white hover:bg-blue-500" onClick={refreshPrices}>
                Refresh Prices
              </button>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-4">
              {cards.map((card) => {
                const Icon = card.icon;

                return (
                  <div className="rounded-2xl border border-[#1F2937] bg-[#0B1220] p-5" key={card.label}>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-[#9CA3AF]">{card.label}</p>
                      <div className="rounded-2xl bg-[#111827] p-2">
                        <Icon className={card.text} size={18} />
                      </div>
                    </div>
                    <h2 className="mt-5 text-3xl font-bold text-[#F9FAFB]">{card.value}</h2>
                    <p className={`mt-2 text-sm font-medium ${card.text}`}>{card.detail}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {message && <p className="mt-4 rounded-2xl border border-[#1F2937] bg-[#111827] p-3 text-sm text-[#EF4444]">{message}</p>}
          {loading && <p className="mt-4 rounded-2xl border border-[#1F2937] bg-[#111827] p-3 text-sm text-[#9CA3AF]">Loading dashboard data...</p>}

          <section className="mt-6 rounded-2xl border border-[#1F2937] bg-[#111827] p-6 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-sm font-medium text-[#9CA3AF]">Portfolio Performance</p>
                <h2 className="mt-1 text-2xl font-bold text-[#F9FAFB]">Investment trend</h2>
              </div>
              <div className="flex gap-2 text-sm">
                {["1D", "7D", "1M", "3M", "1Y"].map((label) => (
                  <button
                    className={`rounded-full px-3 py-1.5 font-medium ${
                      timeframe === label ? "bg-[#3B82F6] text-white" : "bg-[#0B1220] text-[#9CA3AF]"
                    }`}
                    key={label}
                    onClick={() => setTimeframe(label)}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-6">
              <Chart data={chartData} xKey="month" yKey="cumulative" secondYKey="amount" />
            </div>
          </section>

          <section className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-2xl border border-[#1F2937] bg-[#111827] p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[#9CA3AF]">Asset Allocation</p>
                  <h2 className="mt-1 text-2xl font-bold text-[#F9FAFB]">Portfolio split</h2>
                </div>
                <PieChartIcon className="text-[#3B82F6]" size={18} />
              </div>
              <Chart type="pie" data={allocation} xKey="symbol" yKey="value" />
            </div>

            <div className="rounded-2xl border border-[#1F2937] bg-[#111827] p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[#9CA3AF]">Top Movers</p>
                  <h2 className="mt-1 text-2xl font-bold text-[#F9FAFB]">24h movement</h2>
                </div>
                <TrendingUp className="text-[#3B82F6]" size={18} />
              </div>

              <div className="mt-6 space-y-4">
                {movers.map((coin) => (
                  <div className="flex items-center justify-between rounded-2xl border border-[#1F2937] bg-[#0B1220] px-4 py-4" key={coin.coin_id}>
                    <div>
                      <p className="font-semibold text-[#F9FAFB]">{coin.symbol}</p>
                      <p className="text-sm text-[#9CA3AF]">{coin.name}</p>
                    </div>
                    <div className={`flex items-center gap-2 text-sm font-semibold ${coin.change >= 0 ? "text-[#22C55E]" : "text-[#EF4444]"}`}>
                      {coin.change >= 0 ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                      <span>{percent(Math.abs(coin.change))}</span>
                    </div>
                  </div>
                ))}
                {!movers.length && <p className="text-sm text-[#9CA3AF]">No mover data available.</p>}
              </div>
            </div>
          </section>

          <section className="mt-6 rounded-2xl border border-[#1F2937] bg-[#111827] p-6 shadow-sm">
            <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-medium text-[#9CA3AF]">Holdings</p>
                <h2 className="mt-1 text-2xl font-bold text-[#F9FAFB]">Portfolio positions</h2>
              </div>
              <p className="text-sm text-[#9CA3AF]">{holdings.length} positions tracked</p>
            </div>
            <Table
              columns={[
                {
                  key: "symbol",
                  label: "Coin",
                  render: (row) => (
                    <div>
                      <p className="font-semibold text-[#F9FAFB]">{row.symbol}</p>
                      <p className="text-xs text-[#9CA3AF]">{row.name}</p>
                    </div>
                  )
                },
                { key: "quantity", label: "Quantity" },
                { key: "current_price_usd", label: "Current Price", render: (row) => money(row.current_price_usd) },
                {
                  key: "change",
                  label: "24h Change",
                  render: (row) => (
                    <span className={row.change >= 0 ? "text-[#22C55E]" : "text-[#EF4444]"}>
                      {row.change >= 0 ? "+" : ""}
                      {percent(row.change)}
                    </span>
                  )
                },
                { key: "current_value", label: "Value", render: (row) => money(row.current_value) },
                {
                  key: "prediction",
                  label: "Prediction",
                  render: (row) => (
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        row.prediction === "Bullish"
                          ? "bg-green-500/10 text-[#22C55E]"
                          : "bg-red-500/10 text-[#EF4444]"
                      }`}
                    >
                      {row.prediction}
                    </span>
                  )
                }
              ]}
              rows={holdings}
            />
          </section>
        </div>
      </main>
    </>
  );
}

export default Dashboard;
