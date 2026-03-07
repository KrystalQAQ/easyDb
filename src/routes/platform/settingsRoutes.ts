import { Router } from "express";
import { listPlatformSettings, upsertPlatformSetting } from "../../controllers/platformSettingsController";

export function createPlatformSettingsRoutes(): Router {
  const router = Router();

  router.get("/settings", listPlatformSettings);
  router.put("/settings/:settingKey", upsertPlatformSetting);

  return router;
}
