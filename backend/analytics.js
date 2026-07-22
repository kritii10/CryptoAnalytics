const express = require("express");
const axios = require("axios");
const { spawn } = require("child_process");
const path = require("path");
const pool = require("./db");
const { requireAuth } = require("./middleware");

const router = express.Router();

router.get("/summary", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
          COALESCE(SUM(p.quantity * c.current_price_usd), 0) AS portfolio_value,
          COALESCE(SUM(p.quantity * p.average_buy_price), 0) AS total_investment,
          COALESCE(SUM((c.current_price_usd - p.average_buy_price) * p.quantity), 0) AS profit_loss,
          COUNT(p.id) AS total_assets
       FROM portfolio p
       JOIN coins c ON c.id = p.coin_id
       WHERE p.user_id = $1`,
      [req.user.id]
    );
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: "Could not load portfolio summary" });
  }
});

router.get("/portfolio", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.id AS coin_id, c.name, c.symbol, p.quantity, p.average_buy_price,
              c.current_price_usd,
              p.quantity * c.current_price_usd AS current_value,
              (c.current_price_usd - p.average_buy_price) * p.quantity AS profit_loss
       FROM portfolio p
       JOIN coins c ON c.id = p.coin_id
       WHERE p.user_id = $1
       ORDER BY current_value DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: "Could not load portfolio" });
  }
});

router.get("/allocation", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.symbol, c.name, SUM(p.quantity * c.current_price_usd) AS value
       FROM portfolio p
       JOIN coins c ON c.id = p.coin_id
       WHERE p.user_id = $1
       GROUP BY c.symbol, c.name
       ORDER BY value DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: "Could not load allocation" });
  }
});

router.get("/top-performing", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.symbol, c.name,
              AVG((c.current_price_usd - p.average_buy_price) / NULLIF(p.average_buy_price, 0) * 100) AS gain_percent
       FROM portfolio p
       JOIN coins c ON c.id = p.coin_id
       WHERE p.user_id = $1
       GROUP BY c.symbol, c.name
       ORDER BY gain_percent DESC
       LIMIT 1`,
      [req.user.id]
    );
    res.json(result.rows[0] || null);
  } catch (error) {
    res.status(500).json({ message: "Could not load top performer" });
  }
});

router.get("/monthly-investment", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT TO_CHAR(transaction_date, 'YYYY-MM') AS month,
              SUM(total_usd) AS amount,
              COUNT(*) AS transaction_count
       FROM transactions
       WHERE user_id = $1 AND transaction_type = 'buy'
       GROUP BY TO_CHAR(transaction_date, 'YYYY-MM')
       ORDER BY month`,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: "Could not load monthly investment" });
  }
});

router.get("/watchlist", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT w.id, c.id AS coin_id, c.name, c.symbol, c.current_price_usd
       FROM watchlist w
       JOIN coins c ON c.id = w.coin_id
       WHERE w.user_id = $1
       ORDER BY c.name`,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: "Could not load watchlist" });
  }
});

router.post("/watchlist", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `INSERT INTO watchlist (user_id, coin_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, coin_id) DO NOTHING
       RETURNING *`,
      [req.user.id, req.body.coin_id]
    );

    res.status(201).json(result.rows[0] || { message: "Already in watchlist" });
  } catch (error) {
    res.status(500).json({ message: "Could not update watchlist" });
  }
});

router.delete("/watchlist/:coinId", requireAuth, async (req, res) => {
  try {
    await pool.query("DELETE FROM watchlist WHERE user_id = $1 AND coin_id = $2", [
      req.user.id,
      req.params.coinId
    ]);

    res.json({ message: "Removed from watchlist" });
  } catch (error) {
    res.status(500).json({ message: "Could not remove watchlist item" });
  }
});

router.post("/refresh-prices", requireAuth, async (req, res) => {
  try {
    const coins = await pool.query("SELECT id, coingecko_id FROM coins ORDER BY id");
    const ids = coins.rows.map((coin) => coin.coingecko_id).join(",");

    const response = await axios.get("https://api.coingecko.com/api/v3/simple/price", {
      params: { ids, vs_currencies: "usd" }
    });

    for (const coin of coins.rows) {
      const price = response.data[coin.coingecko_id]?.usd;

      if (price) {
        await pool.query("UPDATE coins SET current_price_usd = $1 WHERE id = $2", [price, coin.id]);
      }
    }

    res.json({ message: "Prices refreshed" });
  } catch (error) {
    res.status(500).json({ message: "Could not refresh prices" });
  }
});

router.get("/forecast/:coinId", requireAuth, (req, res) => {
  const scriptPath = path.join(__dirname, "..", "forecast", "predict.py");
  const python = spawn("python3", [scriptPath, req.params.coinId]);
  let output = "";
  let errors = "";

  python.stdout.on("data", (data) => {
    output += data.toString();
  });

  python.stderr.on("data", (data) => {
    errors += data.toString();
  });

  python.on("close", (code) => {
    if (code !== 0) {
      return res.status(500).json({ message: "Forecast failed", details: errors.trim() });
    }

    try {
      res.json(JSON.parse(output));
    } catch (error) {
      res.status(500).json({ message: "Forecast returned invalid data" });
    }
  });
});

module.exports = router;
