import React, { useEffect, useState } from "react";
import api from "../api.js";
import Navbar from "../components/Navbar.jsx";
import Table from "../components/Table.jsx";

function money(value) {
  return `$${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function Portfolio() {
  const [coins, setCoins] = useState([]);
  const [portfolio, setPortfolio] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    coin_id: "",
    transaction_type: "buy",
    quantity: "",
    price_usd: "",
    transaction_date: new Date().toISOString().slice(0, 10)
  });

  async function loadData() {
    setLoading(true);

    try {
      const [coinsRes, portfolioRes, transactionsRes] = await Promise.all([
        api.get("/coins"),
        api.get("/analytics/portfolio"),
        api.get("/transactions")
      ]);

      setCoins(coinsRes.data);
      setPortfolio(portfolioRes.data);
      setTransactions(transactionsRes.data);

      if (!form.coin_id && coinsRes.data.length) {
        setForm((oldForm) => ({ ...oldForm, coin_id: coinsRes.data[0].id }));
      }
    } catch (error) {
      setMessage(error.response?.data?.message || "Could not load portfolio data");
    } finally {
      setLoading(false);
    }
  }

  function updateField(event) {
    setForm({ ...form, [event.target.name]: event.target.value });
  }

  async function saveTransaction(event) {
    event.preventDefault();

    if (!form.quantity || !form.price_usd) {
      setMessage("Please enter quantity and price before saving.");
      return;
    }

    await api.post("/transactions", form);
    setForm({ ...form, quantity: "", price_usd: "" });
    await loadData();
  }

  async function deleteTransaction(id) {
    await api.delete(`/transactions/${id}`);
    await loadData();
  }

  async function addToWatchlist(coinId) {
    await api.post("/analytics/watchlist", { coin_id: coinId });
  }

  useEffect(() => {
    loadData();
  }, []);

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-[#0B1220] px-4 pb-8 pt-32 md:ml-64 md:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="rounded-2xl border border-[#1F2937] bg-[#111827] p-6 shadow-sm">
            <h1 className="text-3xl font-bold text-[#F9FAFB]">Portfolio</h1>
            <p className="mt-2 text-sm text-[#9CA3AF]">Add transactions, review holdings and manage your watchlist.</p>
          </div>

          {message && <p className="mt-4 rounded-2xl border border-[#1F2937] bg-[#111827] p-3 text-sm text-[#EF4444]">{message}</p>}
          {loading && <p className="mt-4 rounded-2xl border border-[#1F2937] bg-[#111827] p-3 text-sm text-[#9CA3AF]">Loading portfolio data...</p>}

          <form className="mt-6 grid gap-3 rounded-2xl border border-[#1F2937] bg-[#111827] p-5 md:grid-cols-6" onSubmit={saveTransaction}>
            <select className="rounded-2xl border border-[#1F2937] bg-[#0B1220] px-3 py-3 text-[#F9FAFB]" name="coin_id" onChange={updateField} value={form.coin_id}>
              {coins.map((coin) => (
                <option key={coin.id} value={coin.id}>
                  {coin.symbol} - {coin.name}
                </option>
              ))}
            </select>

            <select className="rounded-2xl border border-[#1F2937] bg-[#0B1220] px-3 py-3 text-[#F9FAFB]" name="transaction_type" onChange={updateField} value={form.transaction_type}>
              <option value="buy">Buy</option>
              <option value="sell">Sell</option>
            </select>

            <input className="rounded-2xl border border-[#1F2937] bg-[#0B1220] px-3 py-3 text-[#F9FAFB]" name="quantity" onChange={updateField} placeholder="Quantity" step="0.00000001" type="number" value={form.quantity} />
            <input className="rounded-2xl border border-[#1F2937] bg-[#0B1220] px-3 py-3 text-[#F9FAFB]" name="price_usd" onChange={updateField} placeholder="Price USD" step="0.00000001" type="number" value={form.price_usd} />
            <input className="rounded-2xl border border-[#1F2937] bg-[#0B1220] px-3 py-3 text-[#F9FAFB]" name="transaction_date" onChange={updateField} type="date" value={form.transaction_date} />
            <button className="rounded-2xl bg-[#3B82F6] px-4 py-3 font-semibold text-white hover:bg-blue-500">Save</button>
          </form>

          <section className="mt-6 rounded-2xl border border-[#1F2937] bg-[#111827] p-6 shadow-sm">
            <h2 className="mb-4 text-2xl font-bold text-[#F9FAFB]">Current Holdings</h2>
            <Table
              columns={[
                { key: "symbol", label: "Symbol" },
                { key: "name", label: "Name" },
                { key: "quantity", label: "Quantity" },
                { key: "average_buy_price", label: "Average Buy", render: (row) => money(row.average_buy_price) },
                { key: "current_value", label: "Current Value", render: (row) => money(row.current_value) },
                { key: "profit_loss", label: "Profit/Loss", render: (row) => money(row.profit_loss) }
              ]}
              renderActions={(row) => (
                <button className="rounded-2xl border border-[#1F2937] px-3 py-2 text-[#3B82F6] hover:border-[#3B82F6]" onClick={() => addToWatchlist(row.coin_id)}>
                  Watch
                </button>
              )}
              rows={portfolio}
            />
          </section>

          <section className="mt-6 rounded-2xl border border-[#1F2937] bg-[#111827] p-6 shadow-sm">
            <h2 className="mb-4 text-2xl font-bold text-[#F9FAFB]">Transaction History</h2>
            <Table
              columns={[
                { key: "transaction_date", label: "Date", render: (row) => row.transaction_date?.slice(0, 10) },
                { key: "symbol", label: "Coin" },
                { key: "transaction_type", label: "Type" },
                { key: "quantity", label: "Quantity" },
                { key: "price_usd", label: "Price", render: (row) => money(row.price_usd) },
                { key: "total_usd", label: "Total", render: (row) => money(row.total_usd) }
              ]}
              renderActions={(row) => (
                <button className="rounded-2xl bg-[#EF4444] px-3 py-2 font-semibold text-white" onClick={() => deleteTransaction(row.id)}>
                  Delete
                </button>
              )}
              rows={transactions}
            />
          </section>
        </div>
      </main>
    </>
  );
}

export default Portfolio;
