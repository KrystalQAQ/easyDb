const { port } = require("./config");
const { ensurePlatformTables } = require("./projectStore");
const { createApp } = require("./app");

const app = createApp();

async function startServer() {
  try {
    await ensurePlatformTables();
  } catch (err) {
    console.warn("[platform] table ensure skipped:", err.message);
  }

  app.listen(port, () => {
    console.log(`SQL gateway listening on http://localhost:${port}`);
  });
}

void startServer();
