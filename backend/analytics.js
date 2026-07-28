const express = require("express");
const axios = require("axios");
const { spawn } = require("child_process");
const path = require("path");
const pool = require("./db");
const { requireAuth } = require("./middleware");

const router = express.Router();

async function loadHistoricalPrices(coinId) {
  const result = await pool.query(
    `SELECT price_date, price_usd
     FROM price_history
     WHERE coin_id = $1
     ORDER BY price_date`,
    [coinId]
  );

  return result.rows;
}

function buildForecastFromRows(rows) {
  if (rows.length < 2) {
    return { historical: [], predictions: [] };
  }

  const firstDate = new Date(rows[0].price_date);
  const historical = rows.map((row) => ({
    date: row.price_date,
    price: Number(Number(row.price_usd).toFixed(2))
  }));

  const points = rows.map((row) => {
    const dayNumber = Math.round((new Date(row.price_date) - firstDate) / (1000 * 60 * 60 * 24));
    return { x: dayNumber, y: Number(row.price_usd) };
  });

  const count = points.length;
  const sumX = points.reduce((total, point) => total + point.x, 0);
  const sumY = points.reduce((total, point) => total + point.y, 0);
  const sumXY = points.reduce((total, point) => total + point.x * point.y, 0);
  const sumXX = points.reduce((total, point) => total + point.x * point.x, 0);
  const denominator = count * sumXX - sumX * sumX;
  const slope = denominator === 0 ? 0 : (count * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / count;

  const lastDate = new Date(rows[rows.length - 1].price_date);
  const years = [1, 2, 3, 5];
  const predictions = years.map((year) => {
    const futureDate = new Date(lastDate);
    futureDate.setDate(futureDate.getDate() + 365 * year);

    const futureDayNumber = Math.round((futureDate - firstDate) / (1000 * 60 * 60 * 24));
    const predictedPrice = intercept + slope * futureDayNumber;

    return {
      year,
      date: futureDate.toISOString().slice(0, 10),
      predicted_price: Number(predictedPrice.toFixed(2))
    };
  });

  return { historical, predictions };
}

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

router.get("/forecast/:coinId", requireAuth, async (req, res) => {
  const fallbackRows = await loadHistoricalPrices(req.params.coinId);
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
      return res.json(buildForecastFromRows(fallbackRows));
    }

    try {
      res.json(JSON.parse(output));
    } catch (error) {
      res.json(buildForecastFromRows(fallbackRows));
    }
  });

  python.on("error", async () => {
    res.json(buildForecastFromRows(fallbackRows));
  });
});

module.exports = router;
