const crypto = require("crypto");
const mysql = require("mysql2/promise");
const path = require("path");
const dotenv = require("dotenv");
const { resolveBootstrapDbConfig } = require("./bootstrapDbConfig");

dotenv.config({ path: path.resolve(process.cwd(), ".env"), quiet: true });

const SETTINGS_TABLE = "gateway_platform_settings";

const SECRET_SETTING_KEYS = new Set([
  "JWT_SECRET",
  "CONFIG_ENCRYPTION_KEY",
  "REQUEST_ENCRYPTION_PASSWORD",
  "PLATFORM_DEFAULT_DB_PASSWORD",
]);

function parseIntSafe(value: unknown, fallback: number): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function randomSecret(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

function quoteIdentifier(identifier: string): string {
  return `\`${String(identifier || "").replaceAll("`", "``")}\``;
}

type DbBootstrapConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
};

type RuntimeSettingMap = Record<string, string>;

function getDbBootstrapConfig(): DbBootstrapConfig {
  const resolved = resolveBootstrapDbConfig();
  if (!resolved) {
    throw new Error("数据库尚未初始化，请先在前端完成数据库引导");
  }
  return {
    host: resolved.host,
    port: parseIntSafe(resolved.port, 3306),
    user: resolved.user,
    password: resolved.password,
    database: resolved.database,
  };
}

/**
 * 运行配置默认值。
 * 首次启动会写入 DB；后续仅在缺失时补齐，不覆盖已有配置。
 */
function buildDefaultRuntimeSettings(dbConfig: DbBootstrapConfig): RuntimeSettingMap {
  const jwtSecret = randomSecret(48);
  const configEncryptionKey = randomSecret(32);
  const requestEncryptionPassword = randomSecret(32);

  return {
    REQUIRE_AUTH: "true",
    JWT_SECRET: jwtSecret,
    JWT_EXPIRES_IN: "8h",
    JWT_ISSUER: "",
    JWT_AUDIENCE: "",

    AUTH_CODE_ENABLED: "true",
    AUTH_CODE_TTL_SECONDS: "60",
    AUTH_CODE_MAX_STORE_SIZE: "5000",
    AUTH_CODE_ALLOWED_REDIRECT_ORIGINS: "",

    AUTH_PROVIDER: "db",
    BCRYPT_ROUNDS: "12",
    AUTH_USER_TABLE: "gateway_users",

    ROLE_TABLES: "admin:*;analyst:users|orders",
    ALLOWED_SQL_TYPES: "select,insert,update,delete",
    ALLOWED_TABLES: "",
    REQUIRE_SELECT_LIMIT: "true",
    MAX_SELECT_LIMIT: "500",

    RATE_LIMIT_WINDOW_MS: "60000",
    RATE_LIMIT_MAX: "60",
    AUDIT_QUERY_MAX_LIMIT: "500",
    ADMIN_USER_QUERY_MAX_LIMIT: "200",
    AUDIT_LOG_FILE: "./logs/audit.log",

    REQUEST_ENCRYPTION_ENABLED: "false",
    REQUEST_ENCRYPTION_ALLOW_PLAINTEXT: "true",
    REQUEST_ENCRYPTION_PASSWORD: requestEncryptionPassword,

    DEFAULT_PROJECT_KEY: "default",
    DEFAULT_PROJECT_ENV: "prod",
    PROJECT_CONFIG_CACHE_TTL_MS: "15000",
    CONFIG_ENCRYPTION_KEY: configEncryptionKey,

    PLATFORM_AUTO_CREATE_DEFAULT_ENV: "true",
    PLATFORM_DEFAULT_ENV_KEY: "prod",
    PLATFORM_DEFAULT_ENV_STATUS: "active",
    PLATFORM_DEFAULT_DB_HOST: dbConfig.host,
    PLATFORM_DEFAULT_DB_PORT: String(dbConfig.port),
    PLATFORM_DEFAULT_DB_USER: dbConfig.user,
    PLATFORM_DEFAULT_DB_PASSWORD: dbConfig.password,
    PLATFORM_DEFAULT_DB_NAME_TEMPLATE: "{projectKey}_{env}",
    PLATFORM_AUTO_CREATE_DATABASE: "true",
    PLATFORM_DEFAULT_DB_CHARSET: "utf8mb4",
    PLATFORM_DEFAULT_DB_COLLATE: "utf8mb4_unicode_ci",
    PLATFORM_AUTO_INIT_TABLES: "false",
    PLATFORM_DEFAULT_INIT_TABLES: "users,orders,products",

    NGINX_CONFIG_ENABLED: "true",
    NGINX_AUTO_GENERATE_ON_PROJECT_CREATE: "true",
    NGINX_CONF_DIR: "./runtime/nginx/conf.d",
    NGINX_CONF_FILENAME_TEMPLATE: "{projectKey}_{env}.conf",
    NGINX_SERVER_NAME_TEMPLATE: "{projectKey}.local",
    NGINX_LISTEN_PORT: "80",
    NGINX_FRONTEND_ROOT: "/app/frontend-app/dist",
    NGINX_AUTO_CREATE_FRONTEND_DIR: "true",
    NGINX_PROJECT_FRONTEND_DIR_TEMPLATE: "./runtime/project-web/{projectKey}/{env}/current",
    NGINX_PROJECT_FRONTEND_WEB_ROOT_TEMPLATE: "/app/runtime/project-web/{projectKey}/{env}/current",
    NGINX_UPSTREAM_ORIGIN: "http://127.0.0.1:3000",
    NGINX_PATH_ROUTING_ENABLED: "true",
    NGINX_PATH_BASE_PREFIX: "/p",
    NGINX_PATH_SERVER_NAME: "_",
    NGINX_PATH_ROUTING_CONF_FILENAME: "easydb_path_routing.conf",
    NGINX_RELOAD_COMMAND: "nginx -s reload",
  };
}

async function ensureDatabaseExists(dbConfig: DbBootstrapConfig): Promise<void> {
  const connection = await mysql.createConnection({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
  });

  try {
    try {
      await connection.query(
        `CREATE DATABASE IF NOT EXISTS ${quoteIdentifier(dbConfig.database)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
      );
    } catch (err: any) {
      // 低权限账号可能没有 CREATE DATABASE 权限，交由后续连接阶段判断库是否可用。
      const code = String(err.code || "");
      const noCreatePrivilege = new Set([
        "ER_DBACCESS_DENIED_ERROR",
        "ER_ACCESS_DENIED_ERROR",
        "ER_SPECIFIC_ACCESS_DENIED_ERROR",
      ]);
      if (!noCreatePrivilege.has(code)) {
        throw err;
      }
    }
  } finally {
    await connection.end();
  }
}

async function ensureSettingsTable(connection: any): Promise<void> {
  await connection.query(
    `CREATE TABLE IF NOT EXISTS ${quoteIdentifier(SETTINGS_TABLE)} (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      setting_key VARCHAR(128) NOT NULL,
      setting_value_text TEXT NOT NULL,
      is_secret TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_setting_key (setting_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );
}

async function ensureDefaultSettings(connection: any, defaults: RuntimeSettingMap): Promise<void> {
  const keys = Object.keys(defaults);
  for (const key of keys) {
    await connection.query(
      `INSERT IGNORE INTO ${quoteIdentifier(SETTINGS_TABLE)} (setting_key, setting_value_text, is_secret) VALUES (?, ?, ?)`,
      [key, String(defaults[key] || ""), SECRET_SETTING_KEYS.has(key) ? 1 : 0]
    );
  }
}

async function loadSettings(connection: any): Promise<RuntimeSettingMap> {
  const [rows] = await connection.query(
    `SELECT setting_key, setting_value_text FROM ${quoteIdentifier(SETTINGS_TABLE)} ORDER BY setting_key ASC`
  );

  const values: RuntimeSettingMap = {};
  for (const row of rows) {
    if (!row || !row.setting_key) continue;
    values[row.setting_key] = String(row.setting_value_text || "");
  }
  return values;
}

function applySettingsToProcessEnv(values: RuntimeSettingMap): void {
  for (const [key, value] of Object.entries(values)) {
    process.env[key] = String(value);
  }
}

async function initializeRuntimeSettings(): Promise<RuntimeSettingMap> {
  const dbConfig = getDbBootstrapConfig();
  await ensureDatabaseExists(dbConfig);

  const connection = await mysql.createConnection({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,
  });

  try {
    await ensureSettingsTable(connection);
    const defaults = buildDefaultRuntimeSettings(dbConfig);
    await ensureDefaultSettings(connection, defaults);
    const values = await loadSettings(connection);
    applySettingsToProcessEnv(values);
    return values;
  } finally {
    await connection.end();
  }
}

module.exports = {
  SETTINGS_TABLE,
  initializeRuntimeSettings,
};

export {};
