const fs = require("fs");
const https = require("https");
const { port, https: httpsConfig } = require("./config");
const { ensurePlatformTables } = require("./projectStore");
const { createApp } = require("./app");

const app = createApp();

async function startServer() {
  try {
    await ensurePlatformTables();
  } catch (err) {
    console.warn("[platform] table ensure skipped:", err.message);
  }

  if (!httpsConfig.enabled) {
    app.listen(port, () => {
      console.log(`SQL gateway listening on http://localhost:${port}`);
    });
    return;
  }

  const tlsOptions = {
    cert: null,
    key: null,
  };

  try {
    tlsOptions.cert = fs.readFileSync(httpsConfig.certPath);
    tlsOptions.key = fs.readFileSync(httpsConfig.keyPath);
  } catch (err) {
    console.error("[https] failed to read cert/key:", err.message);
    process.exit(1);
  }

  https.createServer(tlsOptions, app).listen(port, () => {
    console.log(`SQL gateway listening on https://localhost:${port}`);
  });
}

void startServer();
