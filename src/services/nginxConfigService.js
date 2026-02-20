const fs = require("fs/promises");
const path = require("path");
const { exec } = require("child_process");
const { promisify } = require("util");
const { nginx } = require("../config");

const execAsync = promisify(exec);

function renderTemplate(template, values) {
  return String(template || "")
    .replaceAll("{projectKey}", values.projectKey)
    .replaceAll("{env}", values.env);
}

function normalizeKeySegment(value, field) {
  const text = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9_-]{1,64}$/.test(text)) {
    throw new Error(`${field} is invalid`);
  }
  return text;
}

function normalizeFileName(fileName) {
  const text = String(fileName || "").trim().toLowerCase();
  if (!/^[a-z0-9._-]{1,128}$/.test(text)) {
    throw new Error("nginx conf file name is invalid");
  }
  return text.endsWith(".conf") ? text : `${text}.conf`;
}

function normalizeListenPort(value) {
  const port = Number(value || nginx.listenPort || 80);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("listenPort must be 1-65535");
  }
  return port;
}

function normalizeUpstreamOrigin(value) {
  const raw = String(value || nginx.upstreamOrigin || "").trim();
  if (!raw) {
    throw new Error("upstreamOrigin is required");
  }
  let parsed;
  try {
    parsed = new URL(raw);
  } catch (_err) {
    throw new Error("upstreamOrigin must be a valid URL");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("upstreamOrigin protocol must be http/https");
  }
  return `${parsed.protocol}//${parsed.host}`;
}

function normalizeFrontendRoot(value) {
  const text = String(value || nginx.frontendRoot || "/usr/share/nginx/html").trim();
  if (!text.startsWith("/")) {
    throw new Error("frontendRoot must be an absolute path");
  }
  return text;
}

function resolveProjectFrontendDir(projectKey, env) {
  const rendered = renderTemplate(nginx.projectFrontendDirTemplate || "", {
    projectKey,
    env,
  });
  const target = String(rendered || "").trim();
  if (!target) {
    throw new Error("NGINX_PROJECT_FRONTEND_DIR_TEMPLATE is required");
  }
  return path.resolve(process.cwd(), target);
}

function resolveProjectFrontendWebRoot(projectKey, env) {
  const rendered = renderTemplate(nginx.projectFrontendWebRootTemplate || "", {
    projectKey,
    env,
  });
  const target = String(rendered || "").trim();
  if (!target) {
    return normalizeFrontendRoot(nginx.frontendRoot);
  }
  return normalizeFrontendRoot(target);
}

function resolveConfFileName(projectKey, env) {
  const rendered = renderTemplate(nginx.confFileNameTemplate || "{projectKey}_{env}.conf", {
    projectKey,
    env,
  });
  return normalizeFileName(rendered);
}

function resolveProjectEnvNginxPath(projectKey, env) {
  const fileName = resolveConfFileName(projectKey, env);
  return path.join(nginx.confDir, fileName);
}

function buildNginxConfigText(options) {
  const projectKey = normalizeKeySegment(options.projectKey, "projectKey");
  const env = normalizeKeySegment(options.env, "env");
  const serverName = String(options.serverName || "").trim();
  if (!serverName) {
    throw new Error("serverName is required");
  }

  const listenPort = normalizeListenPort(options.listenPort);
  const upstreamOrigin = normalizeUpstreamOrigin(options.upstreamOrigin);
  const frontendRoot = normalizeFrontendRoot(options.frontendRoot);
  const encodedProject = encodeURIComponent(projectKey);
  const encodedEnv = encodeURIComponent(env);

  return [
    "server {",
    `  listen ${listenPort};`,
    `  server_name ${serverName};`,
    "",
    "  charset utf-8;",
    "",
    "  # 业务前端静态资源",
    "  location / {",
    `    root ${frontendRoot};`,
    "    try_files $uri /index.html;",
    "  }",
    "",
    "  # 平台登录接口（全局）",
    "  location = /api/auth/login {",
    `    proxy_pass ${upstreamOrigin}/api/auth/login;`,
    "    proxy_http_version 1.1;",
    "    proxy_set_header Host $host;",
    "    proxy_set_header X-Real-IP $remote_addr;",
    "    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;",
    "    proxy_set_header X-Forwarded-Proto $scheme;",
    "  }",
    "",
    "  # 以下固定为业务前端统一入口，不暴露 /api/gw/:project/:env",
    "  location = /api/auth/me {",
    `    proxy_pass ${upstreamOrigin}/api/gw/${encodedProject}/${encodedEnv}/auth/me;`,
    "    proxy_http_version 1.1;",
    "    proxy_set_header Host $host;",
    "    proxy_set_header X-Real-IP $remote_addr;",
    "    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;",
    "    proxy_set_header X-Forwarded-Proto $scheme;",
    "  }",
    "",
    "  location = /api/sql {",
    `    proxy_pass ${upstreamOrigin}/api/gw/${encodedProject}/${encodedEnv}/sql;`,
    "    proxy_http_version 1.1;",
    "    proxy_set_header Host $host;",
    "    proxy_set_header X-Real-IP $remote_addr;",
    "    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;",
    "    proxy_set_header X-Forwarded-Proto $scheme;",
    "  }",
    "",
    "  location = /api/health {",
    `    proxy_pass ${upstreamOrigin}/api/gw/${encodedProject}/${encodedEnv}/health;`,
    "    proxy_http_version 1.1;",
    "    proxy_set_header Host $host;",
    "    proxy_set_header X-Real-IP $remote_addr;",
    "    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;",
    "    proxy_set_header X-Forwarded-Proto $scheme;",
    "  }",
    "}",
  ].join("\n");
}

function buildDefaultNginxSettings(projectKey, env) {
  const normalizedProject = normalizeKeySegment(projectKey, "projectKey");
  const normalizedEnv = normalizeKeySegment(env, "env");
  const serverName = renderTemplate(nginx.serverNameTemplate || "{projectKey}.local", {
    projectKey: normalizedProject,
    env: normalizedEnv,
  });

  return {
    projectKey: normalizedProject,
    env: normalizedEnv,
    serverName,
    listenPort: normalizeListenPort(nginx.listenPort),
    frontendRoot: resolveProjectFrontendWebRoot(normalizedProject, normalizedEnv),
    frontendDir: resolveProjectFrontendDir(normalizedProject, normalizedEnv),
    upstreamOrigin: normalizeUpstreamOrigin(nginx.upstreamOrigin),
  };
}

async function ensureNginxConfDir() {
  await fs.mkdir(nginx.confDir, { recursive: true });
}

function upgradeLegacyFrontendRoot(configText, frontendRoot) {
  const text = String(configText || "");
  const nextRoot = normalizeFrontendRoot(frontendRoot);
  const legacyRootLine = "root /usr/share/nginx/html;";
  const nextRootLine = `root ${nextRoot};`;
  if (!text.includes(legacyRootLine) || text.includes(nextRootLine)) {
    return {
      changed: false,
      configText: text,
    };
  }

  // 仅升级系统生成的项目 conf，避免误改自定义配置
  const looksGeneratedProjectConf =
    text.includes("# 业务前端静态资源") &&
    text.includes("location = /api/auth/me") &&
    text.includes("location = /api/sql") &&
    text.includes("location = /api/health");
  if (!looksGeneratedProjectConf) {
    return {
      changed: false,
      configText: text,
    };
  }

  return {
    changed: true,
    configText: text.replace(legacyRootLine, nextRootLine),
  };
}

function buildFrontendPlaceholderHtml(projectKey, env) {
  return [
    "<!doctype html>",
    '<html lang="zh-CN">',
    "  <head>",
    '    <meta charset="UTF-8" />',
    '    <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    `    <title>${projectKey}/${env} 前端待部署</title>`,
    "  </head>",
    "  <body>",
    "    <main style=\"font-family: sans-serif; padding: 24px;\">",
    `      <h1>项目 ${projectKey} / ${env} 前端待部署</h1>`,
    "      <p>当前项目已开通网关与数据库，请将业务前端构建产物发布到此目录。</p>",
    "    </main>",
    "  </body>",
    "</html>",
  ].join("\n");
}

async function ensureProjectFrontendDir(projectKey, env) {
  if (!nginx.autoCreateFrontendDir) {
    return null;
  }

  const frontendDir = resolveProjectFrontendDir(projectKey, env);
  await fs.mkdir(frontendDir, { recursive: true });

  const indexPath = path.join(frontendDir, "index.html");
  let hasIndex = true;
  try {
    await fs.access(indexPath);
  } catch (_err) {
    hasIndex = false;
  }
  if (!hasIndex) {
    await fs.writeFile(indexPath, buildFrontendPlaceholderHtml(projectKey, env), "utf8");
  }

  return {
    path: frontendDir,
    indexPath,
    indexCreated: !hasIndex,
  };
}

async function getProjectEnvNginxConfig(projectKey, env) {
  if (!nginx.enabled) {
    throw new Error("nginx config management is disabled");
  }
  const defaults = buildDefaultNginxSettings(projectKey, env);
  const confPath = resolveProjectEnvNginxPath(defaults.projectKey, defaults.env);

  let configText;
  let source = "generated";
  let exists = false;
  try {
    configText = await fs.readFile(confPath, "utf8");
    source = "file";
    exists = true;
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
    configText = buildNginxConfigText(defaults);
  }

  return {
    exists,
    source,
    path: confPath,
    settings: {
      serverName: defaults.serverName,
      listenPort: defaults.listenPort,
      frontendRoot: defaults.frontendRoot,
      frontendDir: defaults.frontendDir,
      upstreamOrigin: defaults.upstreamOrigin,
    },
    configText,
  };
}

async function upsertProjectEnvNginxConfig(projectKey, env, payload = {}) {
  if (!nginx.enabled) {
    throw new Error("nginx config management is disabled");
  }
  const defaults = buildDefaultNginxSettings(projectKey, env);
  await ensureNginxConfDir();
  const frontendDir = await ensureProjectFrontendDir(defaults.projectKey, defaults.env);

  const confPath = resolveProjectEnvNginxPath(defaults.projectKey, defaults.env);
  let configText = String(payload.confText || "").trim();
  if (!configText) {
    configText = buildNginxConfigText({
      ...defaults,
      serverName: payload.serverName || defaults.serverName,
      listenPort: payload.listenPort || defaults.listenPort,
      frontendRoot: payload.frontendRoot || defaults.frontendRoot,
      upstreamOrigin: payload.upstreamOrigin || defaults.upstreamOrigin,
    });
  }

  const normalizedText = configText.endsWith("\n") ? configText : `${configText}\n`;
  await fs.writeFile(confPath, normalizedText, "utf8");

  return {
    path: confPath,
    frontendDir: frontendDir?.path || defaults.frontendDir,
    configText: normalizedText,
  };
}

async function ensureProjectEnvNginxConfig(projectKey, env, options = {}) {
  if (!nginx.enabled || !nginx.autoGenerateOnProjectCreate) {
    return null;
  }

  const defaults = buildDefaultNginxSettings(projectKey, env);
  const confPath = resolveProjectEnvNginxPath(defaults.projectKey, defaults.env);
  await ensureNginxConfDir();
  const frontendDir = await ensureProjectFrontendDir(defaults.projectKey, defaults.env);

  let exists = false;
  try {
    await fs.access(confPath);
    exists = true;
  } catch (_err) {
    exists = false;
  }

  if (exists && !options.overwrite) {
    let upgradedLegacyRoot = false;
    if (options.autoUpgradeLegacyRoot !== false) {
      const currentText = await fs.readFile(confPath, "utf8");
      const upgraded = upgradeLegacyFrontendRoot(currentText, defaults.frontendRoot);
      if (upgraded.changed) {
        const normalizedText = upgraded.configText.endsWith("\n") ? upgraded.configText : `${upgraded.configText}\n`;
        await fs.writeFile(confPath, normalizedText, "utf8");
        upgradedLegacyRoot = true;
      }
    }

    return {
      created: false,
      path: confPath,
      frontendDir: frontendDir?.path || defaults.frontendDir,
      upgradedLegacyRoot,
    };
  }

  const configText = buildNginxConfigText(defaults);
  await fs.writeFile(confPath, `${configText}\n`, "utf8");
  return {
    created: true,
    path: confPath,
    frontendDir: frontendDir?.path || defaults.frontendDir,
  };
}

async function reloadNginxConfig() {
  if (!nginx.reloadCommand || !String(nginx.reloadCommand).trim()) {
    throw new Error("NGINX_RELOAD_COMMAND is not configured");
  }

  try {
    const result = await execAsync(nginx.reloadCommand, {
      timeout: 30000,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    });
    return {
      command: nginx.reloadCommand,
      stdout: String(result.stdout || "").trim(),
      stderr: String(result.stderr || "").trim(),
    };
  } catch (err) {
    const stdout = String(err.stdout || "").trim();
    const stderr = String(err.stderr || "").trim();
    const detail = [stdout, stderr].filter(Boolean).join(" | ");
    throw new Error(detail ? `nginx reload failed: ${detail}` : `nginx reload failed: ${err.message}`);
  }
}

module.exports = {
  buildNginxConfigText,
  ensureProjectFrontendDir,
  getProjectEnvNginxConfig,
  upsertProjectEnvNginxConfig,
  ensureProjectEnvNginxConfig,
  reloadNginxConfig,
};
