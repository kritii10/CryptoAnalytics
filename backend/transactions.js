const express = require("express");
const pool = require("./db");
const { requireAuth } = require("./middleware");

const router = express.Router();

async function updatePortfolio(userId, coinId) {
  const result = await pool.query(
    `SELECT
        COALESCE(SUM(CASE WHEN transaction_type = 'buy' THEN quantity ELSE -quantity END), 0) AS quantity,
        COALESCE(SUM(CASE WHEN transaction_type = 'buy' THEN total_usd ELSE 0 END), 0) AS buy_total,
        COALESCE(SUM(CASE WHEN transaction_type = 'buy' THEN quantity ELSE 0 END), 0) AS buy_quantity
     FROM transactions
     WHERE user_id = $1 AND coin_id = $2`,
    [userId, coinId]
  );

  const row = result.rows[0];
  const quantity = Number(row.quantity);
  const buyQuantity = Number(row.buy_quantity);
  const averagePrice = buyQuantity > 0 ? Number(row.buy_total) / buyQuantity : 0;

  if (quantity <= 0) {
    await pool.query("DELETE FROM portfolio WHERE user_id = $1 AND coin_id = $2", [userId, coinId]);
    return;
  }

  await pool.query(
    `INSERT INTO portfolio (user_id, coin_id, quantity, average_buy_price, updated_at)
     VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
     ON CONFLICT (user_id, coin_id)
     DO UPDATE SET quantity = $3, average_buy_price = $4, updated_at = CURRENT_TIMESTAMP`,
    [userId, coinId, quantity, averagePrice]
  );
}

router.get("/", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT t.id, t.transaction_type, t.quantity, t.price_usd, t.total_usd,
              t.transaction_date, c.symbol, c.name
       FROM transactions t
       JOIN coins c ON c.id = t.coin_id
       WHERE t.user_id = $1
       ORDER BY t.transaction_date DESC, t.id DESC`,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: "Could not load transactions" });
  }
});

router.post("/", requireAuth, async (req, res) => {
  try {
    const { coin_id, transaction_type, quantity, price_usd, transaction_date } = req.body;

    if (!coin_id || !transaction_type || !quantity || !price_usd || !transaction_date) {
      return res.status(400).json({ message: "All transaction fields are required" });
    }

    if (!["buy", "sell"].includes(transaction_type)) {
      return res.status(400).json({ message: "Transaction type must be buy or sell" });
    }

    const totalUsd = Number(quantity) * Number(price_usd);

    const result = await pool.query(
      `INSERT INTO transactions
        (user_id, coin_id, transaction_type, quantity, price_usd, total_usd, transaction_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [req.user.id, coin_id, transaction_type, quantity, price_usd, totalUsd, transaction_date]
    );

    await updatePortfolio(req.user.id, coin_id);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: "Could not save transaction" });
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const deleted = await pool.query(
      "DELETE FROM transactions WHERE id = $1 AND user_id = $2 RETURNING coin_id",
      [req.params.id, req.user.id]
    );

    if (deleted.rowCount === 0) {
      return res.status(404).json({ message: "Transaction not found" });
    }

    await updatePortfolio(req.user.id, deleted.rows[0].coin_id);
    res.json({ message: "Transaction deleted" });
  } catch (error) {
    res.status(500).json({ message: "Could not delete transaction" });
  }
});

module.exports = router;
