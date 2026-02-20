const express = require("express");
const { authenticate } = require("../auth");
const { getTenantDbClient } = require("../tenantDbManager");
const { createGatewayContextMiddleware } = require("../http/gatewayContext");
const { requireAdmin } = require("../http/adminCommon");
const { buildEffectivePolicy } = require("../utils/gatewayPolicy");
const { executeSqlRequest } = require("../services/sqlGatewayService");

function createGatewayRoutes({ sqlRateLimiter }) {
  const router = express.Router();
  // 所有 /api/gw 路由都先解析 project/env 上下文。
  const gatewayContext = createGatewayContextMiddleware((req) => ({
    projectKey: req.params.projectKey,
    env: req.params.env,
  }));

  router.get("/:projectKey/:env/health", gatewayContext, async (req, res) => {
    try {
      const db = getTenantDbClient(req.gatewayContext);
      await db.raw("SELECT 1");
      return res.json({
        ok: true,
        projectKey: req.gatewayContext.projectKey,
        env: req.gatewayContext.env,
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  router.post("/:projectKey/:env/auth/login", gatewayContext, (_req, res) => {
    return res.status(410).json({
      ok: false,
      error: "scoped login removed, please use /api/auth/login",
    });
  });
  router.get("/:projectKey/:env/auth/me", gatewayContext, authenticate, (req, res) => {
    return res.json({
      ok: true,
      user: req.user,
      scope: {
        projectKey: req.gatewayContext.projectKey,
        env: req.gatewayContext.env,
      },
    });
  });

  router.post(
    "/:projectKey/:env/sql",
    gatewayContext,
    authenticate,
    requireAdmin,
    sqlRateLimiter,
    async (req, res) => {
      // 每个项目环境独立策略，避免跨项目共享默认权限。
      const policy = buildEffectivePolicy(req.gatewayContext.policy || {});
      const db = getTenantDbClient(req.gatewayContext);
      return executeSqlRequest(req, res, {
        endpoint: "/api/gw/:projectKey/:env/sql",
        context: req.gatewayContext,
        policy,
        dbClient: db,
      });
    }
  );

  return router;
}

module.exports = {
  createGatewayRoutes,
};
