const path = require("path");
const fs = require("fs").promises;
const AdmZip = require("adm-zip");

const definition = {
  name: "deploy_frontend",
  description: "上传本地已构建的前端产物到服务器。当用户说「打包」「发布」「部署」「上传前端」时使用此工具",
  inputSchema: {
    type: "object",
    properties: {
      distPath: {
        type: "string",
        description: "前端构建产物目录路径，如 dist 或 build",
      },
    },
    required: ["distPath"],
  },
};

async function handler(args) {
  const { distPath } = args;
  const projectKey = process.env.EASYDB_PROJECT;
  const env = process.env.EASYDB_ENV || "prod";
  const baseUrl = process.env.EASYDB_BASE_URL || "http://localhost";
  const token = process.env.EASYDB_API_KEY;

  if (!projectKey) throw new Error("缺少 EASYDB_PROJECT 环境变量");
  if (!token) throw new Error("缺少 EASYDB_API_KEY 环境变量");

  const results = [];

  // 打包
  results.push("📦 打包中...");
  const resolvedDistPath = path.resolve(distPath);
  const tmpDir = path.resolve(process.cwd(), "runtime/tmp");
  await fs.mkdir(tmpDir, { recursive: true });

  const zipPath = path.join(tmpDir, `${projectKey}_${env}_${Date.now()}.zip`);
  const zip = new AdmZip();
  zip.addLocalFolder(resolvedDistPath);
  zip.writeZip(zipPath);
  results.push("✅ 打包完成");

  // 上传
  results.push("🚀 上传中...");
  const fileBuffer = await fs.readFile(zipPath);
  const blob = new Blob([fileBuffer], { type: "application/zip" });
  const form = new FormData();
  form.append("file", blob, path.basename(zipPath));

  const headers = {
    Authorization: `Bearer ${token}`,
  };
  if (token.startsWith("edb_")) {
    headers["X-API-Key"] = token;
  }

  const response = await fetch(`${baseUrl}/api/v2/projects/${projectKey}/envs/${env}/deploy`, {
    method: "POST",
    headers,
    body: form,
  });

  const result = await response.json();
  await fs.unlink(zipPath).catch(() => {});

  if (!result.ok) {
    throw new Error(result.error || "上传失败");
  }

  results.push(`✅ 部署完成: ${result.targetDir}`);

  return {
    success: true,
    message: results.join("\n"),
    targetDir: result.targetDir,
  };
}

module.exports = { definition, handler };

export {};
