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

function createApp() {
  const app = express();
  const sqlRateLimiter = createSqlRateLimiter(rateLimitConfig);

  app.use(express.json({ limit: "2mb" }));

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

  if (fs.existsSync(indexFile)) {
    app.get("*", (req, res, next) => {
      if (req.path === "/api" || req.path.startsWith("/api/")) return next();
      if (/\.[^/]+$/.test(req.path)) return next();
      return res.sendFile(indexFile);
    });
  }

  app.use((err, _req, res, _next) => {
    return res.status(500).json({ ok: false, error: err.message || "服务器内部错误" });
  });

  return app;
}

module.exports = {
  createApp,
};
