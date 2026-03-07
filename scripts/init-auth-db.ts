const { initializeRuntimeSettings } = require("../src/runtimeSettings");

async function main() {
  await initializeRuntimeSettings();

  const { dbClient } = require("../src/db");
  const { authUserTable } = require("../src/config");
  const { ensureAuthTablesAndSeeds } = require("../src/authInitialization");

  try {
    await ensureAuthTablesAndSeeds();
    console.log(`Auth tables initialized. users table: ${authUserTable}`);
  } finally {
    await dbClient.destroy();
  }
}

main().catch((err) => {
  console.error("init auth db failed:", err.message);
  process.exitCode = 1;
});

export {};
