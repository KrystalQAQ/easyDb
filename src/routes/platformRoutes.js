const express = require("express");
const { authenticate } = require("../auth");
const { writeAuditLog } = require("../auditLogger");
const { invalidateProjectEnv } = require("../projectRegistry");
const {
  listProjects,
  createProject,
  deleteProject,
  listProjectEnvs,
  getProjectEnvContext,
  upsertProjectEnv,
  listProjectEnvVars,
  upsertProjectEnvVar,
} = require("../projectStore");
const { requireAdmin, parseAdminPayload } = require("../http/adminCommon");
const { normalizePolicyInput } = require("../utils/gatewayPolicy");
const { provisionDefaultEnvForProject } = require("../services/projectProvisionService");
const {
  getProjectEnvNginxConfig,
  upsertProjectEnvNginxConfig,
  ensureProjectEnvNginxConfig,
  reloadNginxConfig,
} = require("../services/nginxConfigService");
const {
  normalizeProjectKey,
  normalizeEnvKey,
  normalizeStatus,
  normalizeVarKey,
  isValidProjectKey,
  isValidEnvKey,
  isValidVarKey,
} = require("../utils/validators");

function createPlatformRoutes() {
  const router = express.Router();
  // 平台控制面接口统一要求 admin 权限。
  router.use(authenticate, requireAdmin);

  router.get("/projects", async (_req, res) => {
    try {
      const items = await listProjects();
      return res.json({ ok: true, items });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  router.post("/projects", async (req, res) => {
    const payload = parseAdminPayload(req, res);
    if (!payload) return;

    const projectKey = normalizeProjectKey(payload.projectKey);
    const name = String(payload.name || projectKey);
    const status = normalizeStatus(payload.status || "active");
    if (!isValidProjectKey(projectKey)) {
      return res.status(400).json({ ok: false, error: "invalid projectKey format" });
    }
    if (!["active", "disabled"].includes(status)) {
      return res.status(400).json({ ok: false, error: "status must be active or disabled" });
    }

    try {
      const item = await createProject({ projectKey, name, status });
      try {
        const defaultEnv = await provisionDefaultEnvForProject(projectKey);
        if (defaultEnv?.context) {
          invalidateProjectEnv(defaultEnv.context.projectKey, defaultEnv.context.env);
        }
        await writeAuditLog({
          endpoint: "/api/platform/projects",
          action: "create_project",
          status: "ok",
          actor: req.user.username,
          role: req.user.role,
          targetProject: projectKey,
          ip: req.ip,
        });
        return res.json({
          ok: true,
          item,
          defaultEnv:
            defaultEnv && defaultEnv.context
              ? {
                  created: defaultEnv.created,
                  databaseCreated: defaultEnv.databaseCreated,
                  initializedTables: defaultEnv.initializedTables || [],
                  env: defaultEnv.context.env,
                  db: {
                    host: defaultEnv.context.db.host,
                    port: defaultEnv.context.db.port,
                    user: defaultEnv.context.db.user,
                    database: defaultEnv.context.db.database,
                  },
                  nginxConfPath: defaultEnv.nginxConf?.path || null,
                }
              : null,
        });
      } catch (provisionErr) {
        await deleteProject(projectKey).catch(() => undefined);
        return res.status(400).json({ ok: false, error: `project provision failed: ${provisionErr.message}` });
      }
    } catch (err) {
      if (String(err.message).includes("Duplicate")) {
        return res.status(409).json({ ok: false, error: "project already exists" });
      }
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  router.get("/projects/:projectKey/envs", async (req, res) => {
    const projectKey = normalizeProjectKey(req.params.projectKey);
    if (!isValidProjectKey(projectKey)) {
      return res.status(400).json({ ok: false, error: "invalid projectKey format" });
    }
    try {
      const items = await listProjectEnvs(projectKey);
      return res.json({ ok: true, items });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  router.get("/projects/:projectKey/envs/:env", async (req, res) => {
    const projectKey = normalizeProjectKey(req.params.projectKey);
    const env = normalizeEnvKey(req.params.env);
    if (!isValidProjectKey(projectKey) || !isValidEnvKey(env)) {
      return res.status(400).json({ ok: false, error: "invalid project/env format" });
    }

    try {
      const item = await getProjectEnvContext(projectKey, env);
      if (!item) {
        return res.status(404).json({ ok: false, error: "project env not found" });
      }
      return res.json({
        ok: true,
        item: {
          projectKey: item.projectKey,
          env: item.env,
          status: item.status,
          db: {
            host: item.db.host,
            port: item.db.port,
            user: item.db.user,
            database: item.db.database,
          },
          policy: item.policy || {},
          requestEncryptionPasswordEnabled: Boolean(item.requestEncryptionPassword),
        },
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  router.delete("/projects/:projectKey", async (req, res) => {
    const projectKey = normalizeProjectKey(req.params.projectKey);
    if (!isValidProjectKey(projectKey)) {
      return res.status(400).json({ ok: false, error: "invalid projectKey format" });
    }

    try {
      const envs = await listProjectEnvs(projectKey);
      const deleted = await deleteProject(projectKey);
      if (!deleted) {
        return res.status(404).json({ ok: false, error: "project not found" });
      }

      for (const envItem of envs) {
        invalidateProjectEnv(projectKey, envItem.env);
      }

      await writeAuditLog({
        endpoint: "/api/platform/projects/:projectKey",
        action: "delete_project",
        status: "ok",
        actor: req.user.username,
        role: req.user.role,
        targetProject: projectKey,
        deletedEnvCount: envs.length,
        ip: req.ip,
      });

      return res.json({
        ok: true,
        projectKey,
        deletedEnvCount: envs.length,
        note: "only platform metadata deleted, databases are not dropped automatically",
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  router.put("/projects/:projectKey/envs/:env", async (req, res) => {
    const projectKey = normalizeProjectKey(req.params.projectKey);
    const env = normalizeEnvKey(req.params.env);
    if (!isValidProjectKey(projectKey)) {
      return res.status(400).json({ ok: false, error: "invalid projectKey format" });
    }
    if (!isValidEnvKey(env)) {
      return res.status(400).json({ ok: false, error: "invalid env format" });
    }

    const payload = parseAdminPayload(req, res);
    if (!payload) return;
    const status = payload.status === undefined ? undefined : normalizeStatus(payload.status);
    if (status !== undefined && !["active", "disabled"].includes(status)) {
      return res.status(400).json({ ok: false, error: "status must be active or disabled" });
    }

    // 对策略输入做归一化，避免空值和大小写导致的行为不一致。
    const policy = normalizePolicyInput(payload.policy || {});
    const db = payload.db || {};
    try {
      const item = await upsertProjectEnv(projectKey, env, {
        status,
        db: {
          host: db.host,
          port: db.port,
          user: db.user,
          password: db.password,
          database: db.database,
        },
        policy,
        requestEncryptionPassword: payload.requestEncryptionPassword,
      });
      // 配置变更后主动失效缓存，后续请求会拿到最新环境配置。
      invalidateProjectEnv(projectKey, env);
      await ensureProjectEnvNginxConfig(projectKey, env).catch(() => null);

      await writeAuditLog({
        endpoint: "/api/platform/projects/:projectKey/envs/:env",
        action: "upsert_project_env",
        status: "ok",
        actor: req.user.username,
        role: req.user.role,
        targetProject: projectKey,
        targetEnv: env,
        ip: req.ip,
      });
      return res.json({ ok: true, item });
    } catch (err) {
      return res.status(400).json({ ok: false, error: err.message });
    }
  });

  router.get("/projects/:projectKey/envs/:env/nginx", async (req, res) => {
    const projectKey = normalizeProjectKey(req.params.projectKey);
    const env = normalizeEnvKey(req.params.env);
    if (!isValidProjectKey(projectKey) || !isValidEnvKey(env)) {
      return res.status(400).json({ ok: false, error: "invalid project/env format" });
    }

    try {
      const item = await getProjectEnvNginxConfig(projectKey, env);
      return res.json({ ok: true, item });
    } catch (err) {
      return res.status(400).json({ ok: false, error: err.message });
    }
  });

  router.put("/projects/:projectKey/envs/:env/nginx", async (req, res) => {
    const projectKey = normalizeProjectKey(req.params.projectKey);
    const env = normalizeEnvKey(req.params.env);
    if (!isValidProjectKey(projectKey) || !isValidEnvKey(env)) {
      return res.status(400).json({ ok: false, error: "invalid project/env format" });
    }

    const payload = parseAdminPayload(req, res);
    if (!payload) return;

    try {
      const item = await upsertProjectEnvNginxConfig(projectKey, env, {
        confText: payload.confText,
        serverName: payload.serverName,
        listenPort: payload.listenPort,
        frontendRoot: payload.frontendRoot,
        upstreamOrigin: payload.upstreamOrigin,
      });

      await writeAuditLog({
        endpoint: "/api/platform/projects/:projectKey/envs/:env/nginx",
        action: "upsert_project_env_nginx_conf",
        status: "ok",
        actor: req.user.username,
        role: req.user.role,
        targetProject: projectKey,
        targetEnv: env,
        ip: req.ip,
      });
      return res.json({ ok: true, item });
    } catch (err) {
      return res.status(400).json({ ok: false, error: err.message });
    }
  });

  router.post("/projects/:projectKey/envs/:env/nginx/reload", async (req, res) => {
    const projectKey = normalizeProjectKey(req.params.projectKey);
    const env = normalizeEnvKey(req.params.env);
    if (!isValidProjectKey(projectKey) || !isValidEnvKey(env)) {
      return res.status(400).json({ ok: false, error: "invalid project/env format" });
    }

    try {
      const result = await reloadNginxConfig();
      await writeAuditLog({
        endpoint: "/api/platform/projects/:projectKey/envs/:env/nginx/reload",
        action: "reload_nginx",
        status: "ok",
        actor: req.user.username,
        role: req.user.role,
        targetProject: projectKey,
        targetEnv: env,
        ip: req.ip,
      });
      return res.json({ ok: true, result });
    } catch (err) {
      await writeAuditLog({
        endpoint: "/api/platform/projects/:projectKey/envs/:env/nginx/reload",
        action: "reload_nginx",
        status: "error",
        actor: req.user.username,
        role: req.user.role,
        targetProject: projectKey,
        targetEnv: env,
        error: err.message,
        ip: req.ip,
      });
      return res.status(400).json({ ok: false, error: err.message });
    }
  });

  router.get("/projects/:projectKey/envs/:env/vars", async (req, res) => {
    const projectKey = normalizeProjectKey(req.params.projectKey);
    const env = normalizeEnvKey(req.params.env);
    if (!isValidProjectKey(projectKey) || !isValidEnvKey(env)) {
      return res.status(400).json({ ok: false, error: "invalid project/env format" });
    }

    const includeSecret = String(req.query.includeSecret || "").toLowerCase() === "true";
    try {
      const items = await listProjectEnvVars(projectKey, env, { includeSecret });
      return res.json({ ok: true, items });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  router.put("/projects/:projectKey/envs/:env/vars/:varKey", async (req, res) => {
    const projectKey = normalizeProjectKey(req.params.projectKey);
    const env = normalizeEnvKey(req.params.env);
    const varKey = normalizeVarKey(req.params.varKey);
    if (!isValidProjectKey(projectKey) || !isValidEnvKey(env)) {
      return res.status(400).json({ ok: false, error: "invalid project/env format" });
    }
    if (!isValidVarKey(varKey)) {
      return res.status(400).json({ ok: false, error: "invalid varKey format" });
    }

    const payload = parseAdminPayload(req, res);
    if (!payload) return;
    if (!Object.prototype.hasOwnProperty.call(payload, "value")) {
      return res.status(400).json({ ok: false, error: "value is required" });
    }

    try {
      const item = await upsertProjectEnvVar(projectKey, env, varKey, {
        value: payload.value,
        isSecret: payload.isSecret,
        actor: req.user.username,
      });
      await writeAuditLog({
        endpoint: "/api/platform/projects/:projectKey/envs/:env/vars/:varKey",
        action: "upsert_project_env_var",
        status: "ok",
        actor: req.user.username,
        role: req.user.role,
        targetProject: projectKey,
        targetEnv: env,
        targetVar: varKey,
        ip: req.ip,
      });
      return res.json({ ok: true, item });
    } catch (err) {
      return res.status(400).json({ ok: false, error: err.message });
    }
  });

  return router;
}

module.exports = {
  createPlatformRoutes,
};
