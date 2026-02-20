const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const { readRequestPayload } = require("../requestCrypto");
const { validateSql, validateSqlWithPolicy } = require("../sqlPolicy");
const { writeAuditLog } = require("../auditLogger");

function createSqlRateLimiter(rateLimitConfig) {
  return rateLimit({
    windowMs: rateLimitConfig.windowMs,
    max: rateLimitConfig.max,
    standardHeaders: true,
    legacyHeaders: false,
    handler(req, res) {
      const requestId = crypto.randomUUID();
      void writeAuditLog({
        requestId,
        endpoint: req.originalUrl || "/api/sql",
        status: "rate_limited",
        actor: req.user?.username || "anonymous",
        role: req.user?.role || "",
        ip: req.ip,
      });
      return res.status(429).json({
        ok: false,
        error: "too many requests",
        requestId,
      });
    },
  });
}

async function executeSqlRequest(req, res, options = {}) {
  const requestId = crypto.randomUUID();
  const startMs = Date.now();
  const actor = req.user?.username || "anonymous";
  const role = req.user?.role || "";
  const endpoint = options.endpoint || "/api/sql";
  const context = options.context || null;
  const parsedBody = readRequestPayload(req.body, options.requestPayloadOptions || req.requestPayloadOptions || {});
  const auditMeta = context ? { projectKey: context.projectKey, env: context.env } : {};

  if (!parsedBody.ok) {
    await writeAuditLog({
      requestId,
      endpoint,
      status: "blocked",
      actor,
      role,
      ip: req.ip,
      sqlType: "",
      tables: [],
      sqlPreview: "",
      paramsCount: 0,
      encryptedRequest: false,
      error: parsedBody.error,
      durationMs: Date.now() - startMs,
      ...auditMeta,
    });
    return res.status(400).json({ ok: false, error: parsedBody.error, requestId });
  }

  const { sql, params = [] } = parsedBody.payload || {};
  const sqlPreview = typeof sql === "string" ? sql.slice(0, 500) : "";
  const validation = options.policy
    ? validateSqlWithPolicy(sql, { role }, options.policy)
    : validateSql(sql, { role });

  if (!validation.ok) {
    await writeAuditLog({
      requestId,
      endpoint,
      status: "blocked",
      actor,
      role,
      ip: req.ip,
      sqlType: validation.sqlType || "",
      tables: validation.tables || [],
      sqlPreview,
      paramsCount: Array.isArray(params) ? params.length : 0,
      encryptedRequest: parsedBody.encrypted,
      error: validation.message,
      durationMs: Date.now() - startMs,
      ...auditMeta,
    });
    return res.status(400).json({ ok: false, error: validation.message, requestId });
  }

  if (!Array.isArray(params)) {
    await writeAuditLog({
      requestId,
      endpoint,
      status: "blocked",
      actor,
      role,
      ip: req.ip,
      sqlType: validation.sqlType || "",
      tables: validation.tables || [],
      sqlPreview,
      paramsCount: 0,
      encryptedRequest: parsedBody.encrypted,
      error: "params must be an array",
      durationMs: Date.now() - startMs,
      ...auditMeta,
    });
    return res.status(400).json({ ok: false, error: "params 必须是数组", requestId });
  }

  try {
    const [result] = await options.dbClient.raw(sql, params);
    const durationMs = Date.now() - startMs;
    // 审计中写入 project/env，便于多项目场景下快速溯源。
    await writeAuditLog({
      requestId,
      endpoint,
      status: "ok",
      actor,
      role,
      ip: req.ip,
      sqlType: validation.sqlType,
      tables: validation.tables,
      sqlPreview,
      paramsCount: params.length,
      encryptedRequest: parsedBody.encrypted,
      rowCount: validation.sqlType === "select" && Array.isArray(result) ? result.length : undefined,
      affectedRows: validation.sqlType !== "select" ? result?.affectedRows || 0 : undefined,
      durationMs,
      ...auditMeta,
    });

    if (validation.sqlType === "select") {
      return res.json({
        ok: true,
        requestId,
        type: validation.sqlType,
        rowCount: Array.isArray(result) ? result.length : 0,
        data: result,
      });
    }

    return res.json({
      ok: true,
      requestId,
      type: validation.sqlType,
      affectedRows: result?.affectedRows || 0,
      insertId: result?.insertId || null,
      data: result,
    });
  } catch (err) {
    await writeAuditLog({
      requestId,
      endpoint,
      status: "error",
      actor,
      role,
      ip: req.ip,
      sqlType: validation.sqlType || "",
      tables: validation.tables || [],
      sqlPreview,
      paramsCount: params.length,
      encryptedRequest: parsedBody.encrypted,
      error: err.message,
      durationMs: Date.now() - startMs,
      ...auditMeta,
    });
    return res.status(400).json({ ok: false, error: err.message, requestId });
  }
}

module.exports = {
  createSqlRateLimiter,
  executeSqlRequest,
};
