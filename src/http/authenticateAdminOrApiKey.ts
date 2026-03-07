/**
 * 组合认证中间件：JWT admin token 或 API Key 均可通过
 * 用于 platform API 路由，让 MCP 工具可以用 API Key 访问
 */
import type { NextFunction, Response } from "express";
import type { PlatformRequest } from "../routes/platform/types";

const { authenticate } = require("../auth");
const { authenticateApiKey } = require("./apiKeyAuth");

async function authenticateAdminOrApiKey(
  req: PlatformRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = typeof req.headers.authorization === "string" ? req.headers.authorization : "";
  const xApiKey = typeof req.headers["x-api-key"] === "string" ? req.headers["x-api-key"] : "";

  // API Key 优先（以 edb_ 开头）
  if (xApiKey.startsWith("edb_") || authHeader.startsWith("Bearer edb_")) {
    return authenticateApiKey(req, res, next);
  }

  // 否则走 JWT 认证
  return authenticate(req, res, next);
}

module.exports = { authenticateAdminOrApiKey };
