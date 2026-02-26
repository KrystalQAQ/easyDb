/**
 * API Key 管理路由
 * 挂载在 /api/platform/projects/:projectKey/envs/:env/api-keys
 * 需要 admin JWT 认证
 */

const express = require("express");
const { authenticate } = require("../auth");
const { requireAdmin } = require("../http/adminCommon");
const { findProjectEnvRecord } = require("../projectStore");
const {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  deleteApiKey,
} = require("../apiKeyStore");

function createPlatformApiKeyRoutes() {
  const router = express.Router();
  router.use(authenticate, requireAdmin);

  async function resolveEnv(req, res) {
    const projectKey = String(req.params.projectKey || "").trim().toLowerCase();
    const env = String(req.params.env || "").trim().toLowerCase();
    if (!projectKey || !env) {
      res.status(400).json({ ok: false, error: "projectKey/env 不能为空" });
      return null;
    }
    const record = await findProjectEnvRecord(projectKey, env);
    if (!record) {
      res.status(404).json({ ok: false, error: "项目环境不存在" });
      return null;
    }
    return { projectKey, env, envId: record.env_id };
  }

  // GET  列出所有 key（不返回原始 key，只返回前缀）
  router.get("/projects/:projectKey/envs/:env/api-keys", async (req, res) => {
    const ctx = await resolveEnv(req, res);
    if (!ctx) return;
    try {
      const keys = await listApiKeys(ctx.envId);
      return res.json({ ok: true, keys });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  // POST 创建新 key（原始 key 只在响应里出现一次）
  router.post("/projects/:projectKey/envs/:env/api-keys", async (req, res) => {
    const ctx = await resolveEnv(req, res);
    if (!ctx) return;
    const { name, expiresAt } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ ok: false, error: "name 不能为空" });
    }
    try {
      const result = await createApiKey({
        projectEnvId: ctx.envId,
        projectKey: ctx.projectKey,
        envKey: ctx.env,
        name: String(name).trim(),
        createdBy: req.user.username,
        expiresAt: expiresAt || null,
      });
      return res.json({
        ok: true,
        // rawKey 只在这里返回一次，请立即保存
        rawKey: result.rawKey,
        keyPrefix: result.prefix,
        name: result.name,
        projectKey: result.projectKey,
        env: result.envKey,
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  // PUT /:id/revoke  吊销 key
  router.put("/projects/:projectKey/envs/:env/api-keys/:id/revoke", async (req, res) => {
    const ctx = await resolveEnv(req, res);
    if (!ctx) return;
    try {
      const ok = await revokeApiKey(Number(req.params.id), ctx.envId);
      if (!ok) return res.status(404).json({ ok: false, error: "Key 不存在" });
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  // DELETE /:id  删除 key
  router.delete("/projects/:projectKey/envs/:env/api-keys/:id", async (req, res) => {
    const ctx = await resolveEnv(req, res);
    if (!ctx) return;
    try {
      const ok = await deleteApiKey(Number(req.params.id), ctx.envId);
      if (!ok) return res.status(404).json({ ok: false, error: "Key 不存在" });
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  return router;
}

module.exports = { createPlatformApiKeyRoutes };
