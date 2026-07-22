import bcrypt from "bcrypt";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import app from "../backend/server.js";
import pool from "../backend/db.js";

const testEmail = `test_${Date.now()}@example.com`;
const testPassword = "password123";
const testDate = "2026-07-22";

let token = "";
let userId = 0;
let coinId = 0;
let transactionId = 0;

beforeAll(async () => {
  const coinResult = await pool.query(
    `SELECT c.id
     FROM coins c
     JOIN price_history p ON p.coin_id = c.id
     GROUP BY c.id
     ORDER BY c.id
     LIMIT 1`
  );

  if (!coinResult.rows.length) {
    throw new Error("Tests need at least one coin with price history");
  }

  coinId = coinResult.rows[0].id;
});

afterAll(async () => {
  if (userId) {
    await pool.query("DELETE FROM users WHERE id = $1", [userId]);
  }

  await pool.end();
});

describe("Crypto Analytics API", () => {
  it("returns a healthy database status", async () => {
    const response = await request(app).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok", database: "connected" });
  });

  it("registers a user and stores a hashed password", async () => {
    const response = await request(app).post("/api/auth/register").send({
      name: "Test User",
      email: testEmail,
      password: testPassword
    });

    expect(response.status).toBe(201);
    expect(response.body.email).toBe(testEmail);

    userId = response.body.id;

    const userResult = await pool.query("SELECT password_hash FROM users WHERE id = $1", [userId]);
    const passwordHash = userResult.rows[0].password_hash;

    expect(passwordHash).not.toBe(testPassword);
    expect(await bcrypt.compare(testPassword, passwordHash)).toBe(true);
  });

  it("logs in and returns a JWT token", async () => {
    const response = await request(app).post("/api/auth/login").send({
      email: testEmail,
      password: testPassword
    });

    expect(response.status).toBe(200);
    expect(response.body.user.email).toBe(testEmail);
    expect(response.body.token).toBeTruthy();

    token = response.body.token;
  });

  it("creates a transaction and updates the portfolio", async () => {
    const response = await request(app)
      .post("/api/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        coin_id: coinId,
        transaction_type: "buy",
        quantity: 0.01,
        price_usd: 60000,
        transaction_date: testDate
      });

    expect(response.status).toBe(201);
    expect(Number(response.body.total_usd)).toBe(600);

    transactionId = response.body.id;

    const portfolioResult = await pool.query(
      "SELECT quantity, average_buy_price FROM portfolio WHERE user_id = $1 AND coin_id = $2",
      [userId, coinId]
    );

    expect(Number(portfolioResult.rows[0].quantity)).toBe(0.01);
    expect(Number(portfolioResult.rows[0].average_buy_price)).toBe(60000);
  });

  it("returns transaction history for the logged-in user", async () => {
    const response = await request(app)
      .get("/api/transactions")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.some((row) => row.id === transactionId)).toBe(true);
  });

  it("returns analytics summary data", async () => {
    const response = await request(app)
      .get("/api/analytics/summary")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(Number(response.body.portfolio_value)).toBeGreaterThan(0);
    expect(Number(response.body.total_investment)).toBe(600);
  });

  it("returns forecast data from the Python module", async () => {
    const response = await request(app)
      .get(`/api/analytics/forecast/${coinId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.historical.length).toBeGreaterThan(0);
    expect(response.body.predictions.length).toBeGreaterThan(0);
  }, 15000);

  it("deletes a transaction", async () => {
    const response = await request(app)
      .delete(`/api/transactions/${transactionId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.message).toBe("Transaction deleted");

    const transactionResult = await pool.query("SELECT id FROM transactions WHERE id = $1", [transactionId]);
    expect(transactionResult.rows.length).toBe(0);
  });
});
