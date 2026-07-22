const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "learning_secret_change_later";

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Login required" });
  }

  try {
    const token = authHeader.split(" ")[1];
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (error) {
    res.status(401).json({ message: "Invalid or expired token" });
  }
}

module.exports = { requireAuth, JWT_SECRET };
