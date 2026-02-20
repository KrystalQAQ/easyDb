const express = require("express");
const bcrypt = require("bcryptjs");
const { authenticate } = require("../auth");
const { writeAuditLog } = require("../auditLogger");
const { queryAuditLogs } = require("../auditQuery");
const { auditQueryMaxLimit, adminUserQueryMaxLimit, bcryptRounds } = require("../config");
const {
  listUsers,
  countUsers,
  getUserDetail,
  createUser,
  updateUser,
  resetUserPassword,
  deleteUser,
  countActiveAdmins,
} = require("../userStore");
const { requireAdmin, ensureDbAuthProvider, parseAdminPayload } = require("../http/adminCommon");
const {
  normalizeUsername,
  normalizeRole,
  normalizeStatus,
  isValidUsername,
  isValidRole,
} = require("../utils/validators");

function createAdminRoutes() {
  const router = express.Router();
  // 管理员路由全量受保护：先鉴权，再校验 admin 角色。
  router.use(authenticate, requireAdmin);

  router.get("/audit-logs", async (req, res) => {
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

  router.get("/users", async (req, res) => {
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

  router.get("/users/:username", async (req, res) => {
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

  router.post("/users", async (req, res) => {
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

  router.patch("/users/:username", async (req, res) => {
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
      // 防止误操作移除最后一个活跃管理员，导致系统无人可管。
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

  router.post("/users/:username/reset-password", async (req, res) => {
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

  router.post("/users/:username/disable", async (req, res) => {
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

  router.post("/users/:username/enable", async (req, res) => {
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

  router.delete("/users/:username", async (req, res) => {
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

  return router;
}

module.exports = {
  createAdminRoutes,
};
