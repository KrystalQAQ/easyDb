const express = require("express");
const { authenticate, authorize, exchangeToken, login } = require("../auth");
const { dbClient, healthCheck } = require("../db");
const { defaultProject } = require("../config");
const { resolveProjectEnv } = require("../projectRegistry");
const { getTenantDbClient } = require("../tenantDbManager");
const { buildEffectivePolicy, getGatewayPayloadOptions } = require("../utils/gatewayPolicy");
const { executeSqlRequest } = require("../services/sqlGatewayService");
const { requireAdmin } = require("../http/adminCommon");
const { getUserDetail, updateAvatar } = require("../userStore");

function createLegacyRoutes({ sqlRateLimiter }) {
  const router = express.Router();

  router.get("/health", async (_req, res) => {
    try {
      await healthCheck();
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  router.post("/auth/login", login);
  router.post("/auth/authorize", authorize);
  router.post("/auth/token", exchangeToken);
  router.get("/auth/me", authenticate, async (req, res) => {
    try {
      const detail = await getUserDetail(req.user.username);
      return res.json({ ok: true, user: { ...req.user, avatar: detail?.avatar || null } });
    } catch {
      return res.json({ ok: true, user: req.user });
    }
  });

  router.put("/auth/me/avatar", authenticate, async (req, res) => {
    const { avatar } = req.body || {};
    if (!avatar || typeof avatar !== "string") {
      return res.status(400).json({ ok: false, error: "avatar 不能为空" });
    }
    if (!avatar.startsWith("data:image/")) {
      return res.status(400).json({ ok: false, error: "avatar 必须是 data URL 格式" });
    }
    if (avatar.length > 1400000) {
      return res.status(400).json({ ok: false, error: "头像文件过大，请压缩后重试" });
    }
    try {
      await updateAvatar(req.user.username, avatar);
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  router.post("/sql", authenticate, requireAdmin, sqlRateLimiter, async (req, res) => {
    try {
      const defaultContext = await resolveProjectEnv(defaultProject.key, defaultProject.env);
      if (!defaultContext) {
        // 平台配置中心未初始化时，回退到旧的单库执行逻辑，避免线上瞬断。
        return executeSqlRequest(req, res, {
          endpoint: "/api/sql",
          dbClient,
        });
      }
      if (defaultContext.projectStatus !== "active" || defaultContext.status !== "active") {
        return res.status(403).json({ ok: false, error: "默认项目环境已禁用" });
      }

      const policy = buildEffectivePolicy(defaultContext.policy || {});
      const db = getTenantDbClient(defaultContext);
      return executeSqlRequest(req, res, {
        endpoint: "/api/sql",
        context: defaultContext,
        policy,
        dbClient: db,
        requestPayloadOptions: getGatewayPayloadOptions(defaultContext),
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  return router;
}

module.exports = {
  createLegacyRoutes,
};
