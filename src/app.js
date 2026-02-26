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

  app.use(express.json({ limit: "256kb" }));

  const demoDistDir = path.resolve(process.cwd(), "frontend-app/dist");
  const demoIndexFile = path.join(demoDistDir, "index.html");
  if (fs.existsSync(demoIndexFile)) {
    app.use(
      "/demo",
      express.static(demoDistDir, {
        index: false,
        maxAge: "1h",
      })
    );
    app.get("/demo/*", (req, res, next) => {
      if (/\.[^/]+$/.test(req.path)) return next();
      return res.sendFile(demoIndexFile);
    });
  } else {
    app.use("/demo", express.static(path.resolve(process.cwd(), "frontend-demo")));
  }
  // 保留旧路由，确保老前端在迁移到多项目前缀前仍可继续访问。
  app.use("/api", createLegacyRoutes({ sqlRateLimiter }));
  app.use("/api/admin", createAdminRoutes());
  app.use("/api/platform", createPlatformRoutes());
  app.use("/api/platform", createPlatformApiRoutes());
  app.use("/api/platform", createPlatformApiKeyRoutes());
  app.use("/api/gw", createGatewayRoutes({ sqlRateLimiter }));
  app.use("/api/gw", createGatewayApiRoutes({ sqlRateLimiter }));

  app.use((err, _req, res, _next) => {
    return res.status(500).json({ ok: false, error: err.message || "服务器内部错误" });
  });

  return app;
}

module.exports = {
  createApp,
};
