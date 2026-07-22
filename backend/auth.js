const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const pool = require("./db");
const { JWT_SECRET } = require("./middleware");

const router = express.Router();

router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email and password are required" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      "INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email",
      [name, email, passwordHash]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ message: "Email already registered" });
    }

    res.status(500).json({ message: "Registration failed" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatches) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, {
      expiresIn: "1d"
    });

    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email }
    });
  } catch (error) {
    res.status(500).json({ message: "Login failed" });
  }
});

module.exports = router;
