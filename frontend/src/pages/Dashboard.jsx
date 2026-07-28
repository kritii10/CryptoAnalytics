import React, { useEffect, useState } from "react";
import {
  CircleDollarSign,
  PieChart as PieChartIcon,
  TrendingUp,
  Wallet
} from "lucide-react";
import api from "../api.js";
import Navbar from "../components/Navbar.jsx";
import Chart from "../components/Chart.jsx";

function money(value) {
  return `$${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function Dashboard() {
  const [summary, setSummary] = useState({});
  const [allocation, setAllocation] = useState([]);
  const [watchlist, setWatchlist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function loadDashboard() {
    setLoading(true);
    setMessage("");

    try {
      const [summaryRes, allocationRes, watchlistRes] = await Promise.all([
        api.get("/analytics/summary"),
        api.get("/analytics/allocation"),
        api.get("/analytics/watchlist")
      ]);

      setSummary(summaryRes.data);
      setAllocation(allocationRes.data);
      setWatchlist(watchlistRes.data);
    } catch (error) {
      setMessage(error.response?.data?.message || "Could not load dashboard data");
    } finally {
      setLoading(false);
    }
  }

  async function refreshPrices() {
    try {
      setMessage("");
      await api.post("/analytics/refresh-prices");
      await loadDashboard();
    } catch (error) {
      setMessage(error.response?.data?.message || "Could not refresh prices");
    }
  }

  async function removeFromWatchlist(coinId) {
    try {
      setMessage("");
      await api.delete(`/analytics/watchlist/${coinId}`);
      await loadDashboard();
    } catch (error) {
      setMessage(error.response?.data?.message || "Could not remove watchlist item");
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  const portfolioValue = Number(summary.portfolio_value || 0);
  const totalInvestment = Number(summary.total_investment || 0);
  const profitLoss = Number(summary.profit_loss || 0);
  const netReturn =
    portfolioValue && totalInvestment
      ? (((portfolioValue - totalInvestment) / totalInvestment) * 100).toFixed(1)
      : "0.0";

  const cards = [
    {
      label: "Portfolio Value",
      value: money(portfolioValue),
      detail: `${netReturn}% net return`,
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
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-[#9CA3AF]">Dashboard</p>
                <h1 className="mt-2 text-3xl font-bold text-[#F9FAFB]">Crypto Portfolio Dashboard</h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-[#9CA3AF]">
                  View portfolio value, profit and loss, allocation, and your watchlist in one place.
                </p>
              </div>

              <button
                className="rounded-2xl bg-[#3B82F6] px-5 py-3 text-sm font-semibold text-white hover:bg-blue-500"
                onClick={refreshPrices}
                type="button"
              >
                Refresh Prices
              </button>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-3">
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
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#9CA3AF]">Portfolio Allocation</p>
                <h2 className="mt-1 text-2xl font-bold text-[#F9FAFB]">Portfolio split</h2>
              </div>
              <PieChartIcon className="text-[#3B82F6]" size={18} />
            </div>
            <Chart type="pie" data={allocation} xKey="symbol" yKey="value" />
          </section>

          <section className="mt-6 rounded-2xl border border-[#1F2937] bg-[#111827] p-6 shadow-sm">
            <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-medium text-[#9CA3AF]">Watchlist</p>
                <h2 className="mt-1 text-2xl font-bold text-[#F9FAFB]">Tracked coins</h2>
              </div>
              <p className="text-sm text-[#9CA3AF]">{watchlist.length} coins saved</p>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#1F2937] text-[#9CA3AF]">
                    <th className="pb-3 font-medium">Coin</th>
                    <th className="pb-3 font-medium">Symbol</th>
                    <th className="pb-3 font-medium">Current Price</th>
                    <th className="pb-3 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {watchlist.map((coin) => (
                    <tr className="border-b border-[#1F2937]/70 text-[#F9FAFB]" key={coin.id}>
                      <td className="py-4">
                        <div>
                          <p className="font-semibold">{coin.name}</p>
                        </div>
                      </td>
                      <td className="py-4">{coin.symbol}</td>
                      <td className="py-4">{money(coin.current_price_usd)}</td>
                      <td className="py-4 text-right">
                        <button
                          className="rounded-2xl border border-[#1F2937] px-3 py-2 text-[#F9FAFB] hover:border-[#EF4444] hover:text-[#FCA5A5]"
                          onClick={() => removeFromWatchlist(coin.coin_id)}
                          type="button"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {!watchlist.length && <p className="mt-4 text-sm text-[#9CA3AF]">Your watchlist is empty.</p>}
          </section>
        </div>
      </main>
    </>
  );
}

export default Dashboard;
