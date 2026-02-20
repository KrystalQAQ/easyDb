const { readRequestPayload } = require("../requestCrypto");
const { isDbAuthProvider } = require("../userStore");

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ ok: false, error: "admin only" });
  }
  return next();
}

function ensureDbAuthProvider(res) {
  if (isDbAuthProvider()) {
    return true;
  }
  res.status(400).json({
    ok: false,
    error: "user management requires AUTH_PROVIDER=db",
  });
  return false;
}

function parseAdminPayload(req, res) {
  // admin 接口同样支持加密请求体，和普通业务接口保持一致。
  const parsed = readRequestPayload(req.body, req.requestPayloadOptions || {});
  if (!parsed.ok) {
    res.status(400).json({ ok: false, error: parsed.error });
    return null;
  }
  return parsed.payload || {};
}

module.exports = {
  requireAdmin,
  ensureDbAuthProvider,
  parseAdminPayload,
};
