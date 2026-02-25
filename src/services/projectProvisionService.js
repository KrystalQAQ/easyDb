const mysql = require("mysql2/promise");
const { platform } = require("../config");
const { listProjectEnvs, upsertProjectEnv } = require("../projectStore");
const { ensureProjectEnvNginxConfig } = require("./nginxConfigService");
const { isValidEnvKey, normalizeEnvKey } = require("../utils/validators");

function renderTemplate(template, values) {
  return String(template || "")
    .replaceAll("{projectKey}", values.projectKey)
    .replaceAll("{env}", values.env);
}

function normalizeDatabaseName(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9_]{1,64}$/.test(text)) {
    throw new Error("default database name is invalid, only [a-z0-9_] is allowed");
  }
  return text;
}

function normalizeMysqlWord(value, field) {
  const text = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9_]+$/.test(text)) {
    throw new Error(`${field} is invalid`);
  }
  return text;
}

function quoteIdentifier(name) {
  return `\`${String(name || "").replaceAll("`", "``")}\``;
}

function normalizeTableName(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9_]{1,64}$/.test(text)) {
    throw new Error(`invalid table name: ${value}`);
  }
  return text;
}

function buildInitTableSql(tableName) {
  const table = quoteIdentifier(tableName);
  if (tableName === "users") {
    return `CREATE TABLE IF NOT EXISTS ${table} (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      username VARCHAR(64) NOT NULL,
      display_name VARCHAR(128) NULL,
      email VARCHAR(128) NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'active',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_users_username (username)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;
  }

  if (tableName === "orders") {
    return `CREATE TABLE IF NOT EXISTS ${table} (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      order_no VARCHAR(64) NOT NULL,
      user_id BIGINT UNSIGNED NOT NULL,
      amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      status VARCHAR(32) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_orders_order_no (order_no),
      KEY idx_orders_user_id (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;
  }

  if (tableName === "products") {
    return `CREATE TABLE IF NOT EXISTS ${table} (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      sku VARCHAR(64) NULL,
      name VARCHAR(128) NOT NULL,
      price DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      stock INT NOT NULL DEFAULT 0,
      status VARCHAR(16) NOT NULL DEFAULT 'active',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_products_sku (sku)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;
  }

  return `CREATE TABLE IF NOT EXISTS ${table} (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    payload JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;
}

async function maybeCreateDatabase(db) {
  if (!db.autoCreateDatabase) return false;

  const connection = await mysql.createConnection({
    host: db.host,
    port: Number(db.port || 3306),
    user: db.user,
    password: db.password,
  });
  try {
    const charset = normalizeMysqlWord(db.charset, "PLATFORM_DEFAULT_DB_CHARSET");
    const collate = normalizeMysqlWord(db.collate, "PLATFORM_DEFAULT_DB_COLLATE");
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS ${quoteIdentifier(db.database)} CHARACTER SET ${charset} COLLATE ${collate}`
    );
    return true;
  } finally {
    await connection.end();
  }
}

async function maybeInitTables(db, tableSettings = {}) {
  if (!tableSettings.enabled) return [];

  const tableList = Array.from(
    new Set(
      (Array.isArray(tableSettings.tables) ? tableSettings.tables : []).map((item) => normalizeTableName(item))
    )
  );
  if (tableList.length === 0) return [];

  const connection = await mysql.createConnection({
    host: db.host,
    port: Number(db.port || 3306),
    user: db.user,
    password: db.password,
    database: db.database,
  });
  try {
    for (const table of tableList) {
      await connection.query(buildInitTableSql(table));
    }
    return tableList;
  } finally {
    await connection.end();
  }
}

async function testDbConnection({ host, port, user, password, database }) {
  const start = Date.now();
  const connection = await mysql.createConnection({
    host: String(host || "").trim(),
    port: Number(port || 3306),
    user: String(user || "").trim(),
    password: String(password || ""),
    database: database ? String(database).trim() : undefined,
    connectTimeout: 8000,
  });
  try {
    await connection.query("SELECT 1");
    return { ok: true, latencyMs: Date.now() - start };
  } finally {
    await connection.end();
  }
}

// options.manualDb: { host, port, user, password, database } — 手动模式，跳过自动建库
async function provisionDefaultEnvForProject(projectKey, options = {}) {
  const project = String(projectKey || "").trim().toLowerCase();
  if (!project) {
    throw new Error("projectKey is required");
  }

  const settings = platform.defaultEnv || {};
  const env = normalizeEnvKey(settings.envKey || "prod");
  if (!isValidEnvKey(env)) {
    throw new Error("PLATFORM_DEFAULT_ENV_KEY is invalid");
  }

  // 手动模式：直接使用传入的连接信息，不自动建库
  if (options.manualDb) {
    const { host, port, user, password, database } = options.manualDb;
    if (!host || !user || !database) {
      throw new Error("manual db settings are incomplete (host, user, database are required)");
    }
    const envs = await listProjectEnvs(project);
    const alreadyExists = envs.some((item) => item.env === env);
    const context = await upsertProjectEnv(project, env, {
      status: settings.status || "active",
      db: {
        host: String(host).trim(),
        port: Number(port || 3306),
        user: String(user).trim(),
        password: String(password || ""),
        database: String(database).trim(),
      },
      policy: {},
      requestEncryptionPassword: "",
    });
    const nginxConf = await ensureProjectEnvNginxConfig(project, env).catch(() => null);
    return {
      created: !alreadyExists,
      databaseCreated: false,
      initializedTables: [],
      nginxConf,
      context,
    };
  }

  // 自动模式：沿用原有逻辑
  if (!settings.autoCreateOnProjectCreate) {
    return null;
  }

  const db = settings.db || {};
  const databaseName = normalizeDatabaseName(
    renderTemplate(db.databaseTemplate || "{projectKey}_{env}", {
      projectKey: project,
      env,
    })
  );

  const host = String(db.host || "").trim();
  const user = String(db.user || "").trim();
  const password = String(db.password || "");
  const port = Number(db.port || 3306);
  if (!host || !user || !databaseName) {
    throw new Error("default env db settings are incomplete");
  }

  const envs = await listProjectEnvs(project);
  const alreadyExists = envs.some((item) => item.env === env);
  // 先按开关决定是否物理建库，再把连接信息写入平台配置表。
  const databaseCreated = await maybeCreateDatabase({
    host,
    port,
    user,
    password,
    database: databaseName,
    autoCreateDatabase: Boolean(db.autoCreateDatabase),
    charset: db.charset,
    collate: db.collate,
  });

  const context = await upsertProjectEnv(project, env, {
    status: settings.status || "active",
    db: {
      host,
      port,
      user,
      password,
      database: databaseName,
    },
    policy: {},
    requestEncryptionPassword: "",
  });
  // 项目开通完成后同步落地 Nginx conf，前端可直接走固定 /api 路径。
  const nginxConf = await ensureProjectEnvNginxConfig(project, env).catch(() => null);

  return {
    created: !alreadyExists,
    databaseCreated,
    nginxConf,
    context,
  };
}

module.exports = {
  provisionDefaultEnvForProject,
  testDbConnection,
};
