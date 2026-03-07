const express = require("express");
const path = require("path");
const fs = require("fs");
const {
  rateLimit: rateLimitConfig,
} = require("./config");
const { createSqlRateLimiter } = require("./services/sqlGatewayService");
const { createLegacyRoutes } = require("./routes/legacyRoutes");
const { createAdminRoutes } = require("./routes/adminRoutes");
const { createPlatformRoutes } = require("./routes/platformRoutes");
const { createGatewayRoutes } = require("./routes/gatewayRoutes");
const { createGatewayApiRoutes } = require("./routes/gatewayApiRoutes");
const { createPlatformApiRoutes } = require("./routes/platformApiRoutes");
const { createPlatformApiKeyRoutes } = require("./routes/platformApiKeyRoutes");
const { createAuthV2Routes } = require("./routes/v2/authV2Routes");
const { createProjectV2Routes } = require("./routes/v2/projectV2Routes");
const { createSystemV2Routes } = require("./routes/v2/systemV2Routes");
const { saveBootstrapDbConfig } = require("./bootstrapDbConfig");

import type { NextFunction, Request, Response } from "express";

type BootstrapStatus = {
  configured: boolean;
  initialized: boolean;
  source: "env" | "file" | null;
  lastError: string | null;
  updatedAt: string;
};

type BootstrapInitReport = {
  checkedAt: string;
  initializedTables: boolean;
  createdTables: string[];
  existingTables: string[];
};

type CreateAppOptions = {
  getBootstrapInitReport?: () => BootstrapInitReport | null;
  getBootstrapStatus?: () => BootstrapStatus;
  initializeBootstrapRuntime?: (overrideConfig?: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
  }) => Promise<BootstrapStatus>;
  resetBootstrapRuntime?: () => Promise<BootstrapStatus>;
};

/**
 * 主应用装配函数。
 * 这里集中挂载静态资源、v1/v2 API 路由与全局错误处理。
 */
function createApp(options: CreateAppOptions = {}) {
  const app = express();
  const sqlRateLimiter = createSqlRateLimiter(rateLimitConfig);
  const getBootstrapInitReport = options.getBootstrapInitReport || (() => null);
  const getBootstrapStatus =
    options.getBootstrapStatus ||
    (() => ({
      configured: true,
      initialized: true,
      source: null,
      lastError: null,
      updatedAt: new Date().toISOString(),
    }));

  app.use(express.json({ limit: "2mb" }));

  app.get("/api/system/bootstrap/status", (_req: Request, res: Response) => {
    const status = getBootstrapStatus();
    const initReport = getBootstrapInitReport();
    return res.json({ ok: true, status, initReport });
  });

  app.post("/api/system/bootstrap/config", async (req: Request, res: Response) => {
    const payload = (req.body || {}) as Record<string, unknown>;
    try {
      const host = String(payload.host || "").trim();
      const user = String(payload.user || "").trim();
      const database = String(payload.database || "").trim();
      const port = Number(payload.port || 3306);
      if (!host || !user || !database) {
        return res.status(400).json({ ok: false, error: "host、user、database 为必填项" });
      }
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        return res.status(400).json({ ok: false, error: "port 必须是 1-65535 的整数" });
      }

      const savedConfig = saveBootstrapDbConfig({
        host,
        port,
        user,
        password: String(payload.password || ""),
        database,
      });

      if (!options.initializeBootstrapRuntime) {
        return res.status(500).json({ ok: false, error: "bootstrap runtime is not available" });
      }
      const status = await options.initializeBootstrapRuntime(savedConfig);
      if (!status.initialized) {
        return res.status(400).json({
          ok: false,
          error: status.lastError || "数据库初始化失败",
          status,
        });
      }
      const initReport = getBootstrapInitReport();
      const restartRequired = process.env.NODE_ENV === "production";
      const messageText =
        initReport && initReport.createdTables.length > 0
          ? `数据库连接成功，已自动初始化 ${initReport.createdTables.length} 张系统表`
          : "数据库连接成功，系统表已就绪";
      const responsePayload = { ok: true, status, initReport, message: messageText, restartRequired };
      res.json(responsePayload);
      if (restartRequired) {
        // 生产容器内重启进程，确保所有模块按新数据库配置重新装配。
        setTimeout(() => {
          process.exit(0);
        }, 200);
      }
      return;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(400).json({ ok: false, error: message });
    }
  });

  app.post("/api/system/bootstrap/reset", async (req: Request, res: Response) => {
    const payload = (req.body || {}) as Record<string, unknown>;
    if (String(payload.confirm || "").trim().toUpperCase() !== "RESET") {
      return res.status(400).json({ ok: false, error: "请在请求体中传入 confirm=RESET 以确认重置" });
    }
    if (!options.resetBootstrapRuntime) {
      return res.status(500).json({ ok: false, error: "bootstrap runtime is not available" });
    }
    const status = await options.resetBootstrapRuntime();
    const restartRequired = process.env.NODE_ENV === "production";
    res.json({
      ok: true,
      status,
      restartRequired,
      message: "系统已重置，bootstrap-db.json 已删除，请重新填写数据库初始化信息",
    });
    if (restartRequired) {
      setTimeout(() => {
        process.exit(0);
      }, 200);
    }
  });

  app.use("/api", (req: Request, res: Response, next: NextFunction) => {
    const status = getBootstrapStatus();
    if (status.initialized) return next();
    return res.status(503).json({
      ok: false,
      code: "bootstrap_required",
      error: "系统尚未完成数据库初始化，请先在初始化页面填写数据库连接",
      status,
    });
  });

  const consoleDistDir = path.resolve(process.cwd(), "frontend-app/dist");
  const fallbackDistDir = path.resolve(process.cwd(), "frontend-demo");
  const hasBuiltConsole = fs.existsSync(path.join(consoleDistDir, "index.html"));
  const staticDir = hasBuiltConsole ? consoleDistDir : fallbackDistDir;
  const indexFile = path.join(staticDir, "index.html");
  const staticOptions = hasBuiltConsole ? { index: false, maxAge: "1h" } : { index: false };

  app.use(express.static(staticDir, staticOptions));
  // 保留旧路由，确保老前端在迁移到多项目前缀前仍可继续访问。
  app.use("/api", createLegacyRoutes({ sqlRateLimiter }));
  app.use("/api/admin", createAdminRoutes());
  app.use("/api/platform", createPlatformRoutes());
  app.use("/api/platform", createPlatformApiRoutes());
  app.use("/api/platform", createPlatformApiKeyRoutes());
  app.use("/api/gw", createGatewayRoutes({ sqlRateLimiter }));
  app.use("/api/gw", createGatewayApiRoutes({ sqlRateLimiter }));
  app.use("/api/v2/auth", createAuthV2Routes());
  // 管理能力保留与 /api/admin 对齐的 v2 前缀，方便前端统一切流到 /api/v2。
  app.use("/api/v2/admin", createAdminRoutes());
  app.use("/api/v2/projects", createProjectV2Routes());
  app.use("/api/v2/system", createSystemV2Routes());
  // v2 兼容层：补齐项目配置、业务 API 管理、前端部署等历史控制面能力。
  app.use("/api/v2", createPlatformRoutes());
  app.use("/api/v2", createPlatformApiRoutes());
  app.use("/api/v2", createPlatformApiKeyRoutes());

  if (fs.existsSync(indexFile)) {
    // 对前端 SPA 的 history 路由做兜底，避免直接访问子路径 404。
    app.get("*", (req: Request, res: Response, next: NextFunction) => {
      if (req.path === "/api" || req.path.startsWith("/api/")) return next();
      if (/\.[^/]+$/.test(req.path)) return next();
      return res.sendFile(indexFile);
    });
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = err instanceof Error ? err.message : String(err || "服务器内部错误");
    return res.status(500).json({ ok: false, error: message });
  });

  return app;
}

module.exports = {
  createApp,
};
