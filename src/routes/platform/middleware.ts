import type { NextFunction, Response, Router } from "express";
import type { PlatformRequest } from "./types";

const { authenticateAdminOrApiKey } = require("../../http/authenticateAdminOrApiKey");
const { requireAdmin } = require("../../http/adminCommon");

/**
 * 平台控制面统一认证：
 * 1. 默认仅 admin 可访问
 * 2. API Key 仅开放前端部署接口
 */
export function applyPlatformAuth(router: Router): void {
  router.use((req: PlatformRequest, res: Response, next: NextFunction) => {
    return authenticateAdminOrApiKey(req, res, (err: unknown) => {
      if (err) return next(err as never);
      if (req.apiKeyContext) {
        const isDeployRoute =
          req.method === "POST" &&
          /^\/projects\/[^/]+\/envs\/[^/]+\/deploy$/.test(String(req.path || ""));
        if (!isDeployRoute) {
          return res.status(403).json({ ok: false, error: "API Key 无权访问此接口" });
        }
        return next();
      }
      return requireAdmin(req, res, next);
    });
  });
}

