const express = require("express");
const { authenticate } = require("../auth");
const { requireAdmin, parseAdminPayload } = require("../http/adminCommon");
const { writeAuditLog } = require("../auditLogger");
const { findProjectEnvRecord } = require("../projectStore");
const { getTenantDbClient } = require("../tenantDbManager");
const { getFullSchema, getTableSchema } = require("../services/schemaIntrospectService");
const { validateSqlWithPolicy } = require("../sqlPolicy");
const { renderSqlTemplate, validateApiParams } = require("../services/apiExecutionService");
const {
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
} = require("../apiStore");
const {
  normalizeProjectKey,
  normalizeEnvKey,
  normalizeApiKey,
  normalizeGroupKey,
  isValidProjectKey,
  isValidEnvKey,
  isValidApiKey,
  isValidGroupKey,
} = require("../utils/validators");

function createPlatformApiRoutes() {
  const router = express.Router();
  router.use(authenticate, requireAdmin);

  // 辅助：解析 projectEnvId
  async function resolveEnvId(req, res) {
    const projectKey = normalizeProjectKey(req.params.projectKey);
    const env = normalizeEnvKey(req.params.env);
    if (!isValidProjectKey(projectKey) || !isValidEnvKey(env)) {
      res.status(400).json({ ok: false, error: "项目标识或环境格式不正确" });
      return null;
    }
    const record = await findProjectEnvRecord(projectKey, env);
    if (!record) {
      res.status(404).json({ ok: false, error: "项目环境不存在" });
      return null;
    }
    return { projectKey, env, envId: record.env_id, record };
  }

  // =========================================================================
  // 数据库表结构自省
  // =========================================================================

  router.get("/projects/:projectKey/envs/:env/schema", async (req, res) => {
    const ctx = await resolveEnvId(req, res);
    if (!ctx) return;
    try {
      const { buildProjectEnvContextFromRecord } = require("../projectStore");
      // 直接用 record 构造一个简单连接上下文
      const { decryptSecret } = require("../configVault");
      const dbConfig = {
        projectKey: ctx.projectKey,
        env: ctx.env,
        db: {
          host: ctx.record.db_host,
          port: Number(ctx.record.db_port || 3306),
          user: ctx.record.db_user,
          password: decryptSecret(ctx.record.db_password || ""),
          database: ctx.record.db_name,
        },
      };
      const db = getTenantDbClient(dbConfig);
      const tables = await getFullSchema(db, ctx.record.db_name);
      return res.json({ ok: true, tables });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  router.get("/projects/:projectKey/envs/:env/schema/:tableName", async (req, res) => {
    const ctx = await resolveEnvId(req, res);
    if (!ctx) return;
    try {
      const { decryptSecret } = require("../configVault");
      const dbConfig = {
        projectKey: ctx.projectKey,
        env: ctx.env,
        db: {
          host: ctx.record.db_host,
          port: Number(ctx.record.db_port || 3306),
          user: ctx.record.db_user,
          password: decryptSecret(ctx.record.db_password || ""),
          database: ctx.record.db_name,
        },
      };
      const db = getTenantDbClient(dbConfig);
      const table = await getTableSchema(db, ctx.record.db_name, req.params.tableName);
      if (!table) {
        return res.status(404).json({ ok: false, error: "表不存在" });
      }
      return res.json({ ok: true, table });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  // =========================================================================
  // 接口分组 CRUD
  // =========================================================================

  router.get("/projects/:projectKey/envs/:env/api-groups", async (req, res) => {
    const ctx = await resolveEnvId(req, res);
    if (!ctx) return;
    try {
      const items = await listApiGroups(ctx.envId);
      return res.json({
        ok: true,
        items: items.map((r) => ({
          groupKey: r.group_key,
          name: r.name,
          basePath: r.base_path,
          description: r.description,
          sortOrder: r.sort_order,
          status: r.status,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        })),
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  router.post("/projects/:projectKey/envs/:env/api-groups", async (req, res) => {
    const ctx = await resolveEnvId(req, res);
    if (!ctx) return;
    const payload = parseAdminPayload(req, res);
    if (!payload) return;
    const groupKey = normalizeGroupKey(payload.groupKey);
    if (!isValidGroupKey(groupKey)) {
      return res.status(400).json({ ok: false, error: "分组标识格式不正确（小写字母开头，2-64位，允许小写字母数字下划线连字符）" });
    }
    if (!payload.name) {
      return res.status(400).json({ ok: false, error: "分组名称不能为空" });
    }
    try {
      const item = await createApiGroup(ctx.envId, {
        groupKey,
        name: payload.name,
        basePath: payload.basePath,
        description: payload.description,
        sortOrder: payload.sortOrder,
        status: payload.status,
      });
      await writeAuditLog({
        endpoint: "/api/platform/.../api-groups",
        action: "create_api_group",
        status: "ok",
        actor: req.user.username,
        role: req.user.role,
        targetProject: ctx.projectKey,
        targetEnv: ctx.env,
        targetGroupKey: groupKey,
        ip: req.ip,
      });
      return res.json({ ok: true, item });
    } catch (err) {
      if (String(err.message).includes("Duplicate")) {
        return res.status(409).json({ ok: false, error: "分组已存在" });
      }
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  router.put("/projects/:projectKey/envs/:env/api-groups/:groupKey", async (req, res) => {
    const ctx = await resolveEnvId(req, res);
    if (!ctx) return;
    const groupKey = normalizeGroupKey(req.params.groupKey);
    if (!isValidGroupKey(groupKey)) {
      return res.status(400).json({ ok: false, error: "分组标识格式不正确" });
    }
    const payload = parseAdminPayload(req, res);
    if (!payload) return;
    try {
      const item = await updateApiGroup(ctx.envId, groupKey, {
        name: payload.name,
        basePath: payload.basePath,
        description: payload.description,
        sortOrder: payload.sortOrder,
        status: payload.status,
      });
      if (!item) {
        return res.status(404).json({ ok: false, error: "分组不存在" });
      }
      return res.json({ ok: true, item });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  router.delete("/projects/:projectKey/envs/:env/api-groups/:groupKey", async (req, res) => {
    const ctx = await resolveEnvId(req, res);
    if (!ctx) return;
    const groupKey = normalizeGroupKey(req.params.groupKey);
    if (!isValidGroupKey(groupKey)) {
      return res.status(400).json({ ok: false, error: "分组标识格式不正确" });
    }
    try {
      const deleted = await deleteApiGroup(ctx.envId, groupKey);
      if (!deleted) {
        return res.status(404).json({ ok: false, error: "分组不存在" });
      }
      await writeAuditLog({
        endpoint: "/api/platform/.../api-groups/:groupKey",
        action: "delete_api_group",
        status: "ok",
        actor: req.user.username,
        role: req.user.role,
        targetProject: ctx.projectKey,
        targetEnv: ctx.env,
        targetGroupKey: groupKey,
        ip: req.ip,
      });
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  // =========================================================================
  // 业务接口 CRUD
  // =========================================================================

  router.get("/projects/:projectKey/envs/:env/apis", async (req, res) => {
    const ctx = await resolveEnvId(req, res);
    if (!ctx) return;
    try {
      const options = {};
      if (req.query.groupKey) {
        const group = await getApiGroup(ctx.envId, normalizeGroupKey(req.query.groupKey));
        if (group) options.groupId = group.id;
      }
      if (req.query.status) options.status = req.query.status;
      const items = await listApis(ctx.envId, options);
      return res.json({ ok: true, items });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  router.get("/projects/:projectKey/envs/:env/apis/:apiKey", async (req, res) => {
    const ctx = await resolveEnvId(req, res);
    if (!ctx) return;
    const apiKey = normalizeApiKey(req.params.apiKey);
    if (!isValidApiKey(apiKey)) {
      return res.status(400).json({ ok: false, error: "接口标识格式不正确" });
    }
    try {
      const item = await getApi(ctx.envId, apiKey);
      if (!item) {
        return res.status(404).json({ ok: false, error: "接口不存在" });
      }
      return res.json({ ok: true, item });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  router.post("/projects/:projectKey/envs/:env/apis", async (req, res) => {
    const ctx = await resolveEnvId(req, res);
    if (!ctx) return;
    const payload = parseAdminPayload(req, res);
    if (!payload) return;
    const apiKey = normalizeApiKey(payload.apiKey);
    if (!isValidApiKey(apiKey)) {
      return res.status(400).json({ ok: false, error: "接口标识格式不正确（字母开头，2-128位，允许字母数字下划线连字符）" });
    }
    if (!payload.name) {
      return res.status(400).json({ ok: false, error: "接口名称不能为空" });
    }
    if (!payload.sqlTemplate) {
      return res.status(400).json({ ok: false, error: "SQL 模板不能为空" });
    }
    const validSqlTypes = ["select", "insert", "update", "delete"];
    const sqlType = String(payload.sqlType || "").toLowerCase();
    if (!validSqlTypes.includes(sqlType)) {
      return res.status(400).json({ ok: false, error: "sqlType 必须是 select/insert/update/delete" });
    }
    const validMethods = ["GET", "POST", "PUT", "DELETE"];
    const method = String(payload.method || "POST").toUpperCase();
    if (!validMethods.includes(method)) {
      return res.status(400).json({ ok: false, error: "method 必须是 GET/POST/PUT/DELETE" });
    }

    // SQL 模板安全校验：用 node-sql-parser 验证渲染后的 SQL
    try {
      // 为校验构造假参数
      const paramsSchema = payload.paramsSchema || [];
      const fakeParams = {};
      for (const p of paramsSchema) {
        switch (p.type) {
          case "integer":
          case "number":
            fakeParams[p.name] = p.default !== undefined ? p.default : 1;
            break;
          case "boolean":
            fakeParams[p.name] = true;
            break;
          default:
            fakeParams[p.name] = p.default !== undefined ? String(p.default) : "test";
        }
      }
      // 收集模板中的所有命名参数
      const paramRe = /:([a-zA-Z_][a-zA-Z0-9_]*)/g;
      let m;
      while ((m = paramRe.exec(payload.sqlTemplate)) !== null) {
        if (!fakeParams.hasOwnProperty(m[1])) {
          fakeParams[m[1]] = "test";
        }
      }
      const { sql } = renderSqlTemplate(payload.sqlTemplate, fakeParams);
      // 用 AST 校验确保 SQL 类型匹配
      const validation = validateSqlWithPolicy(sql, { role: "admin" }, {
        allowedSqlTypes: new Set([sqlType]),
        allowedTables: new Set(),
        roleTables: new Map(),
        requireSelectLimit: false,
      });
      if (!validation.ok) {
        return res.status(400).json({ ok: false, error: `SQL 模板校验失败: ${validation.message}` });
      }
    } catch (err) {
      return res.status(400).json({ ok: false, error: `SQL 模板校验失败: ${err.message}` });
    }

    // 解析 groupKey → groupId
    let groupId = null;
    if (payload.groupKey) {
      const group = await getApiGroup(ctx.envId, normalizeGroupKey(payload.groupKey));
      if (group) groupId = group.id;
    }

    try {
      const item = await createApi(ctx.envId, {
        apiKey,
        name: payload.name,
        description: payload.description,
        groupId,
        method,
        path: payload.path,
        sqlTemplate: payload.sqlTemplate,
        sqlType,
        paramsSchema: payload.paramsSchema,
        resultMapping: payload.resultMapping,
        cacheTTL: payload.cacheTTL,
        authMode: payload.authMode,
        sortOrder: payload.sortOrder,
        status: payload.status,
        actor: req.user.username,
      });
      await writeAuditLog({
        endpoint: "/api/platform/.../apis",
        action: "create_api",
        status: "ok",
        actor: req.user.username,
        role: req.user.role,
        targetProject: ctx.projectKey,
        targetEnv: ctx.env,
        targetApiKey: apiKey,
        ip: req.ip,
      });
      return res.json({ ok: true, item });
    } catch (err) {
      if (String(err.message).includes("Duplicate")) {
        return res.status(409).json({ ok: false, error: "接口已存在" });
      }
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  router.put("/projects/:projectKey/envs/:env/apis/:apiKey", async (req, res) => {
    const ctx = await resolveEnvId(req, res);
    if (!ctx) return;
    const apiKey = normalizeApiKey(req.params.apiKey);
    if (!isValidApiKey(apiKey)) {
      return res.status(400).json({ ok: false, error: "接口标识格式不正确" });
    }
    const payload = parseAdminPayload(req, res);
    if (!payload) return;

    // 如果更新了 sqlTemplate 或 sqlType，重新校验
    if (payload.sqlTemplate || payload.sqlType) {
      const existing = await getApi(ctx.envId, apiKey);
      if (!existing) {
        return res.status(404).json({ ok: false, error: "接口不存在" });
      }
      const template = payload.sqlTemplate || existing.sqlTemplate;
      const sqlType = String(payload.sqlType || existing.sqlType).toLowerCase();
      try {
        const paramsSchema = payload.paramsSchema || existing.paramsSchema || [];
        const fakeParams = {};
        for (const p of paramsSchema) {
          switch (p.type) {
            case "integer":
            case "number":
              fakeParams[p.name] = p.default !== undefined ? p.default : 1;
              break;
            case "boolean":
              fakeParams[p.name] = true;
              break;
            default:
              fakeParams[p.name] = p.default !== undefined ? String(p.default) : "test";
          }
        }
        const paramRe = /:([a-zA-Z_][a-zA-Z0-9_]*)/g;
        let m;
        while ((m = paramRe.exec(template)) !== null) {
          if (!fakeParams.hasOwnProperty(m[1])) {
            fakeParams[m[1]] = "test";
          }
        }
        const { sql } = renderSqlTemplate(template, fakeParams);
        const validation = validateSqlWithPolicy(sql, { role: "admin" }, {
          allowedSqlTypes: new Set([sqlType]),
          allowedTables: new Set(),
          roleTables: new Map(),
          requireSelectLimit: false,
        });
        if (!validation.ok) {
          return res.status(400).json({ ok: false, error: `SQL 模板校验失败: ${validation.message}` });
        }
      } catch (err) {
        return res.status(400).json({ ok: false, error: `SQL 模板校验失败: ${err.message}` });
      }
    }

    // 解析 groupKey → groupId
    let groupId;
    if (payload.groupKey !== undefined) {
      if (payload.groupKey) {
        const group = await getApiGroup(ctx.envId, normalizeGroupKey(payload.groupKey));
        groupId = group ? group.id : null;
      } else {
        groupId = null;
      }
    }

    try {
      const data = { ...payload, actor: req.user.username };
      if (groupId !== undefined) data.groupId = groupId;
      if (payload.sqlType) data.sqlType = String(payload.sqlType).toLowerCase();
      if (payload.method) data.method = String(payload.method).toUpperCase();

      const item = await updateApi(ctx.envId, apiKey, data);
      if (!item) {
        return res.status(404).json({ ok: false, error: "接口不存在" });
      }
      await writeAuditLog({
        endpoint: "/api/platform/.../apis/:apiKey",
        action: "update_api",
        status: "ok",
        actor: req.user.username,
        role: req.user.role,
        targetProject: ctx.projectKey,
        targetEnv: ctx.env,
        targetApiKey: apiKey,
        ip: req.ip,
      });
      return res.json({ ok: true, item });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  router.delete("/projects/:projectKey/envs/:env/apis/:apiKey", async (req, res) => {
    const ctx = await resolveEnvId(req, res);
    if (!ctx) return;
    const apiKey = normalizeApiKey(req.params.apiKey);
    if (!isValidApiKey(apiKey)) {
      return res.status(400).json({ ok: false, error: "接口标识格式不正确" });
    }
    try {
      const deleted = await deleteApi(ctx.envId, apiKey);
      if (!deleted) {
        return res.status(404).json({ ok: false, error: "接口不存在" });
      }
      await writeAuditLog({
        endpoint: "/api/platform/.../apis/:apiKey",
        action: "delete_api",
        status: "ok",
        actor: req.user.username,
        role: req.user.role,
        targetProject: ctx.projectKey,
        targetEnv: ctx.env,
        targetApiKey: apiKey,
        ip: req.ip,
      });
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  // =========================================================================
  // 接口调试
  // =========================================================================

  router.post("/projects/:projectKey/envs/:env/apis/:apiKey/test", async (req, res) => {
    const ctx = await resolveEnvId(req, res);
    if (!ctx) return;
    const apiKey = normalizeApiKey(req.params.apiKey);
    if (!isValidApiKey(apiKey)) {
      return res.status(400).json({ ok: false, error: "接口标识格式不正确" });
    }

    const apiDef = await getApi(ctx.envId, apiKey);
    if (!apiDef) {
      return res.status(404).json({ ok: false, error: "接口不存在" });
    }

    const rawParams = req.body?.params || {};
    const validation = validateApiParams(rawParams, apiDef.paramsSchema);
    if (!validation.ok) {
      return res.status(400).json({ ok: false, error: validation.errors.join("; ") });
    }

    try {
      const { sql, values } = renderSqlTemplate(apiDef.sqlTemplate, validation.params);
      const { decryptSecret } = require("../configVault");
      const dbConfig = {
        projectKey: ctx.projectKey,
        env: ctx.env,
        db: {
          host: ctx.record.db_host,
          port: Number(ctx.record.db_port || 3306),
          user: ctx.record.db_user,
          password: decryptSecret(ctx.record.db_password || ""),
          database: ctx.record.db_name,
        },
      };
      const db = getTenantDbClient(dbConfig);
      const [result] = await db.raw(sql, values);

      return res.json({
        ok: true,
        debug: {
          renderedSql: sql,
          renderedValues: values,
        },
        type: apiDef.sqlType,
        rowCount: apiDef.sqlType === "select" && Array.isArray(result) ? result.length : undefined,
        affectedRows: apiDef.sqlType !== "select" ? result?.affectedRows || 0 : undefined,
        data: result,
      });
    } catch (err) {
      return res.status(400).json({ ok: false, error: err.message });
    }
  });

  return router;
}

module.exports = {
  createPlatformApiRoutes,
};
