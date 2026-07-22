import React, { useState } from "react";
import { ArrowRight, ChartNoAxesCombined, Lock, Mail } from "lucide-react";
import { useNavigate } from "react-router-dom";
import api from "../api.js";

function Login() {
  const navigate = useNavigate();
  const [isRegistering, setIsRegistering] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [message, setMessage] = useState("");

  function updateField(event) {
    setForm({ ...form, [event.target.name]: event.target.value });
  }

  async function loginWithDemo() {
    setMessage("");

    try {
      const response = await api.post("/auth/login", {
        email: "demo@example.com",
        password: "password123"
      });

      localStorage.setItem("token", response.data.token);
      localStorage.setItem("user", JSON.stringify(response.data.user));
      navigate("/");
    } catch (error) {
      setMessage(error.response?.data?.message || "Demo login failed");
    }
  }

  async function submitForm(event) {
    event.preventDefault();
    setMessage("");

    try {
      if (isRegistering) {
        await api.post("/auth/register", form);
        setIsRegistering(false);
        setMessage("Registration complete. Please login.");
        return;
      }

      const response = await api.post("/auth/login", {
        email: form.email,
        password: form.password
      });

      localStorage.setItem("token", response.data.token);
      localStorage.setItem("user", JSON.stringify(response.data.user));
      navigate("/");
    } catch (error) {
      setMessage(error.response?.data?.message || "Something went wrong");
    }
  }

  return (
    <main className="min-h-screen bg-[#0B1220] px-4 py-8">
      <section className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl items-center gap-10 lg:grid-cols-[0.88fr_1.12fr]">
        <div className="mx-auto w-full max-w-md rounded-2xl border border-[#1F2937] bg-[#111827] p-8 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#1D4ED8] text-white">
              <ChartNoAxesCombined size={22} />
            </div>
            <div>
              <p className="text-xl font-bold text-[#F9FAFB]">CryptoAnalytics</p>
              <p className="text-sm text-[#9CA3AF]">Cryptocurrency reporting platform</p>
            </div>
          </div>

          <div className="mt-8">
            <h1 className="text-3xl font-bold text-[#F9FAFB]">CryptoAnalytics</h1>
            <p className="mt-3 text-sm leading-6 text-[#9CA3AF]">
              Professional cryptocurrency portfolio tracking and forecasting platform.
            </p>
          </div>

          <form className="mt-8 space-y-4" onSubmit={submitForm}>
            {isRegistering && (
              <input
                className="w-full rounded-2xl border border-[#1F2937] bg-[#0B1220] px-4 py-3 text-[#F9FAFB] outline-none focus:border-[#3B82F6]"
                autoComplete="name"
                name="name"
                onChange={updateField}
                placeholder="Name"
                value={form.name}
              />
            )}

            <label className="block">
              <span className="mb-2 flex items-center gap-2 text-sm font-medium text-[#F9FAFB]">
                <Mail size={15} />
                Email
              </span>
              <input
                className="w-full rounded-2xl border border-[#1F2937] bg-[#0B1220] px-4 py-3 text-[#F9FAFB] outline-none focus:border-[#3B82F6]"
                autoComplete="email"
                name="email"
                onChange={updateField}
                placeholder="you@example.com"
                type="email"
                value={form.email}
              />
            </label>

            <label className="block">
              <span className="mb-2 flex items-center gap-2 text-sm font-medium text-[#F9FAFB]">
                <Lock size={15} />
                Password
              </span>
              <input
                className="w-full rounded-2xl border border-[#1F2937] bg-[#0B1220] px-4 py-3 text-[#F9FAFB] outline-none focus:border-[#3B82F6]"
                autoComplete={isRegistering ? "new-password" : "current-password"}
                name="password"
                onChange={updateField}
                placeholder="Enter your password"
                type="password"
                value={form.password}
              />
            </label>

            {message && <p className="rounded-2xl border border-[#1F2937] bg-[#0B1220] p-3 text-sm text-[#EF4444]">{message}</p>}

            <button className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#1D4ED8] px-4 py-3 font-semibold text-white hover:bg-blue-700">
              {isRegistering ? "Register" : "Login"}
              <ArrowRight size={16} />
            </button>
          </form>

          {!isRegistering && (
            <button
              className="mt-3 w-full rounded-2xl border border-[#1F2937] bg-[#0B1220] px-4 py-3 font-semibold text-[#F9FAFB] hover:border-[#3B82F6]"
              onClick={loginWithDemo}
              type="button"
            >
              Demo Login
            </button>
          )}

          <button className="mt-5 text-sm font-medium text-[#9CA3AF] hover:text-[#F9FAFB]" onClick={() => setIsRegistering(!isRegistering)} type="button">
            {isRegistering ? "Already registered? Login" : "New user? Register"}
          </button>

          <p className="mt-8 text-xs text-[#9CA3AF]">Powered by CoinGecko</p>
        </div>

        <div className="hidden rounded-[32px] border border-[#1F2937] bg-[#111827] p-10 lg:block">
          <div className="flex h-full min-h-[640px] flex-col justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-[#9CA3AF]">Operations snapshot</p>
              <h2 className="mt-4 max-w-lg text-5xl font-bold leading-tight text-[#F9FAFB]">
                Make portfolio reporting feel structured, calm and credible.
              </h2>
            </div>

            <div className="relative mt-10 h-80 rounded-[28px] border border-[#1F2937] bg-[#0B1220] p-8">
              <div className="absolute left-8 top-8 h-28 w-28 rounded-full border border-[#1F2937]" />
              <div className="absolute left-14 top-14 h-24 w-24 rounded-full border border-[#1D4ED8]" />
              <div className="absolute right-8 top-10 rounded-2xl border border-[#1F2937] bg-[#111827] px-5 py-4">
                <p className="text-xs text-[#9CA3AF]">Data freshness</p>
                <p className="mt-2 text-2xl font-bold text-[#F9FAFB]">09:42</p>
                <p className="mt-1 text-sm text-[#22C55E]">Synced successfully</p>
              </div>
              <div className="absolute bottom-8 left-8 right-8 rounded-[24px] border border-[#1F2937] bg-[#111827] p-6">
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-sm text-[#9CA3AF]">Portfolio exposure</p>
                    <p className="mt-2 text-3xl font-bold text-[#F9FAFB]">$18,420</p>
                  </div>
                  <span className="rounded-full bg-[#0B1220] px-3 py-1 text-xs font-medium text-[#9CA3AF]">Confidence range</span>
                </div>
                <div className="mt-6 grid grid-cols-6 gap-3">
                  {[28, 34, 40, 46, 54, 58].map((height, index) => (
                    <div className="flex items-end" key={index}>
                      <div className="w-full rounded-t-2xl bg-[#1D4ED8]" style={{ height }} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

export default Login;
