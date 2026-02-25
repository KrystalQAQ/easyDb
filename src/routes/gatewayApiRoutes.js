const express = require("express");
const { authenticate } = require("../auth");
const { getTenantDbClient } = require("../tenantDbManager");
const { createGatewayContextMiddleware } = require("../http/gatewayContext");
const { requireAdmin } = require("../http/adminCommon");
const { getApi } = require("../apiStore");
const { executeApiRequest } = require("../services/apiExecutionService");

function createGatewayApiRoutes({ sqlRateLimiter }) {
  const router = express.Router();
  const gatewayContext = createGatewayContextMiddleware((req) => ({
    projectKey: req.params.projectKey,
    env: req.params.env,
  }));

  // 根据接口定义的 authMode 选择鉴权策略
  function conditionalApiAuth(req, res, next) {
    // 在鉴权前需要先查接口定义确认 authMode，此处暂用 gatewayContext.policy.publicAccess
    // 或在 handler 中处理。这里先做 optional auth：有 token 则解析，无 token 则匿名。
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      // 标记为可能的 public 访问，在 handler 中根据 apiDef.authMode 做最终判断
      req.user = null;
      req._noAuthToken = true;
      return next();
    }
    return authenticate(req, res, next);
  }

  // 通用 handler
  async function handleApiCall(req, res) {
    const apiKey = req.params.apiKey;
    const context = req.gatewayContext;
    const projectEnvId = context.envId;

    // 查接口定义以检查 authMode
    const apiDef = await getApi(projectEnvId, apiKey);
    if (!apiDef) {
      return res.status(404).json({ ok: false, error: "接口不存在" });
    }

    // authMode=token 时必须有有效 token
    if (apiDef.authMode === "token" && req._noAuthToken) {
      return res.status(401).json({ ok: false, error: "此接口需要身份认证" });
    }

    // 设置 public 用户
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

  router.all(
    "/:projectKey/:env/api/:apiKey",
    gatewayContext,
    conditionalApiAuth,
    sqlRateLimiter,
    handleApiCall
  );

  return router;
}

module.exports = {
  createGatewayApiRoutes,
};
