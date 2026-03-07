import type { Response } from "express";
import type { PlatformRequest } from "./types";

const {
  normalizeProjectKey,
  normalizeEnvKey,
  normalizeVarKey,
  isValidProjectKey,
  isValidEnvKey,
  isValidVarKey,
} = require("../../utils/validators");

export function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err || "unknown error");
}

export function getProjectKeyParam(req: PlatformRequest, res: Response): string | null {
  const projectKey = normalizeProjectKey(req.params.projectKey);
  if (!isValidProjectKey(projectKey)) {
    res.status(400).json({ ok: false, error: "项目标识格式不正确" });
    return null;
  }
  return projectKey;
}

export function getProjectEnvParams(
  req: PlatformRequest,
  res: Response
): { projectKey: string; env: string } | null {
  const projectKey = normalizeProjectKey(req.params.projectKey);
  const env = normalizeEnvKey(req.params.env);
  if (!isValidProjectKey(projectKey) || !isValidEnvKey(env)) {
    res.status(400).json({ ok: false, error: "项目标识或环境格式不正确" });
    return null;
  }
  return { projectKey, env };
}

export function getVarParams(
  req: PlatformRequest,
  res: Response
): { projectKey: string; env: string; varKey: string } | null {
  const context = getProjectEnvParams(req, res);
  if (!context) return null;
  const varKey = normalizeVarKey(req.params.varKey);
  if (!isValidVarKey(varKey)) {
    res.status(400).json({ ok: false, error: "变量名格式不正确" });
    return null;
  }
  return {
    ...context,
    varKey,
  };
}

