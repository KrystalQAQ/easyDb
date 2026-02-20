const { resolveProjectEnv } = require("../projectRegistry");
const { getGatewayPayloadOptions } = require("../utils/gatewayPolicy");
const { normalizeProjectKey, normalizeEnvKey } = require("../utils/validators");

function createGatewayContextMiddleware(resolvePath) {
  return async function gatewayContextMiddleware(req, res, next) {
    const pathInfo = resolvePath(req);
    const projectKey = normalizeProjectKey(pathInfo.projectKey);
    const env = normalizeEnvKey(pathInfo.env);
    if (!projectKey || !env) {
      return res.status(400).json({ ok: false, error: "project/env is required" });
    }

    try {
      const context = await resolveProjectEnv(projectKey, env);
      if (!context) {
        return res.status(404).json({ ok: false, error: "project env not found" });
      }
      if (context.projectStatus !== "active" || context.status !== "active") {
        return res.status(403).json({ ok: false, error: "project env is disabled" });
      }
      // 将项目上下文挂到 req，后续鉴权、解密、SQL 策略都依赖该上下文。
      req.gatewayContext = context;
      req.requestPayloadOptions = getGatewayPayloadOptions(context);
      return next();
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  };
}

module.exports = {
  createGatewayContextMiddleware,
};
