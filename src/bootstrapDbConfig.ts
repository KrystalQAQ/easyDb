const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(process.cwd(), ".env"), quiet: true });

const BOOTSTRAP_DB_CONFIG_PATH = path.resolve(process.cwd(), "runtime", "bootstrap-db.json");

type DbBootstrapConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
};

type ResolvedBootstrapDbConfig = DbBootstrapConfig & {
  source: "env" | "file";
};

function parsePort(value: unknown, fallback = 3306): number {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : fallback;
}

function normalizeDbBootstrapConfig(raw: unknown): DbBootstrapConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const payload = raw as Record<string, unknown>;
  const host = String(payload.host || "").trim();
  const user = String(payload.user || "").trim();
  const database = String(payload.database || "").trim();
  if (!host || !user || !database) return null;
  return {
    host,
    port: parsePort(payload.port, 3306),
    user,
    password: String(payload.password || ""),
    database,
  };
}

function applyBootstrapDbConfigToProcessEnv(config: DbBootstrapConfig): void {
  process.env.DB_HOST = config.host;
  process.env.DB_PORT = String(config.port);
  process.env.DB_USER = config.user;
  process.env.DB_PASSWORD = config.password;
  process.env.DB_NAME = config.database;
}

function getEnvBootstrapConfig(): ResolvedBootstrapDbConfig | null {
  const config = normalizeDbBootstrapConfig({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  if (!config) return null;
  return {
    ...config,
    source: "env",
  };
}

function getFileBootstrapConfig(): ResolvedBootstrapDbConfig | null {
  if (!fs.existsSync(BOOTSTRAP_DB_CONFIG_PATH)) return null;
  try {
    const raw = fs.readFileSync(BOOTSTRAP_DB_CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw);
    const config = normalizeDbBootstrapConfig(parsed);
    if (!config) return null;
    return {
      ...config,
      source: "file",
    };
  } catch {
    return null;
  }
}

/**
 * 优先读取本地 bootstrap 文件；若未配置再回退环境变量。
 * 这样前端引导写入的配置在重启后仍可生效，不会被旧 .env 覆盖。
 */
function resolveBootstrapDbConfig(): ResolvedBootstrapDbConfig | null {
  const fileConfig = getFileBootstrapConfig();
  if (fileConfig) return fileConfig;
  return getEnvBootstrapConfig();
}

function saveBootstrapDbConfig(input: unknown): DbBootstrapConfig {
  const config = normalizeDbBootstrapConfig(input);
  if (!config) {
    throw new Error("数据库配置不完整，请填写 host、user、database");
  }

  const dir = path.dirname(BOOTSTRAP_DB_CONFIG_PATH);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(BOOTSTRAP_DB_CONFIG_PATH, JSON.stringify(config, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
  applyBootstrapDbConfigToProcessEnv(config);
  return config;
}

function deleteBootstrapDbConfig(): void {
  if (fs.existsSync(BOOTSTRAP_DB_CONFIG_PATH)) {
    fs.unlinkSync(BOOTSTRAP_DB_CONFIG_PATH);
  }
}

module.exports = {
  BOOTSTRAP_DB_CONFIG_PATH,
  applyBootstrapDbConfigToProcessEnv,
  deleteBootstrapDbConfig,
  resolveBootstrapDbConfig,
  saveBootstrapDbConfig,
};

export {};
