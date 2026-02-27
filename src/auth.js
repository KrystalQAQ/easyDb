const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const {
  jwtAudience,
  jwtExpiresIn,
  jwtIssuer,
  jwtSecret,
  requireAuth,
} = require("./config");
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
  const signOptions = { expiresIn: jwtExpiresIn };
  if (jwtIssuer) signOptions.issuer = jwtIssuer;
  if (jwtAudience) signOptions.audience = jwtAudience;

  return jwt.sign(payload, jwtSecret, signOptions);
}

async function login(req, res) {
  const parsed = readRequestPayload(req.body, req.requestPayloadOptions || {});
  if (!parsed.ok) {
    return res.status(400).json({ ok: false, error: parsed.error });
  }

  const { username, password } = parsed.payload || {};
  if (!username || !password) {
    return res.status(400).json({ ok: false, error: "用户名和密码不能为空" });
  }

  const user = await getUserByUsername(String(username));
  if (!user) {
    return res.status(401).json({ ok: false, error: "用户名或密码错误" });
  }
  if (String(user.status || "active") !== "active") {
    return res.status(403).json({ ok: false, error: "账号已被禁用" });
  }

  const passed = await verifyPassword(password, user.passwordHash);
  if (!passed) {
    return res.status(401).json({ ok: false, error: "用户名或密码错误" });
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
    return res.status(401).json({ ok: false, error: "缺少 Bearer Token" });
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    return res.status(401).json({ ok: false, error: "缺少 Bearer Token" });
  }

  const verifyOptions = {};
  if (jwtIssuer) verifyOptions.issuer = jwtIssuer;
  if (jwtAudience) verifyOptions.audience = jwtAudience;

  try {
    const payload = jwt.verify(token, jwtSecret, verifyOptions);
    req.user = { username: payload.sub || payload.username || "", role: payload.role || "" };
    return next();
  } catch (_error) {
    return res.status(401).json({ ok: false, error: "Token 无效或已过期" });
  }
}

module.exports = {
  authenticate,
  login,
};
