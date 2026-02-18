const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(process.cwd(), ".env"), quiet: true });

function parseCsv(value) {
  if (!value || !value.trim()) return [];
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
}

function parseNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function parseAuthUsers(value) {
  const users = new Map();
  if (!value || !value.trim()) return users;

  const items = value.split(";").map((v) => v.trim()).filter(Boolean);
  for (const item of items) {
    const [username, password, role = "user"] = item.split(":").map((v) => v.trim());
    if (!username || !password) continue;
    users.set(username, { username, password, role: role.toLowerCase() });
  }
  return users;
}

function parseRoleTables(value) {
  const roleTableMap = new Map();
  if (!value || !value.trim()) return roleTableMap;

  const roleRules = value.split(";").map((v) => v.trim()).filter(Boolean);
  for (const roleRule of roleRules) {
    const [roleName, tableRule = ""] = roleRule.split(":").map((v) => v.trim());
    if (!roleName) continue;

    const role = roleName.toLowerCase();
    if (tableRule === "*") {
      roleTableMap.set(role, { allowAllTables: true, tables: new Set() });
      continue;
    }

    const tables = tableRule
      .split("|")
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean);
    roleTableMap.set(role, { allowAllTables: false, tables: new Set(tables) });
  }

  return roleTableMap;
}

const allowedSqlTypes = parseCsv(process.env.ALLOWED_SQL_TYPES || "select");
const allowedTables = parseCsv(process.env.ALLOWED_TABLES);
const corsOrigins = parseCsv(process.env.CORS_ORIGINS || "*");
const cspImgSrc = parseCsv(process.env.CSP_IMG_SRC || "'self',data:");
const cspConnectSrc = parseCsv(process.env.CSP_CONNECT_SRC || "'self'");
const cspScriptSrc = parseCsv(process.env.CSP_SCRIPT_SRC || "'self'");
const authUsers = parseAuthUsers(
  process.env.AUTH_USERS ||
    "admin:$2b$12$mLx1iKiVhFY8vgs.uuV.JeU0QhF9yRDu6cMA1tlutj7u/TWz4HRwO:admin;analyst:$2b$12$q1pEp4/o6svhpA.Rse.tAeUKVmk40YjYQoL5FhwPNARAdSXVUO/ci:analyst"
);
const roleTableMap = parseRoleTables(process.env.ROLE_TABLES || "admin:*;analyst:users|orders");

module.exports = {
  port: parseNumber(process.env.PORT, 3000),
  db: {
    host: process.env.DB_HOST || "127.0.0.1",
    port: parseNumber(process.env.DB_PORT, 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "",
  },
  corsOrigins,
  requireAuth: parseBoolean(process.env.REQUIRE_AUTH, true),
  jwtSecret: process.env.JWT_SECRET || "change-this-secret-in-production",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "8h",
  bcryptRounds: parseNumber(process.env.BCRYPT_ROUNDS, 12),
  authProvider: (process.env.AUTH_PROVIDER || "env").toLowerCase(),
  authUserTable: process.env.AUTH_USER_TABLE || "gateway_users",
  authUsers,
  roleTableMap,
  rateLimit: {
    windowMs: parseNumber(process.env.RATE_LIMIT_WINDOW_MS, 60000),
    max: parseNumber(process.env.RATE_LIMIT_MAX, 60),
  },
  auditQueryMaxLimit: parseNumber(process.env.AUDIT_QUERY_MAX_LIMIT, 500),
  adminUserQueryMaxLimit: parseNumber(process.env.ADMIN_USER_QUERY_MAX_LIMIT, 200),
  auditLogFile: process.env.AUDIT_LOG_FILE || path.resolve(process.cwd(), "logs", "audit.log"),
  frontend: {
    enabled: parseBoolean(process.env.FRONTEND_ENABLED, true),
    distDir: path.resolve(process.cwd(), process.env.FRONTEND_DIST_DIR || "frontend-dist"),
  },
  csp: {
    enabled: parseBoolean(process.env.CSP_ENABLED, true),
    imgSrc: cspImgSrc,
    connectSrc: cspConnectSrc,
    scriptSrc: cspScriptSrc,
  },
  requestEncryption: {
    enabled: parseBoolean(process.env.REQUEST_ENCRYPTION_ENABLED, true),
    allowPlaintext: parseBoolean(process.env.REQUEST_ENCRYPTION_ALLOW_PLAINTEXT, true),
    password: process.env.REQUEST_ENCRYPTION_PASSWORD || "replace-with-long-shared-password",
  },
  allowedSqlTypes: new Set(allowedSqlTypes.map((v) => v.toLowerCase())),
  allowedTables: new Set(allowedTables.map((v) => v.toLowerCase())),
  requireSelectLimit: parseBoolean(process.env.REQUIRE_SELECT_LIMIT, true),
  maxSelectLimit: parseNumber(process.env.MAX_SELECT_LIMIT, 500),
};
