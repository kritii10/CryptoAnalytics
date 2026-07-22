import React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

const colors = ["#22d3ee", "#84cc16", "#f97316", "#eab308", "#f43f5e", "#38bdf8"];

function Chart({ type = "line", data = [], xKey, yKey, secondYKey }) {
  if (!data.length) {
    return <div className="rounded-2xl border border-[#1F2937] p-6 text-center text-[#9CA3AF]">No chart data</div>;
  }

  const tooltipStyle = {
    background: "#0F172A",
    border: "1px solid #1F2937",
    borderRadius: 16,
    color: "#F9FAFB"
  };

  if (type === "pie") {
    return (
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie data={data} dataKey={yKey} nameKey={xKey} innerRadius={48} outerRadius={95} paddingAngle={3} label>
            {data.map((entry, index) => (
              <Cell key={entry[xKey]} fill={colors[index % colors.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (type === "bar") {
    return (
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" vertical={false} />
          <XAxis dataKey={xKey} stroke="#94a3b8" />
          <YAxis stroke="#94a3b8" />
          <Tooltip contentStyle={tooltipStyle} />
          <Bar dataKey={yKey} fill="#3B82F6" radius={[8, 8, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" vertical={false} />
        <XAxis dataKey={xKey} stroke="#94a3b8" />
        <YAxis stroke="#94a3b8" />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend />
        <Line type="monotone" dataKey={yKey} stroke="#3B82F6" strokeWidth={3} dot={false} />
        {secondYKey && <Line type="monotone" dataKey={secondYKey} stroke="#22C55E" strokeWidth={2.5} dot={false} />}
      </LineChart>
    </ResponsiveContainer>
  );
}

export default Chart;
