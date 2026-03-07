const { resolveProjectEnv } = require("../projectRegistry");
const { getGatewayPayloadOptions } = require("../utils/gatewayPolicy");
const { normalizeProjectKey, normalizeEnvKey } = require("../utils/validators");
import type { NextFunction, Request, Response } from "express";

type GatewayPathInfo = {
  projectKey?: string;
  env?: string;
};

type GatewayRequest = Request & {
  gatewayContext?: unknown;
  requestPayloadOptions?: Record<string, unknown>;
};

function createGatewayContextMiddleware(resolvePath: (req: GatewayRequest) => GatewayPathInfo) {
  return async function gatewayContextMiddleware(
    req: GatewayRequest,
    res: Response,
    next: NextFunction
  ) {
    const pathInfo = resolvePath(req);
    const projectKey = normalizeProjectKey(pathInfo.projectKey);
    const env = normalizeEnvKey(pathInfo.env);
    if (!projectKey || !env) {
      return res.status(400).json({ ok: false, error: "项目标识和环境不能为空" });
    }

    try {
      const context = await resolveProjectEnv(projectKey, env);
      if (!context) {
        return res.status(404).json({ ok: false, error: "项目环境不存在" });
      }
      if (context.projectStatus !== "active" || context.status !== "active") {
        return res.status(403).json({ ok: false, error: "项目环境已禁用" });
      }
      // 将项目上下文挂到 req，后续鉴权、解密、SQL 策略都依赖该上下文。
      req.gatewayContext = context;
      req.requestPayloadOptions = getGatewayPayloadOptions(context);
      return next();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ ok: false, error: errorMessage });
    }
  };
}

module.exports = {
  createGatewayContextMiddleware,
};
