import { Router } from "express";
import { createPlatformDeployRoutes } from "./platform/deployRoutes";
import { applyPlatformAuth } from "./platform/middleware";
import { createPlatformNginxRoutes } from "./platform/nginxRoutes";
import { createPlatformProjectRoutes } from "./platform/projectRoutes";
import { createPlatformSettingsRoutes } from "./platform/settingsRoutes";
import { createPlatformVarsRoutes } from "./platform/varsRoutes";

/**
 * 平台控制面路由（v1）总入口。
 * 通过子路由拆分项目、Nginx、变量与部署能力，避免单文件继续膨胀。
 */
export function createPlatformRoutes() {
  const router = Router();
  applyPlatformAuth(router);
  router.use(createPlatformSettingsRoutes());
  router.use(createPlatformProjectRoutes());
  router.use(createPlatformNginxRoutes());
  router.use(createPlatformVarsRoutes());
  router.use(createPlatformDeployRoutes());
  return router;
}
