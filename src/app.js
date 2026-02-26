const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");
const fs = require("fs");
const {
  corsOrigins,
  frontend,
  csp,
  coopEnabled,
  rateLimit: rateLimitConfig,
} = require("./config");
const { createSqlRateLimiter } = require("./services/sqlGatewayService");
const { createLegacyRoutes } = require("./routes/legacyRoutes");
const { createAdminRoutes } = require("./routes/adminRoutes");
const { createPlatformRoutes } = require("./routes/platformRoutes");
const { createGatewayRoutes } = require("./routes/gatewayRoutes");
const { createGatewayApiRoutes } = require("./routes/gatewayApiRoutes");
const { createShortApiRoutes } = require("./routes/shortApiRoutes");
const { createPlatformApiRoutes } = require("./routes/platformApiRoutes");
const { createPlatformApiKeyRoutes } = require("./routes/platformApiKeyRoutes");
const { mountFrontendApp } = require("./http/mountFrontendApp");

function createApp() {
  const app = express();
  const sqlRateLimiter = createSqlRateLimiter(rateLimitConfig);

  app.use(
    helmet({
      crossOriginOpenerPolicy: coopEnabled ? { policy: "same-origin" } : false,
      contentSecurityPolicy: csp.enabled
        ? {
            useDefaults: true,
            directives: {
              "img-src": csp.imgSrc,
              "connect-src": csp.connectSrc,
              "script-src": csp.scriptSrc,
            },
          }
        : false,
    })
  );
  app.use(express.json({ limit: "256kb" }));
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || corsOrigins.includes("*") || corsOrigins.includes(origin)) {
          return callback(null, true);
        }
        return callback(new Error("CORS blocked"));
      },
    })
  );

  const demoIndexFile = path.join(frontend.distDir, "index.html");
  if (fs.existsSync(demoIndexFile)) {
    app.use(
      "/demo",
      express.static(frontend.distDir, {
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
  app.use("/api", createShortApiRoutes({ sqlRateLimiter }));

  // 前端 history fallback 必须最后挂载，避免误吞 API 请求。
  mountFrontendApp(app, frontend);

  app.use((err, _req, res, _next) => {
    return res.status(500).json({ ok: false, error: err.message || "服务器内部错误" });
  });

  return app;
}

module.exports = {
  createApp,
};
