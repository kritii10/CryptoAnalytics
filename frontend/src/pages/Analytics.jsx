import React from "react";
import { ExternalLink, LineChart } from "lucide-react";
import Navbar from "../components/Navbar.jsx";

const analyticsUrl = import.meta.env.VITE_ANALYTICS_URL || "http://localhost:8501";

function Analytics() {
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-[#0B1220] px-4 pb-8 pt-32 md:ml-64 md:px-8">
        <div className="mx-auto max-w-7xl">
          <section className="rounded-2xl border border-[#1F2937] bg-[#111827] p-6 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex gap-4">
                <div className="rounded-2xl bg-[#172554] p-3 text-[#93C5FD]">
                  <LineChart size={24} />
                </div>
                <div>
                  <p className="text-sm font-medium uppercase tracking-[0.2em] text-[#9CA3AF]">Research workspace</p>
                  <h1 className="mt-1 text-3xl font-bold text-[#F9FAFB]">Market Analytics</h1>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-[#9CA3AF]">
                    Explore risk metrics, correlations, walk-forward forecast evaluation, and portfolio accounting.
                  </p>
                </div>
              </div>
              <a
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#3B82F6] px-4 py-3 text-sm font-semibold text-white hover:bg-blue-500"
                href={analyticsUrl}
                rel="noreferrer"
                target="_blank"
              >
                Open in new tab <ExternalLink size={16} />
              </a>
            </div>
          </section>

          <section className="mt-6 overflow-hidden rounded-2xl border border-[#1F2937] bg-white shadow-sm">
            <iframe
              className="h-[calc(100vh-15rem)] min-h-[720px] w-full border-0"
              src={analyticsUrl}
              title="Crypto Analytics dashboard"
            >
              Your browser does not support embedded analytics. Use “Open in new tab” above.
            </iframe>
          </section>
        </div>
      </main>
    </>
  );
}

export default Analytics;
