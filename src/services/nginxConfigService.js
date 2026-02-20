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
    frontendRoot: normalizeFrontendRoot(nginx.frontendRoot),
    upstreamOrigin: normalizeUpstreamOrigin(nginx.upstreamOrigin),
  };
}

async function ensureNginxConfDir() {
  await fs.mkdir(nginx.confDir, { recursive: true });
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

  let exists = false;
  try {
    await fs.access(confPath);
    exists = true;
  } catch (_err) {
    exists = false;
  }

  if (exists && !options.overwrite) {
    return {
      created: false,
      path: confPath,
    };
  }

  const configText = buildNginxConfigText(defaults);
  await fs.writeFile(confPath, `${configText}\n`, "utf8");
  return {
    created: true,
    path: confPath,
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
  getProjectEnvNginxConfig,
  upsertProjectEnvNginxConfig,
  ensureProjectEnvNginxConfig,
  reloadNginxConfig,
};
