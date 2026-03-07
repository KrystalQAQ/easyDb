import type { Request } from "express";

export interface AuthenticatedUser {
  username: string;
  role: string;
}

export interface ApiKeyContext {
  projectKey: string;
  envKey: string;
  keyName: string;
}

export interface DeployFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}

export type PlatformRequest = Request & {
  user?: AuthenticatedUser;
  apiKeyContext?: ApiKeyContext;
  file?: DeployFile;
  requestPayloadOptions?: Record<string, unknown>;
};

/**
 * 审计日志统一取值，避免路由层到处判空。
 */
export function readActor(req: PlatformRequest): AuthenticatedUser {
  return {
    username: req.user?.username || "unknown",
    role: req.user?.role || "unknown",
  };
}

