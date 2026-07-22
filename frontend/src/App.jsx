import React from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Portfolio from "./pages/Portfolio.jsx";
import Forecast from "./pages/Forecast.jsx";
import Navbar from "./components/Navbar.jsx";

function ProtectedRoute({ children }) {
  const token = localStorage.getItem("token");
  return token ? children : <Navigate to="/login" replace />;
}

function Settings() {
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-[#0B1220] px-4 pb-8 pt-32 md:ml-64 md:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="rounded-2xl border border-[#1F2937] bg-[#111827] p-6 shadow-sm">
            <p className="text-sm font-medium text-[#9CA3AF]">Settings</p>
            <h1 className="mt-2 text-3xl font-bold text-[#F9FAFB]">Workspace Settings</h1>
            <p className="mt-3 max-w-2xl text-sm text-[#9CA3AF]">
              This section is ready for future profile, preferences and notification settings without changing the current backend.
            </p>
          </div>
        </div>
      </main>
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/portfolio"
          element={
            <ProtectedRoute>
              <Portfolio />
            </ProtectedRoute>
          }
        />
        <Route
          path="/forecast"
          element={
            <ProtectedRoute>
              <Forecast />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <Settings />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
