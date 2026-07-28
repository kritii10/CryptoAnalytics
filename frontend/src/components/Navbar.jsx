import React from "react";
import {
  Bell,
  LayoutDashboard,
  LineChart,
  LogOut,
  Search,
  Wallet
} from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";

function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const items = [
    { to: "/", label: "Dashboard", icon: LayoutDashboard },
    { to: "/portfolio", label: "Portfolio", icon: Wallet },
    { to: "/forecast", label: "Forecast", icon: LineChart }
  ];

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  }

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-[#1F2937] bg-[#0B1220] md:flex md:flex-col">
        <div className="border-b border-[#1F2937] px-6 py-6">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#1D4ED8] text-lg font-black text-white">
              C
            </div>
            <div>
              <p className="text-lg font-semibold text-[#F9FAFB]">CryptoAnalytics</p>
              <p className="text-xs text-[#9CA3AF]">Crypto Portfolio</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-4 py-6">
          <p className="px-4 pb-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#6B7280]">Navigation</p>
          <div className="space-y-2">
            {items.map((item) => {
              const Icon = item.icon;

              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition ${
                      isActive
                        ? "border border-[#1E3A8A] bg-[#0F172A] text-[#BFDBFE]"
                        : "border border-transparent text-[#9CA3AF] hover:bg-[#111827] hover:text-[#F9FAFB]"
                    }`
                  }
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </div>
        </nav>

        <div className="border-t border-[#1F2937] px-4 py-4">
          <div className="rounded-2xl bg-[#111827] p-4">
            <p className="text-sm font-medium text-[#F9FAFB]">{user.name || "Demo User"}</p>
            <p className="mt-1 text-xs text-[#9CA3AF]">{user.email || "demo@example.com"}</p>
            <button
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-[#1F2937] px-3 py-2 text-sm font-medium text-[#F9FAFB] hover:border-[#3B82F6] hover:text-[#93C5FD]"
              onClick={logout}
            >
              <LogOut size={16} />
              Logout
            </button>
          </div>
        </div>
      </aside>

      <header className="fixed top-0 z-20 w-full border-b border-[#1F2937] bg-[#0B1220]/98 backdrop-blur md:left-64 md:w-[calc(100%-16rem)]">
        <div className="flex flex-col gap-4 px-4 py-4 md:px-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[#9CA3AF]">Dashboard</p>
              <h1 className="text-lg font-semibold text-[#F9FAFB]">
                {items.find((item) => item.to === location.pathname)?.label || "Dashboard"}
              </h1>
            </div>

            <div className="hidden items-center gap-3 md:flex">
              <div className="flex items-center gap-2 rounded-2xl border border-[#1F2937] bg-[#111827] px-3 py-2 text-sm text-[#9CA3AF]">
                <Search size={16} />
                <span>Search assets or tables</span>
              </div>
              <button className="rounded-2xl border border-[#1F2937] bg-[#111827] p-2 text-[#9CA3AF] hover:text-[#F9FAFB]">
                <Bell size={18} />
              </button>
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#1D4ED8] text-sm font-semibold text-white">
                {(user.name || "D").slice(0, 1)}
              </div>
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto md:hidden">
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `whitespace-nowrap rounded-2xl px-3 py-2 text-sm font-medium ${
                    isActive ? "bg-[#172554] text-[#93C5FD]" : "bg-[#111827] text-[#9CA3AF]"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        </div>
      </header>
    </>
  );
}

export default Navbar;
