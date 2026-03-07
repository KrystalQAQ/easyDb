import { Router } from "express";
import multer = require("multer");
import AdmZip = require("adm-zip");
import path = require("path");
import fs = require("fs");
import type { Response } from "express";
import type { PlatformRequest } from "./types";
import { getProjectEnvParams, toErrorMessage } from "./helpers";
import { readActor } from "./types";

const { writeAuditLog } = require("../../auditLogger");
const { resolveProjectFrontendDir } = require("../../services/nginxConfigService");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/zip" || file.originalname.endsWith(".zip")) {
      cb(null, true);
    } else {
      cb(new Error("只支持 .zip 格式"));
    }
  },
});

/**
 * 前端 zip 部署：
 * 1. 清空目标目录
 * 2. 自动剥离单顶层目录（dist/）
 * 3. 阻断路径穿越
 */
export function createPlatformDeployRoutes(): Router {
  const router = Router();

  router.post(
    "/projects/:projectKey/envs/:env/deploy",
    upload.single("file"),
    async (req: PlatformRequest, res: Response) => {
      const params = getProjectEnvParams(req, res);
      if (!params) return;
      if (!req.file) {
        return res.status(400).json({ ok: false, error: "请上传 .zip 文件" });
      }

      try {
        const targetDir = resolveProjectFrontendDir(params.projectKey, params.env);
        if (!targetDir) {
          return res.status(400).json({
            ok: false,
            error: "未配置前端目录模板，请检查 NGINX_PROJECT_FRONTEND_DIR_TEMPLATE",
          });
        }

        fs.rmSync(targetDir, { recursive: true, force: true });
        fs.mkdirSync(targetDir, { recursive: true });

        const zip = new AdmZip(req.file.buffer);
        const entries = zip.getEntries();
        const topDirs = new Set(entries.map((entry) => entry.entryName.split("/")[0]).filter(Boolean));
        const firstTopDir = String([...topDirs][0] || "");
        const singleTopDir =
          topDirs.size === 1 &&
          entries.some((entry) => entry.entryName.startsWith(firstTopDir + "/") && !entry.isDirectory)
            ? firstTopDir
            : null;

        for (const entry of entries) {
          if (entry.isDirectory) continue;
          let relPath = entry.entryName;
          if (singleTopDir && relPath.startsWith(singleTopDir + "/")) {
            relPath = relPath.slice(singleTopDir.length + 1);
          }
          if (!relPath) continue;

          const outPath = path.join(targetDir, relPath);
          if (!outPath.startsWith(path.resolve(targetDir))) continue;
          fs.mkdirSync(path.dirname(outPath), { recursive: true });
          fs.writeFileSync(outPath, entry.getData());
        }

        const actor = readActor(req);
        await writeAuditLog({
          endpoint: "/api/platform/projects/:projectKey/envs/:env/deploy",
          action: "deploy_frontend",
          status: "ok",
          actor: actor.username,
          role: actor.role,
          targetProject: params.projectKey,
          targetEnv: params.env,
          ip: req.ip,
        });

        return res.json({ ok: true, targetDir });
      } catch (err: unknown) {
        return res.status(500).json({ ok: false, error: toErrorMessage(err) });
      }
    }
  );

  return router;
}

