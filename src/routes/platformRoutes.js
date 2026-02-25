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
const { provisionDefaultEnvForProject, testDbConnection } = require("../services/projectProvisionService");
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

  // 测试数据库连接，不持久化任何数据
  router.post("/test-db-connection", async (req, res) => {
    const payload = parseAdminPayload(req, res);
    if (!payload) return;
    const { host, port, user, password, database } = payload;
    if (!host || !user) {
      return res.status(400).json({ ok: false, error: "host 和 user 不能为空" });
    }
    try {
      const result = await testDbConnection({ host, port, user, password, database });
      return res.json(result);
    } catch (err) {
      return res.json({ ok: false, error: err.message });
    }
  });

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
      return res.status(400).json({ ok: false, error: "项目标识格式不正确" });
    }
    if (!["active", "disabled"].includes(status)) {
      return res.status(400).json({ ok: false, error: "状态只能是 active 或 disabled" });
    }

    const dbMode = String(payload.dbMode || "auto");
    if (!["auto", "manual"].includes(dbMode)) {
      return res.status(400).json({ ok: false, error: "dbMode 只能是 auto 或 manual" });
    }
    let manualDb = null;
    if (dbMode === "manual") {
      const db = payload.db || {};
      if (!db.host || !db.user || !db.database) {
        return res.status(400).json({ ok: false, error: "手动模式需要填写 db.host、db.user、db.database" });
      }
      manualDb = {
        host: String(db.host).trim(),
        port: Number(db.port || 3306),
        user: String(db.user).trim(),
        password: String(db.password || ""),
        database: String(db.database).trim(),
      };
    }

    try {
      const item = await createProject({ projectKey, name, status });
      try {
        const defaultEnv = await provisionDefaultEnvForProject(projectKey, manualDb ? { manualDb } : {});
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
                  env: defaultEnv.context.env,
                  db: {
                    host: defaultEnv.context.db.host,
                    port: defaultEnv.context.db.port,
                    user: defaultEnv.context.db.user,
                    database: defaultEnv.context.db.database,
                  },
                  nginxConfPath: defaultEnv.nginxConf?.path || null,
                  frontendDir: defaultEnv.nginxConf?.frontendDir || null,
                }
              : null,
        });
      } catch (provisionErr) {
        await deleteProject(projectKey).catch(() => undefined);
        return res.status(400).json({ ok: false, error: `项目初始化失败：${provisionErr.message}` });
      }
    } catch (err) {
      if (String(err.message).includes("Duplicate")) {
        return res.status(409).json({ ok: false, error: "项目已存在" });
      }
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  router.get("/projects/:projectKey/envs", async (req, res) => {
    const projectKey = normalizeProjectKey(req.params.projectKey);
    if (!isValidProjectKey(projectKey)) {
      return res.status(400).json({ ok: false, error: "项目标识格式不正确" });
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
      return res.status(400).json({ ok: false, error: "项目标识或环境格式不正确" });
    }

    try {
      const item = await getProjectEnvContext(projectKey, env);
      if (!item) {
        return res.status(404).json({ ok: false, error: "项目环境不存在" });
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
      return res.status(400).json({ ok: false, error: "项目标识格式不正确" });
    }

    try {
      const envs = await listProjectEnvs(projectKey);
      const deleted = await deleteProject(projectKey);
      if (!deleted) {
        return res.status(404).json({ ok: false, error: "项目不存在" });
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
      return res.status(400).json({ ok: false, error: "项目标识格式不正确" });
    }
    if (!isValidEnvKey(env)) {
      return res.status(400).json({ ok: false, error: "环境格式不正确" });
    }

    const payload = parseAdminPayload(req, res);
    if (!payload) return;
    const status = payload.status === undefined ? undefined : normalizeStatus(payload.status);
    if (status !== undefined && !["active", "disabled"].includes(status)) {
      return res.status(400).json({ ok: false, error: "状态只能是 active 或 disabled" });
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
      return res.status(400).json({ ok: false, error: "项目标识或环境格式不正确" });
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
      return res.status(400).json({ ok: false, error: "项目标识或环境格式不正确" });
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
      return res.status(400).json({ ok: false, error: "项目标识或环境格式不正确" });
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
      return res.status(400).json({ ok: false, error: "项目标识或环境格式不正确" });
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
      return res.status(400).json({ ok: false, error: "项目标识或环境格式不正确" });
    }
    if (!isValidVarKey(varKey)) {
      return res.status(400).json({ ok: false, error: "变量名格式不正确" });
    }

    const payload = parseAdminPayload(req, res);
    if (!payload) return;
    if (!Object.prototype.hasOwnProperty.call(payload, "value")) {
      return res.status(400).json({ ok: false, error: "变量值不能为空" });
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
