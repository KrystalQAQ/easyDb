const { dbClient } = require("./db");
const { platform } = require("./config");

// ---------------------------------------------------------------------------
// 接口定义缓存：key = "projectEnvId::apiKey"
// ---------------------------------------------------------------------------
const apiCache = new Map();
const API_CACHE_TTL_MS = 15000;

function apiCacheKey(projectEnvId, apiKey) {
  return `${projectEnvId}::${apiKey}`;
}

function invalidateApiCache(projectEnvId, apiKey) {
  if (apiKey) {
    apiCache.delete(apiCacheKey(projectEnvId, apiKey));
  } else {
    for (const key of apiCache.keys()) {
      if (key.startsWith(`${projectEnvId}::`)) {
        apiCache.delete(key);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// API Groups
// ---------------------------------------------------------------------------

async function listApiGroups(projectEnvId) {
  return dbClient(platform.tables.apiGroups)
    .select("id", "group_key", "name", "base_path", "description", "sort_order", "status", "created_at", "updated_at")
    .where({ project_env_id: projectEnvId })
    .orderBy("sort_order", "asc")
    .orderBy("group_key", "asc");
}

async function getApiGroup(projectEnvId, groupKey) {
  return dbClient(platform.tables.apiGroups)
    .select("id", "group_key", "name", "base_path", "description", "sort_order", "status", "created_at", "updated_at")
    .where({ project_env_id: projectEnvId, group_key: groupKey })
    .first();
}

async function createApiGroup(projectEnvId, data) {
  await dbClient(platform.tables.apiGroups).insert({
    project_env_id: projectEnvId,
    group_key: data.groupKey,
    name: data.name,
    base_path: data.basePath || "",
    description: data.description || "",
    sort_order: data.sortOrder || 0,
    status: data.status || "active",
    created_at: dbClient.fn.now(),
    updated_at: dbClient.fn.now(),
  });
  return getApiGroup(projectEnvId, data.groupKey);
}

async function updateApiGroup(projectEnvId, groupKey, data) {
  const row = {};
  if (data.name !== undefined) row.name = data.name;
  if (data.basePath !== undefined) row.base_path = data.basePath;
  if (data.description !== undefined) row.description = data.description;
  if (data.sortOrder !== undefined) row.sort_order = data.sortOrder;
  if (data.status !== undefined) row.status = data.status;
  row.updated_at = dbClient.fn.now();

  await dbClient(platform.tables.apiGroups)
    .where({ project_env_id: projectEnvId, group_key: groupKey })
    .update(row);
  return getApiGroup(projectEnvId, groupKey);
}

async function deleteApiGroup(projectEnvId, groupKey) {
  const group = await getApiGroup(projectEnvId, groupKey);
  if (!group) return false;
  // 将该分组下的接口设为无分组
  await dbClient(platform.tables.apis)
    .where({ project_env_id: projectEnvId, group_id: group.id })
    .update({ group_id: null, updated_at: dbClient.fn.now() });
  await dbClient(platform.tables.apiGroups)
    .where({ id: group.id })
    .del();
  return true;
}

// ---------------------------------------------------------------------------
// APIs
// ---------------------------------------------------------------------------

function formatApiRow(row) {
  return {
    id: row.id,
    projectEnvId: row.project_env_id,
    groupId: row.group_id,
    apiKey: row.api_key,
    name: row.name,
    description: row.description || "",
    method: row.method,
    path: row.path || "",
    sqlTemplate: row.sql_template,
    sqlType: row.sql_type,
    paramsSchema: typeof row.params_schema === "string" ? JSON.parse(row.params_schema || "[]") : (row.params_schema || []),
    resultMapping: typeof row.result_mapping === "string" ? JSON.parse(row.result_mapping || "null") : (row.result_mapping || null),
    cacheTTL: row.cache_ttl || 0,
    authMode: row.auth_mode,
    sortOrder: row.sort_order || 0,
    status: row.status,
    version: row.version,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listApis(projectEnvId, options = {}) {
  let query = dbClient(platform.tables.apis)
    .select("*")
    .where({ project_env_id: projectEnvId });

  if (options.groupId !== undefined) {
    query = query.where({ group_id: options.groupId });
  }
  if (options.status) {
    query = query.where({ status: options.status });
  }

  const rows = await query.orderBy("sort_order", "asc").orderBy("api_key", "asc");
  return rows.map(formatApiRow);
}

async function getApi(projectEnvId, apiKey) {
  const cacheK = apiCacheKey(projectEnvId, apiKey);
  const cached = apiCache.get(cacheK);
  if (cached && Date.now() - cached.ts < API_CACHE_TTL_MS) {
    return cached.value;
  }

  const row = await dbClient(platform.tables.apis)
    .select("*")
    .where({ project_env_id: projectEnvId, api_key: apiKey })
    .first();

  const result = row ? formatApiRow(row) : null;
  apiCache.set(cacheK, { ts: Date.now(), value: result });
  return result;
}

async function createApi(projectEnvId, data) {
  const paramsSchema = data.paramsSchema || [];
  const resultMapping = data.resultMapping || null;

  await dbClient(platform.tables.apis).insert({
    project_env_id: projectEnvId,
    group_id: data.groupId || null,
    api_key: data.apiKey,
    name: data.name,
    description: data.description || "",
    method: data.method || "POST",
    path: data.path || "",
    sql_template: data.sqlTemplate,
    sql_type: data.sqlType,
    params_schema: JSON.stringify(paramsSchema),
    result_mapping: resultMapping ? JSON.stringify(resultMapping) : null,
    cache_ttl: data.cacheTTL || 0,
    auth_mode: data.authMode || "token",
    sort_order: data.sortOrder || 0,
    status: data.status || "active",
    version: 1,
    created_by: data.actor || null,
    updated_by: data.actor || null,
    created_at: dbClient.fn.now(),
    updated_at: dbClient.fn.now(),
  });

  invalidateApiCache(projectEnvId, data.apiKey);
  return getApi(projectEnvId, data.apiKey);
}

async function updateApi(projectEnvId, apiKey, data) {
  const existing = await dbClient(platform.tables.apis)
    .select("id", "version")
    .where({ project_env_id: projectEnvId, api_key: apiKey })
    .first();
  if (!existing) return null;

  const row = { updated_at: dbClient.fn.now(), version: (existing.version || 1) + 1 };
  if (data.name !== undefined) row.name = data.name;
  if (data.description !== undefined) row.description = data.description;
  if (data.groupId !== undefined) row.group_id = data.groupId || null;
  if (data.method !== undefined) row.method = data.method;
  if (data.path !== undefined) row.path = data.path;
  if (data.sqlTemplate !== undefined) row.sql_template = data.sqlTemplate;
  if (data.sqlType !== undefined) row.sql_type = data.sqlType;
  if (data.paramsSchema !== undefined) row.params_schema = JSON.stringify(data.paramsSchema || []);
  if (data.resultMapping !== undefined) row.result_mapping = data.resultMapping ? JSON.stringify(data.resultMapping) : null;
  if (data.cacheTTL !== undefined) row.cache_ttl = data.cacheTTL;
  if (data.authMode !== undefined) row.auth_mode = data.authMode;
  if (data.sortOrder !== undefined) row.sort_order = data.sortOrder;
  if (data.status !== undefined) row.status = data.status;
  if (data.actor !== undefined) row.updated_by = data.actor;

  await dbClient(platform.tables.apis).where({ id: existing.id }).update(row);
  invalidateApiCache(projectEnvId, apiKey);
  return getApi(projectEnvId, apiKey);
}

async function deleteApi(projectEnvId, apiKey) {
  const deleted = await dbClient(platform.tables.apis)
    .where({ project_env_id: projectEnvId, api_key: apiKey })
    .del();
  invalidateApiCache(projectEnvId, apiKey);
  return deleted > 0;
}

module.exports = {
  listApiGroups,
  getApiGroup,
  createApiGroup,
  updateApiGroup,
  deleteApiGroup,
  listApis,
  getApi,
  createApi,
  updateApi,
  deleteApi,
  invalidateApiCache,
};
