import { Router, type NextFunction, type Response } from "express";
const { authenticateAdminOrApiKey } = require("../../http/authenticateAdminOrApiKey");
const { requireAdmin, parseAdminPayload } = require("../../http/adminCommon");
const { writeAuditLog } = require("../../auditLogger");
const { invalidateProjectEnv } = require("../../projectRegistry");
const {
  listProjects,
  createProject,
  deleteProject,
  listProjectEnvs,
  getProjectEnvContext,
  upsertProjectEnv,
} = require("../../projectStore");
const { normalizePolicyInput } = require("../../utils/gatewayPolicy");
const { provisionDefaultEnvForProject } = require("../../services/projectProvisionService");
const { ensureProjectEnvNginxConfig } = require("../../services/nginxConfigService");
const {
  normalizeProjectKey,
  normalizeEnvKey,
  normalizeStatus,
  isValidProjectKey,
  isValidEnvKey,
} = require("../../utils/validators");
import type { PlatformRequest } from "../platform/types";

function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err || "unknown error");
}

/**
 * v2 项目与环境管理路由。
 * 当前与 v1 platform 能力对齐，并同时返回 v2(data) 与 v1 兼容字段，便于平滑切流。
 */
export function createProjectV2Routes() {
  const router = Router();

  // v2 项目接口当前仅开放给管理员，API Key 不可操作项目元数据。
  router.use(authenticateAdminOrApiKey);
  router.use((req: PlatformRequest, res: Response, next: NextFunction) => {
    if (req.apiKeyContext) {
      return res.status(403).json({ ok: false, error: "API Key 无权访问此接口" });
    }
    return requireAdmin(req, res, next);
  });

  router.get("/", async (_req: PlatformRequest, res: Response) => {
    try {
      const items = await listProjects();
      return res.json({ ok: true, items, data: { items } });
    } catch (err: unknown) {
      return res.status(500).json({ ok: false, error: toErrorMessage(err) });
    }
  });

  router.post("/", async (req: PlatformRequest, res: Response) => {
    const payload = parseAdminPayload(req, res);
    if (!payload) return;
    const body = payload as Record<string, unknown>;

    const projectKey = normalizeProjectKey(body.projectKey);
    const name = String(body.name || projectKey);
    const status = normalizeStatus(body.status || "active");
    if (!isValidProjectKey(projectKey)) {
      return res.status(400).json({ ok: false, error: "项目标识格式不正确" });
    }
    if (!["active", "disabled"].includes(status)) {
      return res.status(400).json({ ok: false, error: "状态只能是 active 或 disabled" });
    }

    const dbMode = String(body.dbMode || "auto");
    if (!["auto", "manual"].includes(dbMode)) {
      return res.status(400).json({ ok: false, error: "dbMode 只能是 auto 或 manual" });
    }
    let manualDb = null;
    if (dbMode === "manual") {
      const db = (body.db || {}) as Record<string, unknown>;
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
      // 创建项目后尽量保证默认环境同步初始化，失败时回滚项目记录。
      let defaultEnv = null;
      try {
        defaultEnv = await provisionDefaultEnvForProject(projectKey, manualDb ? { manualDb } : {});
        if (defaultEnv?.context) {
          invalidateProjectEnv(defaultEnv.context.projectKey, defaultEnv.context.env);
        }
      } catch (provisionErr: unknown) {
        await deleteProject(projectKey).catch(() => undefined);
        return res
          .status(400)
          .json({ ok: false, error: `项目初始化失败：${toErrorMessage(provisionErr)}` });
      }

      await writeAuditLog({
        endpoint: "/api/v2/projects",
        action: "create_project_v2",
        status: "ok",
        actor: req.user?.username || "unknown",
        role: req.user?.role || "unknown",
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
        data: {
          project: item,
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
        },
      });
    } catch (err: unknown) {
      if (toErrorMessage(err).includes("Duplicate")) {
        return res.status(409).json({ ok: false, error: "项目已存在" });
      }
      return res.status(500).json({ ok: false, error: toErrorMessage(err) });
    }
  });

  router.delete("/:projectKey", async (req: PlatformRequest, res: Response) => {
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
        endpoint: "/api/v2/projects/:projectKey",
        action: "delete_project_v2",
        status: "ok",
        actor: req.user?.username || "unknown",
        role: req.user?.role || "unknown",
        targetProject: projectKey,
        deletedEnvCount: envs.length,
        ip: req.ip,
      });

      return res.json({
        ok: true,
        projectKey,
        deletedEnvCount: envs.length,
        data: {
          projectKey,
          deletedEnvCount: envs.length,
        },
      });
    } catch (err: unknown) {
      return res.status(500).json({ ok: false, error: toErrorMessage(err) });
    }
  });

  router.get("/:projectKey/envs", async (req: PlatformRequest, res: Response) => {
    const projectKey = normalizeProjectKey(req.params.projectKey);
    if (!isValidProjectKey(projectKey)) {
      return res.status(400).json({ ok: false, error: "项目标识格式不正确" });
    }
    try {
      const items = await listProjectEnvs(projectKey);
      return res.json({ ok: true, items, data: { items } });
    } catch (err: unknown) {
      return res.status(500).json({ ok: false, error: toErrorMessage(err) });
    }
  });

  router.get("/:projectKey/envs/:env", async (req: PlatformRequest, res: Response) => {
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
      const view = {
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
        publicAccess: Boolean(item.policy?.publicAccess),
        requestEncryptionPasswordEnabled: Boolean(item.requestEncryptionPassword),
      };
      return res.json({
        ok: true,
        item: view,
        data: {
          item: view,
        },
      });
    } catch (err: unknown) {
      return res.status(500).json({ ok: false, error: toErrorMessage(err) });
    }
  });

  router.put("/:projectKey/envs/:env", async (req: PlatformRequest, res: Response) => {
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
    const body = payload as Record<string, unknown>;
    const status = body.status === undefined ? undefined : normalizeStatus(body.status);
    if (status !== undefined && !["active", "disabled"].includes(status)) {
      return res.status(400).json({ ok: false, error: "状态只能是 active 或 disabled" });
    }

    const policy = normalizePolicyInput(body.policy || {});
    const db = (body.db || {}) as Record<string, unknown>;
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
        requestEncryptionPassword: body.requestEncryptionPassword,
      });
      // 环境配置变更后主动失效缓存，避免命中旧配置。
      invalidateProjectEnv(projectKey, env);
      await ensureProjectEnvNginxConfig(projectKey, env).catch(() => null);

      await writeAuditLog({
        endpoint: "/api/v2/projects/:projectKey/envs/:env",
        action: "upsert_project_env_v2",
        status: "ok",
        actor: req.user?.username || "unknown",
        role: req.user?.role || "unknown",
        targetProject: projectKey,
        targetEnv: env,
        ip: req.ip,
      });
      return res.json({ ok: true, item, data: { item } });
    } catch (err: unknown) {
      return res.status(400).json({ ok: false, error: toErrorMessage(err) });
    }
  });

  return router;
}
