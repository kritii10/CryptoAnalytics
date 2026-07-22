import React, { useEffect, useState } from "react";
import api from "../api.js";
import Navbar from "../components/Navbar.jsx";
import Chart from "../components/Chart.jsx";
import Table from "../components/Table.jsx";

function money(value) {
  return `$${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function Forecast() {
  const [coins, setCoins] = useState([]);
  const [coinId, setCoinId] = useState("");
  const [historical, setHistorical] = useState([]);
  const [predictions, setPredictions] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadCoins() {
    try {
      const response = await api.get("/coins");
      setCoins(response.data);

      if (response.data.length) {
        setCoinId(response.data[0].id);
      }
    } catch (error) {
      setMessage(error.response?.data?.message || "Could not load available coins");
    }
  }

  async function loadForecast(selectedCoinId = coinId) {
    if (!selectedCoinId) {
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const response = await api.get(`/analytics/forecast/${selectedCoinId}`);
      setHistorical(response.data.historical || []);
      setPredictions(response.data.predictions || []);
    } catch (error) {
      setMessage(error.response?.data?.message || "Could not load forecast");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCoins();
  }, []);

  useEffect(() => {
    loadForecast(coinId);
  }, [coinId]);

  const chartData = [
    ...historical.map((item) => ({ date: item.date, actual: item.price, forecast: null })),
    ...predictions.map((item) => ({ date: item.date, actual: null, forecast: item.predicted_price }))
  ];

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-[#0B1220] px-4 pb-8 pt-32 md:ml-64 md:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col justify-between gap-4 rounded-2xl border border-[#1F2937] bg-[#111827] p-6 shadow-sm sm:flex-row sm:items-center">
            <div>
              <h1 className="text-3xl font-bold text-[#F9FAFB]">Forecast</h1>
              <p className="mt-2 text-sm text-[#9CA3AF]">Historical prices and Linear Regression predictions.</p>
            </div>

            <select className="rounded-2xl border border-[#1F2937] bg-[#0B1220] px-3 py-3 text-[#F9FAFB]" onChange={(event) => setCoinId(event.target.value)} value={coinId}>
              {coins.map((coin) => (
                <option key={coin.id} value={coin.id}>
                  {coin.symbol} - {coin.name}
                </option>
              ))}
            </select>
          </div>

          {message && <p className="mt-4 rounded-2xl border border-[#1F2937] bg-[#111827] p-3 text-sm text-[#EF4444]">{message}</p>}
          {loading && <p className="mt-4 rounded-2xl border border-[#1F2937] bg-[#111827] p-3 text-sm text-[#9CA3AF]">Loading forecast data...</p>}

          <section className="mt-6 rounded-2xl border border-[#1F2937] bg-[#111827] p-6 shadow-sm">
            <h2 className="mb-4 text-2xl font-bold text-[#F9FAFB]">Historical Price Chart and Forecast Line</h2>
            <Chart data={chartData} xKey="date" yKey="actual" secondYKey="forecast" />
          </section>

          <section className="mt-6 rounded-2xl border border-[#1F2937] bg-[#111827] p-6 shadow-sm">
            <h2 className="mb-4 text-2xl font-bold text-[#F9FAFB]">Predicted Prices</h2>
            <Table
              columns={[
                { key: "year", label: "Years Ahead" },
                { key: "date", label: "Forecast Date" },
                { key: "predicted_price", label: "Predicted Price", render: (row) => money(row.predicted_price) }
              ]}
              rows={predictions}
            />
          </section>
        </div>
      </main>
    </>
  );
}

export default Forecast;
