const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { jwtExpiresIn, jwtSecret, requireAuth } = require("./config");
const { readRequestPayload } = require("./requestCrypto");
const { getUserByUsername, touchLastLogin } = require("./userStore");

function isBcryptHash(value) {
  return typeof value === "string" && /^\$2[aby]\$\d{2}\$/.test(value);
}

async function verifyPassword(plainPassword, storedPassword) {
  if (isBcryptHash(storedPassword)) {
    return bcrypt.compare(String(plainPassword || ""), storedPassword);
  }
  return String(plainPassword || "") === String(storedPassword || "");
}

function issueToken(user) {
  const payload = {
    sub: user.username,
    role: user.role,
  };

  return jwt.sign(
    payload,
    jwtSecret,
    { expiresIn: jwtExpiresIn }
  );
}

async function login(req, res) {
  const parsed = readRequestPayload(req.body, req.requestPayloadOptions || {});
  if (!parsed.ok) {
    return res.status(400).json({ ok: false, error: parsed.error });
  }

  const { username, password } = parsed.payload || {};
  if (!username || !password) {
    return res.status(400).json({ ok: false, error: "username/password is required" });
  }

  const user = await getUserByUsername(String(username));
  if (!user) {
    return res.status(401).json({ ok: false, error: "invalid credentials" });
  }
  if (String(user.status || "active") !== "active") {
    return res.status(403).json({ ok: false, error: "user is disabled" });
  }

  const passed = await verifyPassword(password, user.passwordHash);
  if (!passed) {
    return res.status(401).json({ ok: false, error: "invalid credentials" });
  }

  const token = issueToken(user);
  try {
    await touchLastLogin(user.username);
  } catch (_err) {
    // ignore login timestamp errors
  }
  return res.json({
    ok: true,
    token,
    user: {
      username: user.username,
      role: user.role,
    },
    expiresIn: jwtExpiresIn,
    encryptedRequest: parsed.encrypted,
  });
}

function authenticate(req, res, next) {
  if (!requireAuth) {
    req.user = { username: "anonymous", role: "" };
    return next();
  }

  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ ok: false, error: "missing bearer token" });
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    return res.status(401).json({ ok: false, error: "missing bearer token" });
  }

  try {
    const payload = jwt.verify(token, jwtSecret);
    req.user = {
      username: payload.sub,
      role: payload.role || "",
    };

    return next();
  } catch (_err) {
    return res.status(401).json({ ok: false, error: "invalid or expired token" });
  }
}

module.exports = {
  authenticate,
  login,
};
