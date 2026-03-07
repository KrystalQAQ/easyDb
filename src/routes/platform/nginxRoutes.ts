import { Router } from "express";
import type { Response } from "express";
import type { PlatformRequest } from "./types";
import { getProjectEnvParams, toErrorMessage } from "./helpers";
import { readActor } from "./types";

const { writeAuditLog } = require("../../auditLogger");
const { parseAdminPayload } = require("../../http/adminCommon");
const {
  getProjectEnvNginxConfig,
  upsertProjectEnvNginxConfig,
  reloadNginxConfig,
} = require("../../services/nginxConfigService");

export function createPlatformNginxRoutes(): Router {
  const router = Router();

  router.get("/projects/:projectKey/envs/:env/nginx", async (req: PlatformRequest, res: Response) => {
    const params = getProjectEnvParams(req, res);
    if (!params) return;

    try {
      const item = await getProjectEnvNginxConfig(params.projectKey, params.env);
      return res.json({ ok: true, item });
    } catch (err: unknown) {
      return res.status(400).json({ ok: false, error: toErrorMessage(err) });
    }
  });

  router.put("/projects/:projectKey/envs/:env/nginx", async (req: PlatformRequest, res: Response) => {
    const params = getProjectEnvParams(req, res);
    if (!params) return;

    const payload = parseAdminPayload(req, res);
    if (!payload) return;
    const body = payload as Record<string, unknown>;

    try {
      const item = await upsertProjectEnvNginxConfig(params.projectKey, params.env, {
        confText: body.confText,
        serverName: body.serverName,
        listenPort: body.listenPort,
        frontendRoot: body.frontendRoot,
        upstreamOrigin: body.upstreamOrigin,
      });

      const actor = readActor(req);
      await writeAuditLog({
        endpoint: "/api/platform/projects/:projectKey/envs/:env/nginx",
        action: "upsert_project_env_nginx_conf",
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

  router.post(
    "/projects/:projectKey/envs/:env/nginx/reload",
    async (req: PlatformRequest, res: Response) => {
      const params = getProjectEnvParams(req, res);
      if (!params) return;

      const actor = readActor(req);
      try {
        const result = await reloadNginxConfig();
        await writeAuditLog({
          endpoint: "/api/platform/projects/:projectKey/envs/:env/nginx/reload",
          action: "reload_nginx",
          status: "ok",
          actor: actor.username,
          role: actor.role,
          targetProject: params.projectKey,
          targetEnv: params.env,
          ip: req.ip,
        });
        return res.json({ ok: true, result });
      } catch (err: unknown) {
        await writeAuditLog({
          endpoint: "/api/platform/projects/:projectKey/envs/:env/nginx/reload",
          action: "reload_nginx",
          status: "error",
          actor: actor.username,
          role: actor.role,
          targetProject: params.projectKey,
          targetEnv: params.env,
          error: toErrorMessage(err),
          ip: req.ip,
        });
        return res.status(400).json({ ok: false, error: toErrorMessage(err) });
      }
    }
  );

  return router;
}

