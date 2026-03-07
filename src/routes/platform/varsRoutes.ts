import { Router } from "express";
import type { Response } from "express";
import type { PlatformRequest } from "./types";
import { getProjectEnvParams, getVarParams, toErrorMessage } from "./helpers";
import { readActor } from "./types";

const { writeAuditLog } = require("../../auditLogger");
const { parseAdminPayload } = require("../../http/adminCommon");
const { listProjectEnvVars, upsertProjectEnvVar } = require("../../projectStore");

export function createPlatformVarsRoutes(): Router {
  const router = Router();

  router.get("/projects/:projectKey/envs/:env/vars", async (req: PlatformRequest, res: Response) => {
    const params = getProjectEnvParams(req, res);
    if (!params) return;

    const includeSecret = String(req.query.includeSecret || "").toLowerCase() === "true";
    try {
      const items = await listProjectEnvVars(params.projectKey, params.env, { includeSecret });
      return res.json({ ok: true, items });
    } catch (err: unknown) {
      return res.status(500).json({ ok: false, error: toErrorMessage(err) });
    }
  });

  router.put(
    "/projects/:projectKey/envs/:env/vars/:varKey",
    async (req: PlatformRequest, res: Response) => {
      const params = getVarParams(req, res);
      if (!params) return;

      const payload = parseAdminPayload(req, res);
      if (!payload) return;
      const body = payload as Record<string, unknown>;
      if (!Object.prototype.hasOwnProperty.call(body, "value")) {
        return res.status(400).json({ ok: false, error: "变量值不能为空" });
      }

      try {
        const actor = readActor(req);
        const item = await upsertProjectEnvVar(params.projectKey, params.env, params.varKey, {
          value: body.value,
          isSecret: body.isSecret,
          actor: actor.username,
        });
        await writeAuditLog({
          endpoint: "/api/platform/projects/:projectKey/envs/:env/vars/:varKey",
          action: "upsert_project_env_var",
          status: "ok",
          actor: actor.username,
          role: actor.role,
          targetProject: params.projectKey,
          targetEnv: params.env,
          targetVar: params.varKey,
          ip: req.ip,
        });
        return res.json({ ok: true, item });
      } catch (err: unknown) {
        return res.status(400).json({ ok: false, error: toErrorMessage(err) });
      }
    }
  );

  return router;
}

