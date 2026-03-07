const {
  getBootstrapInitReport,
  getBootstrapStatus,
  initializeBootstrapRuntime,
  resetBootstrapRuntime,
} = require("./bootstrapRuntime");

/**
 * 启动入口：优先尝试运行时初始化；若未完成 DB 引导则以前端引导模式启动。
 */
async function startServer() {
  try {
    const bootstrapStatus = await initializeBootstrapRuntime();
    if (!bootstrapStatus.initialized) {
      console.warn("[bootstrap] gateway started in setup mode:", bootstrapStatus.lastError);
    }
    // 注意：必须在 runtime settings 初始化后再加载 config/app，
    // 否则会缓存到未注入运行配置的旧值（例如 CONFIG_ENCRYPTION_KEY）。
    const { port } = require("./config");
    const { createApp } = require("./app");

    const app = createApp({
      getBootstrapInitReport,
      getBootstrapStatus,
      initializeBootstrapRuntime,
      resetBootstrapRuntime,
    });
    app.listen(port, () => {
      console.log(`SQL gateway listening on http://localhost:${port}`);
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("fatal startup error:", message);
    process.exitCode = 1;
  }
}

void startServer();

export {};
