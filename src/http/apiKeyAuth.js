/**
 * API Key 认证中间件
 *
 * 从 Authorization: Bearer edb_xxx 或 X-Api-Key: edb_xxx 读取 key
 * 验证通过后在 req 上注入：
 *   req.apiKeyContext = { projectKey, envKey, keyName }
 *   req.user = { username: keyName, role: "api-key" }
 */

const { verifyApiKey } = require("../apiKeyStore");

async function authenticateApiKey(req, res, next) {
  let rawKey = null;

  const xApiKey = req.headers["x-api-key"];
  if (xApiKey && xApiKey.startsWith("edb_")) {
    rawKey = xApiKey.trim();
  } else {
    const auth = req.headers.authorization || "";
    if (auth.startsWith("Bearer edb_")) {
      rawKey = auth.slice("Bearer ".length).trim();
    }
  }

  if (!rawKey) {
    return res.status(401).json({ ok: false, error: "缺少 API Key（X-Api-Key 或 Bearer edb_...）" });
  }

  const record = await verifyApiKey(rawKey);
  if (!record) {
    return res.status(401).json({ ok: false, error: "API Key 无效或已吊销" });
  }

  req.apiKeyContext = {
    projectKey: record.projectKey,
    envKey: record.envKey,
    keyName: record.name,
  };
  // 让下游中间件（requireAdmin 等）能识别身份
  req.user = { username: record.name, role: "api-key" };

  return next();
}

module.exports = { authenticateApiKey };
