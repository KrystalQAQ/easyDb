import { Router, type NextFunction, type Response } from "express";
import type { PlatformRequest } from "../platform/types";
const { authenticateAdminOrApiKey } = require("../../http/authenticateAdminOrApiKey");
const { requireAdmin } = require("../../http/adminCommon");
const { listPlatformSettings, upsertPlatformSetting } = require("../../controllers/platformSettingsController");

/**
 * v2 系统管理接口（当前只开放 runtime settings）。
 */
export function createSystemV2Routes() {
  const router = Router();

  router.use(authenticateAdminOrApiKey);
  router.use((req: PlatformRequest, res: Response, next: NextFunction) => {
    if (req.apiKeyContext) {
      return res.status(403).json({ ok: false, error: "API Key 无权访问此接口" });
    }
    return requireAdmin(req, res, next);
  });

  router.get("/settings", listPlatformSettings);
  router.put("/settings/:settingKey", upsertPlatformSetting);

  return router;
}
