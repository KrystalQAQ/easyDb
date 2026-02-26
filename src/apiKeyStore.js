/**
 * API Key 存储层
 *
 * key 格式: edb_<projectKey>_<32位随机hex>
 * 存储时只保存 SHA-256 哈希，原始 key 只在创建时返回一次。
 */

const crypto = require("crypto");
const { dbClient } = require("./db");
const { platform } = require("./config");

const TABLE = "gateway_api_keys";

// ─── 建表 ──────────────────────────────────────────────────────────────────────

async function ensureApiKeysTable() {
  const exists = await dbClient.schema.hasTable(TABLE);
  if (exists) return;

  await dbClient.schema.createTable(TABLE, (t) => {
    t.bigIncrements("id").primary();
    // 关联到 project_env，key 的权限范围就是这个项目+环境
    t.bigInteger("project_env_id").notNullable();
    t.string("project_key", 64).notNullable();
    t.string("env_key", 32).notNullable();
    // 人类可读名称，例如 "Cursor MCP - 张三"
    t.string("name", 128).notNullable();
    // 只存 SHA-256 哈希，原始 key 不落库
    t.string("key_hash", 64).notNullable().unique();
    // 前缀用于展示，例如 "edb_crm_a1b2c3..."（只显示前16位）
    t.string("key_prefix", 20).notNullable();
    t.enu("status", ["active", "revoked"]).notNullable().defaultTo("active");
    t.string("created_by", 64).nullable();
    t.timestamp("last_used_at").nullable();
    t.timestamp("expires_at").nullable();
    t.timestamp("created_at").notNullable().defaultTo(dbClient.fn.now());
    t.index(["project_env_id"], "idx_api_keys_env_id");
    t.index(["key_hash"], "idx_api_keys_hash");
  });
}

// ─── 工具函数 ──────────────────────────────────────────────────────────────────

function generateRawKey(projectKey) {
  const rand = crypto.randomBytes(20).toString("hex"); // 40 hex chars
  return `edb_${projectKey}_${rand}`;
}

function hashKey(rawKey) {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

function keyPrefix(rawKey) {
  // 保留前 20 个字符用于展示，例如 "edb_crm_a1b2c3d4e5"
  return rawKey.slice(0, 20);
}

// ─── CRUD ──────────────────────────────────────────────────────────────────────

async function createApiKey({ projectEnvId, projectKey, envKey, name, createdBy, expiresAt }) {
  const rawKey = generateRawKey(projectKey);
  const hash = hashKey(rawKey);
  const prefix = keyPrefix(rawKey);

  await dbClient(TABLE).insert({
    project_env_id: projectEnvId,
    project_key: projectKey,
    env_key: envKey,
    name: String(name || "").trim() || "未命名",
    key_hash: hash,
    key_prefix: prefix,
    status: "active",
    created_by: createdBy || null,
    expires_at: expiresAt || null,
    created_at: dbClient.fn.now(),
  });

  // 原始 key 只在这里返回一次，之后无法再查
  return { rawKey, prefix, name, projectKey, envKey };
}

async function listApiKeys(projectEnvId) {
  const rows = await dbClient(TABLE)
    .select("id", "name", "key_prefix", "status", "created_by", "last_used_at", "expires_at", "created_at")
    .where({ project_env_id: projectEnvId })
    .orderBy("created_at", "desc");

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    keyPrefix: r.key_prefix,
    status: r.status,
    createdBy: r.created_by,
    lastUsedAt: r.last_used_at,
    expiresAt: r.expires_at,
    createdAt: r.created_at,
  }));
}

async function revokeApiKey(id, projectEnvId) {
  const affected = await dbClient(TABLE)
    .where({ id, project_env_id: projectEnvId })
    .update({ status: "revoked" });
  return affected > 0;
}

async function deleteApiKey(id, projectEnvId) {
  const affected = await dbClient(TABLE)
    .where({ id, project_env_id: projectEnvId })
    .del();
  return affected > 0;
}

// ─── 认证 ──────────────────────────────────────────────────────────────────────

/**
 * 验证 raw key，返回 key 记录（含 projectKey/envKey）或 null
 */
async function verifyApiKey(rawKey) {
  if (!rawKey || !rawKey.startsWith("edb_")) return null;

  const hash = hashKey(rawKey);
  const row = await dbClient(TABLE)
    .select("id", "project_key", "env_key", "name", "status", "expires_at")
    .where({ key_hash: hash })
    .first();

  if (!row) return null;
  if (row.status !== "active") return null;
  if (row.expires_at && new Date(row.expires_at) < new Date()) return null;

  // 异步更新 last_used_at，不阻塞请求
  dbClient(TABLE).where({ id: row.id }).update({ last_used_at: dbClient.fn.now() }).catch(() => {});

  return {
    id: row.id,
    projectKey: row.project_key,
    envKey: row.env_key,
    name: row.name,
  };
}

module.exports = {
  ensureApiKeysTable,
  createApiKey,
  listApiKeys,
  revokeApiKey,
  deleteApiKey,
  verifyApiKey,
};
