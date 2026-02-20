const {
  db,
  defaultProject,
  allowedSqlTypes,
  allowedTables,
  roleTableMap,
  requireSelectLimit,
  maxSelectLimit,
  requestEncryption,
} = require("../src/config");
const { dbClient } = require("../src/db");
const { ensurePlatformTables, upsertProjectEnv } = require("../src/projectStore");

function mapRoleTableRules() {
  const rules = {};
  for (const [role, value] of roleTableMap.entries()) {
    if (value.allowAllTables) {
      rules[role] = "*";
      continue;
    }
    rules[role] = Array.from(value.tables.values());
  }
  return rules;
}

async function main() {
  await ensurePlatformTables();

  const context = await upsertProjectEnv(defaultProject.key, defaultProject.env, {
    status: "active",
    db: {
      host: db.host,
      port: db.port,
      user: db.user,
      password: db.password,
      database: db.database,
    },
    policy: {
      allowedSqlTypes: Array.from(allowedSqlTypes.values()),
      allowedTables: Array.from(allowedTables.values()),
      roleTables: mapRoleTableRules(),
      requireSelectLimit,
      maxSelectLimit,
    },
    requestEncryptionPassword: requestEncryption.enabled ? requestEncryption.password : "",
  });

  console.log(
    `Platform initialized. default gateway context: ${context.projectKey}/${context.env} -> ${context.db.host}:${context.db.port}/${context.db.database}`
  );
}

main()
  .catch((err) => {
    console.error("init platform db failed:", err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await dbClient.destroy();
  });
