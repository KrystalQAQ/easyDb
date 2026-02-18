const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");

const {
  port,
  corsOrigins,
  frontend,
  csp,
  rateLimit: rateLimitConfig,
  auditQueryMaxLimit,
  adminUserQueryMaxLimit,
  bcryptRounds,
} = require("./config");
const { dbClient, healthCheck } = require("./db");
const { validateSql } = require("./sqlPolicy");
const { authenticate, login } = require("./auth");
const { writeAuditLog } = require("./auditLogger");
const { queryAuditLogs } = require("./auditQuery");
const { readRequestPayload } = require("./requestCrypto");
const {
  isDbAuthProvider,
  listUsers,
  countUsers,
  getUserDetail,
  createUser,
  updateUser,
  resetUserPassword,
  deleteUser,
  countActiveAdmins,
} = require("./userStore");

const app = express();

app.use(
  helmet({
    contentSecurityPolicy: csp.enabled
      ? {
          useDefaults: true,
          directives: {
            "img-src": csp.imgSrc,
            "connect-src": csp.connectSrc,
            "script-src": csp.scriptSrc,
          },
        }
      : false,
  })
);
app.use(express.json({ limit: "256kb" }));
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || corsOrigins.includes("*") || corsOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("CORS blocked"));
    },
  })
);

const sqlRateLimiter = rateLimit({
  windowMs: rateLimitConfig.windowMs,
  max: rateLimitConfig.max,
  standardHeaders: true,
  legacyHeaders: false,
  handler(req, res) {
    const requestId = crypto.randomUUID();
    void writeAuditLog({
      requestId,
      endpoint: "/api/sql",
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

app.use("/demo", express.static(path.resolve(process.cwd(), "frontend-demo")));

app.get("/api/health", async (_req, res) => {
  try {
    await healthCheck();
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/auth/login", login);

app.get("/api/auth/me", authenticate, (req, res) => {
  return res.json({
    ok: true,
    user: req.user,
  });
});

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
  const parsed = readRequestPayload(req.body);
  if (!parsed.ok) {
    res.status(400).json({ ok: false, error: parsed.error });
    return null;
  }
  return parsed.payload || {};
}

function normalizeUsername(value) {
  return String(value || "").trim();
}

function normalizeRole(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeStatus(value) {
  return String(value || "").trim().toLowerCase();
}

function isValidUsername(username) {
  return /^[a-zA-Z0-9._-]{3,64}$/.test(username);
}

function isValidRole(role) {
  return /^[a-z][a-z0-9_-]{1,31}$/.test(role);
}

app.get("/api/admin/audit-logs", authenticate, requireAdmin, async (req, res) => {
  const requestedLimit = Number(req.query.limit || 100);
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(requestedLimit, auditQueryMaxLimit))
    : 100;

  try {
    const items = await queryAuditLogs({
      limit,
      status: typeof req.query.status === "string" ? req.query.status : "",
      actor: typeof req.query.actor === "string" ? req.query.actor : "",
      role: typeof req.query.role === "string" ? req.query.role : "",
      sqlType: typeof req.query.sqlType === "string" ? req.query.sqlType : "",
      requestId: typeof req.query.requestId === "string" ? req.query.requestId : "",
      from: typeof req.query.from === "string" ? req.query.from : "",
      to: typeof req.query.to === "string" ? req.query.to : "",
    });
    return res.json({ ok: true, count: items.length, items });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/admin/users", authenticate, requireAdmin, async (req, res) => {
  if (!ensureDbAuthProvider(res)) return;

  const requestedLimit = Number(req.query.limit || 50);
  const requestedOffset = Number(req.query.offset || 0);
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(requestedLimit, adminUserQueryMaxLimit))
    : 50;
  const offset = Number.isFinite(requestedOffset) ? Math.max(0, requestedOffset) : 0;

  const filters = {
    limit,
    offset,
    status: normalizeStatus(req.query.status),
    role: normalizeRole(req.query.role),
    keyword: normalizeUsername(req.query.keyword),
  };

  try {
    const [items, total] = await Promise.all([listUsers(filters), countUsers(filters)]);
    return res.json({ ok: true, total, limit, offset, items });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/admin/users/:username", authenticate, requireAdmin, async (req, res) => {
  if (!ensureDbAuthProvider(res)) return;
  const username = normalizeUsername(req.params.username);
  try {
    const user = await getUserDetail(username);
    if (!user) {
      return res.status(404).json({ ok: false, error: "user not found" });
    }
    return res.json({ ok: true, user });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/admin/users", authenticate, requireAdmin, async (req, res) => {
  if (!ensureDbAuthProvider(res)) return;
  const payload = parseAdminPayload(req, res);
  if (!payload) return;

  const username = normalizeUsername(payload.username);
  const password = String(payload.password || "");
  const role = normalizeRole(payload.role || "analyst");
  const status = normalizeStatus(payload.status || "active");

  if (!isValidUsername(username)) {
    return res.status(400).json({ ok: false, error: "invalid username format" });
  }
  if (password.length < 8) {
    return res.status(400).json({ ok: false, error: "password length must be at least 8" });
  }
  if (!isValidRole(role)) {
    return res.status(400).json({ ok: false, error: "invalid role format" });
  }
  if (!["active", "disabled"].includes(status)) {
    return res.status(400).json({ ok: false, error: "status must be active or disabled" });
  }

  try {
    const exists = await getUserDetail(username);
    if (exists) {
      return res.status(409).json({ ok: false, error: "username already exists" });
    }

    const passwordHash = await bcrypt.hash(password, bcryptRounds);
    await createUser({ username, passwordHash, role, status });
    const user = await getUserDetail(username);

    await writeAuditLog({
      endpoint: "/api/admin/users",
      action: "create_user",
      status: "ok",
      actor: req.user.username,
      role: req.user.role,
      targetUser: username,
      ip: req.ip,
    });

    return res.json({ ok: true, user });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.patch("/api/admin/users/:username", authenticate, requireAdmin, async (req, res) => {
  if (!ensureDbAuthProvider(res)) return;
  const payload = parseAdminPayload(req, res);
  if (!payload) return;

  const username = normalizeUsername(req.params.username);
  const nextRole = payload.role === undefined ? undefined : normalizeRole(payload.role);
  const nextStatus = payload.status === undefined ? undefined : normalizeStatus(payload.status);

  if (nextRole !== undefined && !isValidRole(nextRole)) {
    return res.status(400).json({ ok: false, error: "invalid role format" });
  }
  if (nextStatus !== undefined && !["active", "disabled"].includes(nextStatus)) {
    return res.status(400).json({ ok: false, error: "status must be active or disabled" });
  }
  if (nextRole === undefined && nextStatus === undefined) {
    return res.status(400).json({ ok: false, error: "role or status is required" });
  }

  try {
    const currentUser = await getUserDetail(username);
    if (!currentUser) {
      return res.status(404).json({ ok: false, error: "user not found" });
    }

    const finalRole = nextRole ?? currentUser.role;
    const finalStatus = nextStatus ?? currentUser.status;
    const isRemovingLastAdmin =
      currentUser.role === "admin" &&
      currentUser.status === "active" &&
      (finalRole !== "admin" || finalStatus !== "active");

    if (isRemovingLastAdmin) {
      const adminCount = await countActiveAdmins();
      if (adminCount <= 1) {
        return res.status(400).json({ ok: false, error: "cannot remove last active admin" });
      }
    }

    await updateUser(username, {
      ...(nextRole !== undefined ? { role: finalRole } : {}),
      ...(nextStatus !== undefined ? { status: finalStatus } : {}),
    });
    const user = await getUserDetail(username);

    await writeAuditLog({
      endpoint: "/api/admin/users/:username",
      action: "update_user",
      status: "ok",
      actor: req.user.username,
      role: req.user.role,
      targetUser: username,
      ip: req.ip,
      updateFields: Object.keys(payload),
    });

    return res.json({ ok: true, user });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/admin/users/:username/reset-password", authenticate, requireAdmin, async (req, res) => {
  if (!ensureDbAuthProvider(res)) return;
  const payload = parseAdminPayload(req, res);
  if (!payload) return;

  const username = normalizeUsername(req.params.username);
  const newPassword = String(payload.newPassword || "");
  if (newPassword.length < 8) {
    return res.status(400).json({ ok: false, error: "newPassword length must be at least 8" });
  }

  try {
    const currentUser = await getUserDetail(username);
    if (!currentUser) {
      return res.status(404).json({ ok: false, error: "user not found" });
    }

    const passwordHash = await bcrypt.hash(newPassword, bcryptRounds);
    await resetUserPassword(username, passwordHash);

    await writeAuditLog({
      endpoint: "/api/admin/users/:username/reset-password",
      action: "reset_password",
      status: "ok",
      actor: req.user.username,
      role: req.user.role,
      targetUser: username,
      ip: req.ip,
    });

    return res.json({ ok: true, username });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/admin/users/:username/disable", authenticate, requireAdmin, async (req, res) => {
  if (!ensureDbAuthProvider(res)) return;
  const username = normalizeUsername(req.params.username);

  try {
    const currentUser = await getUserDetail(username);
    if (!currentUser) {
      return res.status(404).json({ ok: false, error: "user not found" });
    }
    if (currentUser.status === "disabled") {
      return res.json({ ok: true, user: currentUser });
    }

    if (currentUser.role === "admin") {
      const adminCount = await countActiveAdmins();
      if (adminCount <= 1) {
        return res.status(400).json({ ok: false, error: "cannot disable last active admin" });
      }
    }

    await updateUser(username, { status: "disabled" });
    const user = await getUserDetail(username);

    await writeAuditLog({
      endpoint: "/api/admin/users/:username/disable",
      action: "disable_user",
      status: "ok",
      actor: req.user.username,
      role: req.user.role,
      targetUser: username,
      ip: req.ip,
    });

    return res.json({ ok: true, user });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/admin/users/:username/enable", authenticate, requireAdmin, async (req, res) => {
  if (!ensureDbAuthProvider(res)) return;
  const username = normalizeUsername(req.params.username);

  try {
    const currentUser = await getUserDetail(username);
    if (!currentUser) {
      return res.status(404).json({ ok: false, error: "user not found" });
    }
    if (currentUser.status === "active") {
      return res.json({ ok: true, user: currentUser });
    }

    await updateUser(username, { status: "active" });
    const user = await getUserDetail(username);

    await writeAuditLog({
      endpoint: "/api/admin/users/:username/enable",
      action: "enable_user",
      status: "ok",
      actor: req.user.username,
      role: req.user.role,
      targetUser: username,
      ip: req.ip,
    });

    return res.json({ ok: true, user });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.delete("/api/admin/users/:username", authenticate, requireAdmin, async (req, res) => {
  if (!ensureDbAuthProvider(res)) return;
  const username = normalizeUsername(req.params.username);
  if (username === req.user.username) {
    return res.status(400).json({ ok: false, error: "cannot delete self" });
  }

  try {
    const currentUser = await getUserDetail(username);
    if (!currentUser) {
      return res.status(404).json({ ok: false, error: "user not found" });
    }

    if (currentUser.role === "admin" && currentUser.status === "active") {
      const adminCount = await countActiveAdmins();
      if (adminCount <= 1) {
        return res.status(400).json({ ok: false, error: "cannot delete last active admin" });
      }
    }

    await deleteUser(username);

    await writeAuditLog({
      endpoint: "/api/admin/users/:username",
      action: "delete_user",
      status: "ok",
      actor: req.user.username,
      role: req.user.role,
      targetUser: username,
      ip: req.ip,
    });

    return res.json({ ok: true, username });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

function mountFrontendApp() {
  if (!frontend.enabled) return;

  const indexFile = path.join(frontend.distDir, "index.html");
  if (!fs.existsSync(indexFile)) {
    console.warn(
      `[frontend] skipped: index.html not found at ${indexFile}. ` +
        "Set FRONTEND_DIST_DIR correctly or set FRONTEND_ENABLED=false."
    );
    return;
  }

  app.use(
    express.static(frontend.distDir, {
      index: false,
      maxAge: "1h",
    })
  );

  app.get("*", (req, res, next) => {
    if (req.method !== "GET") return next();
    if (req.path === "/api") return next();
    if (req.path.startsWith("/api/")) return next();
    if (req.path === "/demo") return next();
    if (req.path.startsWith("/demo/")) return next();
    if (/\.[^/]+$/.test(req.path)) return next();
    return res.sendFile(indexFile);
  });
}

mountFrontendApp();

app.post("/api/sql", authenticate, sqlRateLimiter, async (req, res) => {
  const requestId = crypto.randomUUID();
  const startMs = Date.now();
  const actor = req.user?.username || "anonymous";
  const role = req.user?.role || "";
  const parsedBody = readRequestPayload(req.body);
  if (!parsedBody.ok) {
    await writeAuditLog({
      requestId,
      endpoint: "/api/sql",
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
    });
    return res.status(400).json({ ok: false, error: parsedBody.error, requestId });
  }

  const { sql, params = [] } = parsedBody.payload || {};
  const sqlPreview = typeof sql === "string" ? sql.slice(0, 500) : "";

  const validation = validateSql(sql, { role });
  if (!validation.ok) {
    await writeAuditLog({
      requestId,
      endpoint: "/api/sql",
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
    });
    return res.status(400).json({ ok: false, error: validation.message, requestId });
  }

  if (!Array.isArray(params)) {
    await writeAuditLog({
      requestId,
      endpoint: "/api/sql",
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
    });
    return res.status(400).json({ ok: false, error: "params 必须是数组", requestId });
  }

  try {
    const [result] = await dbClient.raw(sql, params);
    const durationMs = Date.now() - startMs;

    await writeAuditLog({
      requestId,
      endpoint: "/api/sql",
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
      endpoint: "/api/sql",
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
    });
    return res.status(400).json({ ok: false, error: err.message, requestId });
  }
});

app.use((err, _req, res, _next) => {
  return res.status(500).json({ ok: false, error: err.message || "internal error" });
});

app.listen(port, () => {
  console.log(`SQL gateway listening on http://localhost:${port}`);
});
