const path = require("path");
const fs = require("fs");
const express = require("express");

function mountFrontendApp(app, frontendConfig) {
  if (!frontendConfig.enabled) return;

  const indexFile = path.join(frontendConfig.distDir, "index.html");
  if (!fs.existsSync(indexFile)) {
    console.warn(
      `[frontend] skipped: index.html not found at ${indexFile}. ` +
        "Set FRONTEND_DIST_DIR correctly or set FRONTEND_ENABLED=false."
    );
    return;
  }

  app.use(
    express.static(frontendConfig.distDir, {
      index: false,
      maxAge: "1h",
    })
  );

  app.get("*", (req, res, next) => {
    if (req.method !== "GET") return next();
    if (req.path === "/api") return next();
    if (req.path.startsWith("/api/")) return next();
    if (req.path === "/demo") return next();
    if (req.path.startsWith("/demo/")) return next();
    if (/\.[^/]+$/.test(req.path)) return next();
    return res.sendFile(indexFile);
  });
}

module.exports = {
  mountFrontendApp,
};
