const express = require("express");
const { authenticate } = require("../auth");
const { getTenantDbClient } = require("../tenantDbManager");
const { createGatewayContextMiddleware } = require("../http/gatewayContext");
const { getApi } = require("../apiStore");
const { executeApiRequest } = require("../services/apiExecutionService");

/**
 * 短路由：POST /api/:apiKey
 * 使用 DEFAULT_PROJECT_KEY / DEFAULT_PROJECT_ENV 作为默认项目上下文。
 * 挂载在所有其他 /api/* 路由之后，不会与 /api/sql、/api/admin 等冲突。
 */
function createShortApiRoutes({ sqlRateLimiter }) {
  const router = express.Router();

  const gatewayContext = createGatewayContextMiddleware(() => ({
    projectKey: process.env.DEFAULT_PROJECT_KEY || "default",
    env: process.env.DEFAULT_PROJECT_ENV || "prod",
  }));

  function conditionalApiAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      req.user = null;
      req._noAuthToken = true;
      return next();
    }
    return authenticate(req, res, next);
  }

  async function handleApiCall(req, res) {
    const apiKey = req.params.apiKey;
    const context = req.gatewayContext;
    const projectEnvId = context.envId;

    const apiDef = await getApi(projectEnvId, apiKey);
    if (!apiDef) {
      return res.status(404).json({ ok: false, error: "接口不存在" });
    }

    if (apiDef.authMode === "token" && req._noAuthToken) {
      return res.status(401).json({ ok: false, error: "此接口需要身份认证" });
    }

    if (!req.user) {
      req.user = { username: "public", role: "" };
    }

    const db = getTenantDbClient(context);
    return executeApiRequest(req, res, {
      projectEnvId,
      context,
      dbClient: db,
      apiKey,
    });
  }

  router.all("/:apiKey", gatewayContext, conditionalApiAuth, sqlRateLimiter, handleApiCall);

  return router;
}

module.exports = { createShortApiRoutes };
