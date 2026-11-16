const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME || "crypto_analytics",
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  // Return a useful API error promptly when PostgreSQL is not running instead
  // of leaving requests (and the test runner) waiting on a socket forever.
  connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS || 5000)
});

module.exports = pool;
