const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const pool = require("./db");
const authRoutes = require("./auth");
const transactionRoutes = require("./transactions");
const analyticsRoutes = require("./analytics");

const app = express();
const PORT = process.env.PORT || 5000;
const distPath = path.join(__dirname, "..", "frontend", "dist");
const indexPath = path.join(distPath, "index.html");
const hasFrontendBuild = fs.existsSync(indexPath);

app.use(cors());
app.use(express.json());

if (!hasFrontendBuild) {
  app.get("/", (req, res) => {
    res.json({ message: "Crypto Analytics API is running" });
  });
}

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", database: "connected" });
  } catch (error) {
    res.status(500).json({ status: "error", database: "not connected" });
  }
});

app.get("/api/coins", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM coins ORDER BY name");
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: "Could not load coins" });
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/analytics", analyticsRoutes);

if (hasFrontendBuild) {
  app.use(express.static(distPath));

  app.get("*", (req, res) => {
    res.sendFile(indexPath);
  });
}

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
