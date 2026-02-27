const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const {
  authCode,
  jwtAudience,
  jwtExpiresIn,
  jwtIssuer,
  jwtSecret,
  requireAuth,
} = require("./config");
const { readRequestPayload } = require("./requestCrypto");
const {
  buildAuthorizeRedirectUrl,
  consumeAuthCode,
  issueAuthCode,
} = require("./authCodeStore");
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

async function verifyUserCredentials(username, password) {
  const user = await getUserByUsername(String(username));
  if (!user) {
    return { ok: false, status: 401, error: "用户名或密码错误" };
  }
  if (String(user.status || "active") !== "active") {
    return { ok: false, status: 403, error: "账号已被禁用" };
  }

  const passed = await verifyPassword(password, user.passwordHash);
  if (!passed) {
    return { ok: false, status: 401, error: "用户名或密码错误" };
  }
  return { ok: true, user };
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

  const verified = await verifyUserCredentials(username, password);
  if (!verified.ok) {
    return res.status(verified.status).json({ ok: false, error: verified.error });
  }
  const user = verified.user;

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

async function authorize(req, res) {
  const parsed = readRequestPayload(req.body, req.requestPayloadOptions || {});
  if (!parsed.ok) {
    return res.status(400).json({ ok: false, error: parsed.error });
  }

  const {
    username,
    password,
    client = "",
    redirect = "",
    state = "",
  } = parsed.payload || {};

  if (!redirect) {
    return res.status(400).json({ ok: false, error: "redirect 不能为空" });
  }

  // 已登录模式：请求头携带有效 Bearer Token，无需再验证密码
  const authHeader = req.headers.authorization || "";
  if (authHeader.startsWith("Bearer ")) {
    const bearerToken = authHeader.slice("Bearer ".length).trim();
    const verifyOptions = {};
    if (jwtIssuer) verifyOptions.issuer = jwtIssuer;
    if (jwtAudience) verifyOptions.audience = jwtAudience;
    let jwtPayload;
    try {
      jwtPayload = jwt.verify(bearerToken, jwtSecret, verifyOptions);
    } catch (_err) {
      return res.status(401).json({ ok: false, error: "Token 无效或已过期，请重新登录" });
    }
    const tokenUser = { username: jwtPayload.sub || jwtPayload.username || "", role: jwtPayload.role || "" };
    let issued;
    try {
      issued = issueAuthCode({ token: bearerToken, user: tokenUser, client, redirect, state });
    } catch (err) {
      return res.status(400).json({ ok: false, error: err.message });
    }
    return res.json({
      ok: true,
      code: issued.code,
      codeExpiresInSeconds: authCode.ttlSeconds,
      redirectTo: buildAuthorizeRedirectUrl(redirect, { code: issued.code, state: String(state || "").trim() }),
      user: tokenUser,
    });
  }

  // 未登录模式：用 username + password 验证
  if (!username || !password) {
    return res.status(400).json({ ok: false, error: "用户名和密码不能为空" });
  }

  const verified = await verifyUserCredentials(username, password);
  if (!verified.ok) {
    return res.status(verified.status).json({ ok: false, error: verified.error });
  }
  const user = verified.user;
  const token = issueToken(user);

  let issued;
  try {
    issued = issueAuthCode({
      token,
      user: {
        username: user.username,
        role: user.role,
      },
      client,
      redirect,
      state,
    });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }

  try {
    await touchLastLogin(user.username);
  } catch (_err) {
    // ignore login timestamp errors
  }

  return res.json({
    ok: true,
    code: issued.code,
    codeExpiresInSeconds: authCode.ttlSeconds,
    redirectTo: buildAuthorizeRedirectUrl(redirect, {
      code: issued.code,
      state: String(state || "").trim(),
    }),
    user: {
      username: user.username,
      role: user.role,
    },
    encryptedRequest: parsed.encrypted,
  });
}

function exchangeToken(req, res) {
  const parsed = readRequestPayload(req.body, req.requestPayloadOptions || {});
  if (!parsed.ok) {
    return res.status(400).json({ ok: false, error: parsed.error });
  }

  const { code, client = "" } = parsed.payload || {};
  if (!code) {
    return res.status(400).json({ ok: false, error: "code 不能为空" });
  }

  let exchanged;
  try {
    exchanged = consumeAuthCode(code, { client });
  } catch (err) {
    return res.status(401).json({ ok: false, error: err.message });
  }

  return res.json({
    ok: true,
    token: exchanged.token,
    user: exchanged.user,
    expiresIn: jwtExpiresIn,
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
  authorize,
  exchangeToken,
  login,
};
