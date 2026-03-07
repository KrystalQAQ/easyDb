import { Router } from "express";
import type { Response } from "express";
import type { PlatformRequest } from "./types";
import { getProjectEnvParams, getProjectKeyParam, toErrorMessage } from "./helpers";
import { readActor } from "./types";

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
const { parseAdminPayload } = require("../../http/adminCommon");
const { normalizePolicyInput } = require("../../utils/gatewayPolicy");
const {
  provisionDefaultEnvForProject,
  testDbConnection,
} = require("../../services/projectProvisionService");
const { ensureProjectEnvNginxConfig } = require("../../services/nginxConfigService");
const {
  normalizeProjectKey,
  normalizeEnvKey,
  normalizeStatus,
  isValidProjectKey,
  isValidEnvKey,
} = require("../../utils/validators");

type ManualDbConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
};

function parseManualDb(payload: Record<string, unknown>, res: Response): ManualDbConfig | null {
  const dbMode = String(payload.dbMode || "auto");
  if (!["auto", "manual"].includes(dbMode)) {
    res.status(400).json({ ok: false, error: "dbMode 只能是 auto 或 manual" });
    return null;
  }
  if (dbMode !== "manual") {
    return {
      host: "",
      port: 3306,
      user: "",
      password: "",
      database: "",
    };
  }

  const db = (payload.db || {}) as Record<string, unknown>;
  if (!db.host || !db.user || !db.database) {
    res.status(400).json({ ok: false, error: "手动模式需要填写 db.host、db.user、db.database" });
    return null;
  }
  return {
    host: String(db.host).trim(),
    port: Number(db.port || 3306),
    user: String(db.user).trim(),
    password: String(db.password || ""),
    database: String(db.database).trim(),
  };
}

export function createPlatformProjectRoutes(): Router {
  const router = Router();

  // 测试数据库连接，不持久化任何数据。
  router.post("/test-db-connection", async (req: PlatformRequest, res: Response) => {
    const payload = parseAdminPayload(req, res);
    if (!payload) return;
    const { host, port, user, password, database } = payload as Record<string, unknown>;
    if (!host || !user) {
      return res.status(400).json({ ok: false, error: "host 和 user 不能为空" });
    }
    try {
      const result = await testDbConnection({ host, port, user, password, database });
      return res.json(result);
    } catch (err: unknown) {
      return res.json({ ok: false, error: toErrorMessage(err) });
    }
  });

  router.get("/projects", async (_req: PlatformRequest, res: Response) => {
    try {
      const items = await listProjects();
      return res.json({ ok: true, items });
    } catch (err: unknown) {
      return res.status(500).json({ ok: false, error: toErrorMessage(err) });
    }
  });

  router.post("/projects", async (req: PlatformRequest, res: Response) => {
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

    const manualDb = parseManualDb(body, res);
    if (!manualDb) return;

    try {
      const item = await createProject({ projectKey, name, status });
      try {
        const defaultEnv = await provisionDefaultEnvForProject(
          projectKey,
          manualDb.host ? { manualDb } : {}
        );
        if (defaultEnv?.context) {
          invalidateProjectEnv(defaultEnv.context.projectKey, defaultEnv.context.env);
        }

        const actor = readActor(req);
        await writeAuditLog({
          endpoint: "/api/platform/projects",
          action: "create_project",
          status: "ok",
          actor: actor.username,
          role: actor.role,
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
      } catch (provisionErr: unknown) {
        await deleteProject(projectKey).catch(() => undefined);
        return res.status(400).json({
          ok: false,
          error: `项目初始化失败：${toErrorMessage(provisionErr)}`,
        });
      }
    } catch (err: unknown) {
      if (String(toErrorMessage(err)).includes("Duplicate")) {
        return res.status(409).json({ ok: false, error: "项目已存在" });
      }
      return res.status(500).json({ ok: false, error: toErrorMessage(err) });
    }
  });

  router.get("/projects/:projectKey/envs", async (req: PlatformRequest, res: Response) => {
    const projectKey = getProjectKeyParam(req, res);
    if (!projectKey) return;
    try {
      const items = await listProjectEnvs(projectKey);
      return res.json({ ok: true, items });
    } catch (err: unknown) {
      return res.status(500).json({ ok: false, error: toErrorMessage(err) });
    }
  });

  router.get("/projects/:projectKey/envs/:env", async (req: PlatformRequest, res: Response) => {
    const context = getProjectEnvParams(req, res);
    if (!context) return;

    try {
      const item = await getProjectEnvContext(context.projectKey, context.env);
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
          publicAccess: Boolean(item.policy?.publicAccess),
          requestEncryptionPasswordEnabled: Boolean(item.requestEncryptionPassword),
        },
      });
    } catch (err: unknown) {
      return res.status(500).json({ ok: false, error: toErrorMessage(err) });
    }
  });

  router.delete("/projects/:projectKey", async (req: PlatformRequest, res: Response) => {
    const projectKey = getProjectKeyParam(req, res);
    if (!projectKey) return;

    try {
      const envs = await listProjectEnvs(projectKey);
      const deleted = await deleteProject(projectKey);
      if (!deleted) {
        return res.status(404).json({ ok: false, error: "项目不存在" });
      }

      for (const envItem of envs) {
        invalidateProjectEnv(projectKey, envItem.env);
      }

      const actor = readActor(req);
      await writeAuditLog({
        endpoint: "/api/platform/projects/:projectKey",
        action: "delete_project",
        status: "ok",
        actor: actor.username,
        role: actor.role,
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
    } catch (err: unknown) {
      return res.status(500).json({ ok: false, error: toErrorMessage(err) });
    }
  });

  router.put("/projects/:projectKey/envs/:env", async (req: PlatformRequest, res: Response) => {
    const params = getProjectEnvParams(req, res);
    if (!params) return;

    if (!isValidProjectKey(params.projectKey)) {
      return res.status(400).json({ ok: false, error: "项目标识格式不正确" });
    }
    if (!isValidEnvKey(params.env)) {
      return res.status(400).json({ ok: false, error: "环境格式不正确" });
    }

    const payload = parseAdminPayload(req, res);
    if (!payload) return;
    const body = payload as Record<string, unknown>;
    const status = body.status === undefined ? undefined : normalizeStatus(body.status);
    if (status !== undefined && !["active", "disabled"].includes(status)) {
      return res.status(400).json({ ok: false, error: "状态只能是 active 或 disabled" });
    }

    // 对策略输入做归一化，避免空值和大小写导致行为不一致。
    const policy = normalizePolicyInput(body.policy || {});
    const db = (body.db || {}) as Record<string, unknown>;
    try {
      const item = await upsertProjectEnv(params.projectKey, params.env, {
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
      invalidateProjectEnv(params.projectKey, params.env);
      await ensureProjectEnvNginxConfig(params.projectKey, params.env).catch(() => null);

      const actor = readActor(req);
      await writeAuditLog({
        endpoint: "/api/platform/projects/:projectKey/envs/:env",
        action: "upsert_project_env",
        status: "ok",
        actor: actor.username,
        role: actor.role,
        targetProject: params.projectKey,
        targetEnv: params.env,
        ip: req.ip,
      });
      return res.json({ ok: true, item });
    } catch (err: unknown) {
      return res.status(400).json({ ok: false, error: toErrorMessage(err) });
    }
  });

  return router;
}

