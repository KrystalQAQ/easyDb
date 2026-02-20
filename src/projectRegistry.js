const { platform } = require("./config");
const { getProjectEnvContext } = require("./projectStore");

const cache = new Map();

function cacheKey(projectKey, env) {
  return `${String(projectKey || "").toLowerCase()}::${String(env || "").toLowerCase()}`;
}

async function resolveProjectEnv(projectKey, env, options = {}) {
  const key = cacheKey(projectKey, env);
  const now = Date.now();
  const ttl = Math.max(1000, Number(platform.configCacheTtlMs || 15000));
  const forceRefresh = Boolean(options.forceRefresh);
  const cached = cache.get(key);

  // 热路径优先读缓存，减少每次请求都查平台配置表。
  if (!forceRefresh && cached && now - cached.fetchedAt <= ttl) {
    return cached.value;
  }

  const value = await getProjectEnvContext(projectKey, env);
  if (value) {
    cache.set(key, { value, fetchedAt: now });
  } else {
    cache.delete(key);
  }

  return value;
}

function invalidateProjectEnv(projectKey, env) {
  cache.delete(cacheKey(projectKey, env));
}

module.exports = {
  resolveProjectEnv,
  invalidateProjectEnv,
};
