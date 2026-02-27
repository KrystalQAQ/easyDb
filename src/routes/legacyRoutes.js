const express = require("express");
const { authenticate, authorize, exchangeToken, login } = require("../auth");
const { dbClient, healthCheck } = require("../db");
const { defaultProject } = require("../config");
const { resolveProjectEnv } = require("../projectRegistry");
const { getTenantDbClient } = require("../tenantDbManager");
const { buildEffectivePolicy, getGatewayPayloadOptions } = require("../utils/gatewayPolicy");
const { executeSqlRequest } = require("../services/sqlGatewayService");
const { requireAdmin } = require("../http/adminCommon");

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
  router.get("/auth/me", authenticate, (req, res) => {
    return res.json({ ok: true, user: req.user });
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
