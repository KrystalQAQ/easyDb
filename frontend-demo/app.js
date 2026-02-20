const STORAGE_KEY = "easydb_console_state_v6";

function detectDefaultApiBase() {
  if (typeof window !== "undefined" && window.location) {
    const { protocol, hostname, origin } = window.location;
    if ((protocol === "http:" || protocol === "https:") && hostname) {
      if (window.location.port === "3000") {
        return origin;
      }
      return `${protocol}//${hostname}:3000`;
    }
  }
  return "http://localhost:3000";
}

const els = {
  apiBase: document.getElementById("apiBase"),
  projectKey: document.getElementById("projectKey"),
  envKey: document.getElementById("envKey"),
  sharedPassword: document.getElementById("sharedPassword"),
  encryptToggle: document.getElementById("encryptToggle"),
  username: document.getElementById("username"),
  password: document.getElementById("password"),
  btnLogin: document.getElementById("btnLogin"),
  btnMe: document.getElementById("btnMe"),
  btnLogout: document.getElementById("btnLogout"),
  badgeScope: document.getElementById("badgeScope"),
  badgeRole: document.getElementById("badgeRole"),
  badgeToken: document.getElementById("badgeToken"),

  panelButtons: Array.from(document.querySelectorAll("[data-panel-target]")),
  panels: Array.from(document.querySelectorAll(".panel")),
  busyButtons: Array.from(document.querySelectorAll("[data-busy]")),

  projectSearch: document.getElementById("projectSearch"),
  btnRefreshProjects: document.getElementById("btnRefreshProjects"),
  btnCreateProject: document.getElementById("btnCreateProject"),
  newProjectKey: document.getElementById("newProjectKey"),
  newProjectName: document.getElementById("newProjectName"),
  newProjectStatus: document.getElementById("newProjectStatus"),
  projectTableBody: document.getElementById("projectTableBody"),

  envSearch: document.getElementById("envSearch"),
  btnRefreshEnvs: document.getElementById("btnRefreshEnvs"),
  envTableBody: document.getElementById("envTableBody"),

  configProjectKey: document.getElementById("configProjectKey"),
  configEnvKey: document.getElementById("configEnvKey"),
  configEnvStatus: document.getElementById("configEnvStatus"),
  dbHost: document.getElementById("dbHost"),
  dbPort: document.getElementById("dbPort"),
  dbUser: document.getElementById("dbUser"),
  dbPassword: document.getElementById("dbPassword"),
  dbName: document.getElementById("dbName"),
  envRequestPassword: document.getElementById("envRequestPassword"),
  policyTypes: document.getElementById("policyTypes"),
  policyTables: document.getElementById("policyTables"),
  policyRoleTables: document.getElementById("policyRoleTables"),
  policyRequireLimit: document.getElementById("policyRequireLimit"),
  policyMaxLimit: document.getElementById("policyMaxLimit"),
  btnSaveEnvEditor: document.getElementById("btnSaveEnvEditor"),

  varSearch: document.getElementById("varSearch"),
  btnRefreshVars: document.getElementById("btnRefreshVars"),
  varIncludeSecret: document.getElementById("varIncludeSecret"),
  varTableBody: document.getElementById("varTableBody"),
  varProjectKey: document.getElementById("varProjectKey"),
  varEnvKey: document.getElementById("varEnvKey"),
  varKey: document.getElementById("varKey"),
  varValue: document.getElementById("varValue"),
  varIsSecret: document.getElementById("varIsSecret"),
  btnSaveVarEditor: document.getElementById("btnSaveVarEditor"),

  sqlText: document.getElementById("sqlText"),
  sqlParams: document.getElementById("sqlParams"),
  btnRunSql: document.getElementById("btnRunSql"),
  btnLoadSample: document.getElementById("btnLoadSample"),

  auditKeyword: document.getElementById("auditKeyword"),
  auditQuery: document.getElementById("auditQuery"),
  btnRefreshAudit: document.getElementById("btnRefreshAudit"),
  auditTableBody: document.getElementById("auditTableBody"),

  userKeyword: document.getElementById("userKeyword"),
  userRoleFilter: document.getElementById("userRoleFilter"),
  userStatusFilter: document.getElementById("userStatusFilter"),
  btnRefreshUsers: document.getElementById("btnRefreshUsers"),
  btnCreateUser: document.getElementById("btnCreateUser"),
  createUsername: document.getElementById("createUsername"),
  createPassword: document.getElementById("createPassword"),
  createRole: document.getElementById("createRole"),
  createStatus: document.getElementById("createStatus"),
  userTableBody: document.getElementById("userTableBody"),

  statusText: document.getElementById("statusText"),
  outputView: document.getElementById("outputView"),
};

const state = {
  apiBase: detectDefaultApiBase(),
  projectKey: "default",
  env: "prod",
  token: "",
  role: "-",
  encryptEnabled: false,
  sharedPassword: "replace-with-shared-password",
  data: {
    projects: [],
    envs: [],
    vars: [],
    audits: [],
    users: [],
  },
};

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("zh-CN", { hour12: false });
}

function setStatus(message, ok) {
  els.statusText.textContent = message;
  els.statusText.className = ok ? "status ok" : "status err";
}

function setOutput(payload) {
  els.outputView.textContent = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
}

function setBusy(flag) {
  els.busyButtons.forEach((btn) => {
    btn.disabled = flag;
  });
}

function syncBadges() {
  els.badgeScope.textContent = `context: ${state.projectKey || "-"} / ${state.env || "-"}`;
  els.badgeRole.textContent = `role: ${state.role || "-"}`;
  els.badgeToken.textContent = state.token ? `token: ${state.token.slice(0, 20)}...` : "token: (none)";
}

function persistState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      apiBase: state.apiBase,
      projectKey: state.projectKey,
      env: state.env,
      token: state.token,
      role: state.role,
      encryptEnabled: state.encryptEnabled,
      sharedPassword: state.sharedPassword,
    })
  );
}

function restoreState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return;
    state.apiBase = String(parsed.apiBase || state.apiBase);
    state.projectKey = String(parsed.projectKey || state.projectKey);
    state.env = String(parsed.env || state.env);
    state.token = String(parsed.token || "");
    state.role = String(parsed.role || "-");
    state.encryptEnabled = parsed.encryptEnabled !== undefined ? Boolean(parsed.encryptEnabled) : false;
    state.sharedPassword = String(parsed.sharedPassword || state.sharedPassword);
  } catch (_err) {
    // ignore invalid cache
  }
}

function syncStateToInputs() {
  els.apiBase.value = state.apiBase;
  els.projectKey.value = state.projectKey;
  els.envKey.value = state.env;
  els.sharedPassword.value = state.sharedPassword;
  els.encryptToggle.checked = state.encryptEnabled;
  els.newProjectKey.value = state.projectKey;
  els.configProjectKey.value = state.projectKey;
  els.configEnvKey.value = state.env;
  els.varProjectKey.value = state.projectKey;
  els.varEnvKey.value = state.env;
}

function pullGlobalInputs() {
  state.apiBase = els.apiBase.value.trim() || state.apiBase;
  state.projectKey = els.projectKey.value.trim().toLowerCase();
  state.env = els.envKey.value.trim().toLowerCase();
  state.sharedPassword = els.sharedPassword.value;
  state.encryptEnabled = els.encryptToggle.checked;

  persistState();
  syncBadges();
}

function setScope(projectKey, env) {
  const normalizedProject = String(projectKey || "").trim().toLowerCase();
  const normalizedEnv = String(env || "").trim().toLowerCase();
  if (!normalizedProject || !normalizedEnv) return;
  state.projectKey = normalizedProject;
  state.env = normalizedEnv;
  els.projectKey.value = normalizedProject;
  els.envKey.value = normalizedEnv;
  els.configProjectKey.value = normalizedProject;
  els.configEnvKey.value = normalizedEnv;
  els.varProjectKey.value = normalizedProject;
  els.varEnvKey.value = normalizedEnv;
  persistState();
  syncBadges();
}

function buildBaseUrl() {
  const base = state.apiBase.replace(/\/+$/, "");
  return base || detectDefaultApiBase();
}

function encodeSegment(value, label) {
  const text = String(value || "").trim();
  if (!text) {
    throw new Error(`${label} 不能为空`);
  }
  return encodeURIComponent(text);
}

function buildScopedPath(pathSuffix) {
  const project = encodeSegment(state.projectKey, "projectKey");
  const env = encodeSegment(state.env, "env");
  return `/api/gw/${project}/${env}${pathSuffix}`;
}

function getHeaders(withAuth = true) {
  const headers = { "Content-Type": "application/json" };
  if (withAuth && state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }
  return headers;
}

function toBase64(uint8) {
  let text = "";
  for (let i = 0; i < uint8.length; i += 1) {
    text += String.fromCharCode(uint8[i]);
  }
  return btoa(text);
}

function getWebCrypto() {
  if (!globalThis.crypto || !globalThis.crypto.subtle) {
    throw new Error("当前浏览器环境不支持 WebCrypto，请在 HTTPS 或 localhost 下使用。");
  }
  return globalThis.crypto;
}

async function deriveAesKey(password) {
  const webCrypto = getWebCrypto();
  const raw = new TextEncoder().encode(password);
  const hash = await webCrypto.subtle.digest("SHA-256", raw);
  return webCrypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, ["encrypt"]);
}

async function encryptPayload(payload) {
  if (!state.sharedPassword) {
    throw new Error("已启用加密请求，请填写共享加密密码。");
  }
  const webCrypto = getWebCrypto();
  const key = await deriveAesKey(state.sharedPassword);
  const iv = webCrypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(payload));
  const encrypted = new Uint8Array(await webCrypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain));
  const tagLen = 16;
  return {
    encryptedPayload: {
      v: 1,
      iv: toBase64(iv),
      data: toBase64(encrypted.slice(0, encrypted.length - tagLen)),
      tag: toBase64(encrypted.slice(encrypted.length - tagLen)),
    },
  };
}

async function wrapPayload(payload) {
  if (!state.encryptEnabled) return payload;
  return encryptPayload(payload);
}

async function request(path, options = {}) {
  const response = await fetch(`${buildBaseUrl()}${path}`, {
    method: options.method || "GET",
    headers: options.headers || getHeaders(options.auth !== false),
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    const requestId = data.requestId ? `（requestId: ${data.requestId}）` : "";
    throw new Error(`${data.error || response.statusText || "请求失败"}${requestId}`);
  }
  return data;
}

function parseCsvList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseRoleTables(value) {
  const source = String(value || "").trim();
  if (!source) return {};
  try {
    const parsed = JSON.parse(source);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("roleTables 必须是 JSON 对象");
    }
    return parsed;
  } catch (err) {
    throw new Error(`roleTables JSON 格式错误: ${err.message}`);
  }
}

// 高风险操作统一走确认弹窗，减少误触导致的破坏性修改。
function confirmOrThrow(message) {
  const confirmed = window.confirm(message);
  if (!confirmed) {
    throw new Error("已取消操作");
  }
}

function renderProjectsTable() {
  const keyword = els.projectSearch.value.trim().toLowerCase();
  const list = state.data.projects.filter((item) => {
    if (!keyword) return true;
    const text = `${item.projectKey} ${item.name} ${item.status}`.toLowerCase();
    return text.includes(keyword);
  });

  if (list.length === 0) {
    els.projectTableBody.innerHTML = '<tr><td colspan="5">暂无项目数据</td></tr>';
    return;
  }

  els.projectTableBody.innerHTML = list
    .map((item) => {
      return `<tr>
        <td>${escapeHtml(item.projectKey)}</td>
        <td>${escapeHtml(item.name)}</td>
        <td>${escapeHtml(item.status)}</td>
        <td>${escapeHtml(formatTime(item.updatedAt))}</td>
        <td>
          <div class="row">
            <button data-action="project-use" data-project="${escapeHtml(item.projectKey)}">设为上下文</button>
            <button class="btn-sub" data-action="project-load-envs" data-project="${escapeHtml(item.projectKey)}">加载环境</button>
          </div>
        </td>
      </tr>`;
    })
    .join("");
}

function renderEnvsTable() {
  const keyword = els.envSearch.value.trim().toLowerCase();
  const list = state.data.envs.filter((item) => {
    if (!keyword) return true;
    const text = `${item.env} ${item.status} ${item.db?.host || ""} ${item.db?.database || ""}`.toLowerCase();
    return text.includes(keyword);
  });

  if (list.length === 0) {
    els.envTableBody.innerHTML = '<tr><td colspan="5">暂无环境数据</td></tr>';
    return;
  }

  els.envTableBody.innerHTML = list
    .map((item) => {
      const host = item.db?.host || "";
      const port = item.db?.port || 3306;
      const user = item.db?.user || "";
      const database = item.db?.database || "";
      return `<tr data-project="${escapeHtml(els.configProjectKey.value)}" data-env="${escapeHtml(item.env)}" data-host="${escapeHtml(host)}" data-port="${escapeHtml(port)}" data-user="${escapeHtml(user)}" data-database="${escapeHtml(database)}">
        <td>${escapeHtml(item.env)}</td>
        <td>
          <select data-env-status>
            <option value="active" ${item.status === "active" ? "selected" : ""}>active</option>
            <option value="disabled" ${item.status === "disabled" ? "selected" : ""}>disabled</option>
          </select>
        </td>
        <td>${escapeHtml(`${host}:${port}/${database}`)}</td>
        <td>${escapeHtml(formatTime(item.updatedAt))}</td>
        <td>
          <div class="row">
            <button data-action="env-use">切换上下文</button>
            <button class="btn-sub" data-action="env-fill-editor">填充编辑器</button>
            <button class="btn-warn" data-action="env-save-status">保存状态</button>
          </div>
        </td>
      </tr>`;
    })
    .join("");
}

function renderVarsTable() {
  const keyword = els.varSearch.value.trim().toLowerCase();
  const list = state.data.vars.filter((item) => {
    if (!keyword) return true;
    const text = `${item.key} ${item.value}`.toLowerCase();
    return text.includes(keyword);
  });

  if (list.length === 0) {
    els.varTableBody.innerHTML = '<tr><td colspan="5">暂无变量数据</td></tr>';
    return;
  }

  els.varTableBody.innerHTML = list
    .map((item) => {
      return `<tr data-key="${escapeHtml(item.key)}">
        <td>${escapeHtml(item.key)}</td>
        <td><input data-var-row-value value="${escapeHtml(item.value)}" /></td>
        <td><input data-var-row-secret type="checkbox" ${item.isSecret ? "checked" : ""} /></td>
        <td>${escapeHtml(item.version)}</td>
        <td>
          <div class="row">
            <button class="btn-warn" data-action="var-save-row">保存</button>
            <button class="btn-sub" data-action="var-fill-editor">填充编辑器</button>
          </div>
        </td>
      </tr>`;
    })
    .join("");
}

function renderAuditTable() {
  const keyword = els.auditKeyword.value.trim().toLowerCase();
  const list = state.data.audits.filter((item) => {
    if (!keyword) return true;
    const text = `${item.actor || ""} ${item.requestId || ""}`.toLowerCase();
    return text.includes(keyword);
  });

  if (list.length === 0) {
    els.auditTableBody.innerHTML = '<tr><td colspan="5">暂无审计数据</td></tr>';
    return;
  }

  els.auditTableBody.innerHTML = list
    .map((item) => {
      return `<tr>
        <td>${escapeHtml(formatTime(item.timestamp))}</td>
        <td>${escapeHtml(item.status || "-")}</td>
        <td>${escapeHtml(`${item.role || "-"} / ${item.actor || "-"}`)}</td>
        <td>${escapeHtml(item.endpoint || "-")}</td>
        <td>${escapeHtml(item.requestId || "-")}</td>
      </tr>`;
    })
    .join("");
}

function renderUsersTable() {
  if (state.data.users.length === 0) {
    els.userTableBody.innerHTML = '<tr><td colspan="5">暂无用户数据</td></tr>';
    return;
  }

  els.userTableBody.innerHTML = state.data.users
    .map((item) => {
      return `<tr data-username="${escapeHtml(item.username)}">
        <td>${escapeHtml(item.username)}</td>
        <td>
          <select data-user-role>
            <option value="analyst" ${item.role === "analyst" ? "selected" : ""}>analyst</option>
            <option value="admin" ${item.role === "admin" ? "selected" : ""}>admin</option>
            ${
              item.role !== "admin" && item.role !== "analyst"
                ? `<option value="${escapeHtml(item.role)}" selected>${escapeHtml(item.role)}</option>`
                : ""
            }
          </select>
        </td>
        <td>
          <select data-user-status>
            <option value="active" ${item.status === "active" ? "selected" : ""}>active</option>
            <option value="disabled" ${item.status === "disabled" ? "selected" : ""}>disabled</option>
          </select>
        </td>
        <td>${escapeHtml(formatTime(item.last_login_at))}</td>
        <td>
          <div class="row">
            <button class="btn-warn" data-action="user-save-row">保存</button>
            <button class="btn-sub" data-action="user-reset-row">重置密码</button>
            <button class="btn-danger" data-action="user-disable-row">禁用</button>
            <button class="btn-sub" data-action="user-enable-row">启用</button>
            <button class="btn-danger" data-action="user-delete-row">删除</button>
          </div>
        </td>
      </tr>`;
    })
    .join("");
}

async function runAction(actionName, fn) {
  setBusy(true);
  pullGlobalInputs();
  try {
    const result = await fn();
    if (result !== undefined) {
      setOutput(result);
    }
    setStatus(`${actionName}成功`, true);
  } catch (err) {
    setStatus(`${actionName}失败：${err.message}`, false);
  } finally {
    setBusy(false);
  }
}

async function refreshProjects() {
  const data = await request("/api/platform/projects");
  state.data.projects = Array.isArray(data.items) ? data.items : [];
  renderProjectsTable();
  return data;
}

async function refreshEnvs(projectKey) {
  const project = projectKey || els.configProjectKey.value.trim().toLowerCase();
  if (!project) throw new Error("请先填写项目标识");
  els.configProjectKey.value = project;
  const data = await request(`/api/platform/projects/${encodeSegment(project, "projectKey")}/envs`);
  state.data.envs = Array.isArray(data.items) ? data.items : [];
  renderEnvsTable();
  return data;
}

async function refreshVars() {
  const project = els.varProjectKey.value.trim().toLowerCase();
  const env = els.varEnvKey.value.trim().toLowerCase();
  if (!project || !env) throw new Error("变量查询需要 project/env");
  const includeSecret = els.varIncludeSecret.checked ? "true" : "false";
  const data = await request(
    `/api/platform/projects/${encodeSegment(project, "projectKey")}/envs/${encodeSegment(env, "env")}/vars?includeSecret=${includeSecret}`
  );
  state.data.vars = Array.isArray(data.items) ? data.items : [];
  renderVarsTable();
  return data;
}

async function refreshAudit() {
  const query = els.auditQuery.value.trim();
  const data = await request(`/api/admin/audit-logs${query ? `?${query}` : ""}`);
  state.data.audits = Array.isArray(data.items) ? data.items : [];
  renderAuditTable();
  return data;
}

async function refreshUsers() {
  const params = new URLSearchParams();
  params.set("limit", "200");
  const keyword = els.userKeyword.value.trim();
  const role = els.userRoleFilter.value.trim();
  const status = els.userStatusFilter.value.trim();
  if (keyword) params.set("keyword", keyword);
  if (role) params.set("role", role);
  if (status) params.set("status", status);
  const data = await request(`/api/admin/users?${params.toString()}`);
  state.data.users = Array.isArray(data.items) ? data.items : [];
  renderUsersTable();
  return data;
}

function collectEnvPayload() {
  return {
    status: els.configEnvStatus.value,
    db: {
      host: els.dbHost.value.trim(),
      port: Number(els.dbPort.value),
      user: els.dbUser.value.trim(),
      password: els.dbPassword.value === "" ? undefined : els.dbPassword.value,
      database: els.dbName.value.trim(),
    },
    policy: {
      allowedSqlTypes: parseCsvList(els.policyTypes.value),
      allowedTables: parseCsvList(els.policyTables.value),
      roleTables: parseRoleTables(els.policyRoleTables.value),
      requireSelectLimit: els.policyRequireLimit.checked,
      maxSelectLimit: Number(els.policyMaxLimit.value),
    },
    requestEncryptionPassword: els.envRequestPassword.value.trim() || undefined,
  };
}

function fillEnvEditor(projectKey, envItem) {
  els.configProjectKey.value = projectKey;
  els.configEnvKey.value = envItem.env || "";
  els.configEnvStatus.value = envItem.status || "active";
  els.dbHost.value = envItem.db?.host || "";
  els.dbPort.value = String(envItem.db?.port || 3306);
  els.dbUser.value = envItem.db?.user || "";
  els.dbName.value = envItem.db?.database || "";
}

function showPanel(panelId) {
  els.panelButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-panel-target") === panelId);
  });
  els.panels.forEach((panel) => {
    panel.classList.toggle("active", panel.id === panelId);
  });
}

function bindPanelNavigation() {
  els.panelButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      showPanel(btn.getAttribute("data-panel-target"));
    });
  });
}

function bindScopeInputs() {
  [els.apiBase, els.projectKey, els.envKey, els.sharedPassword, els.encryptToggle].forEach((input) => {
    input.addEventListener("change", () => {
      pullGlobalInputs();
      syncBadges();
    });
  });
}

function bindAuthActions() {
  els.btnLogin.addEventListener("click", () =>
    runAction("登录", async () => {
      const body = await wrapPayload({
        username: els.username.value.trim(),
        password: els.password.value,
      });
      const data = await request("/api/auth/login", {
        method: "POST",
        auth: false,
        headers: { "Content-Type": "application/json" },
        body,
      });
      state.token = String(data.token || "");
      state.role = String(data.user?.role || "-");
      persistState();
      syncBadges();
      return data;
    })
  );

  els.btnMe.addEventListener("click", () =>
    runAction("校验身份", async () => {
      const data = await request("/api/auth/me");
      state.role = String(data.user?.role || state.role || "-");
      persistState();
      syncBadges();
      return data;
    })
  );

  els.btnLogout.addEventListener("click", () => {
    state.token = "";
    state.role = "-";
    persistState();
    syncBadges();
    setStatus("已退出登录", true);
  });
}

function bindSqlActions() {
  els.btnLoadSample.addEventListener("click", () => {
    els.sqlText.value = "select id,name from users where id > ? limit 20";
    els.sqlParams.value = "[100]";
  });

  els.btnRunSql.addEventListener("click", () =>
    runAction("执行 SQL", async () => {
      let params;
      try {
        params = JSON.parse(els.sqlParams.value);
      } catch (_err) {
        throw new Error("参数 JSON 解析失败");
      }
      if (!Array.isArray(params)) {
        throw new Error("参数必须是 JSON 数组");
      }
      const body = await wrapPayload({
        sql: els.sqlText.value,
        params,
      });
      return request(buildScopedPath("/sql"), {
        method: "POST",
        body,
      });
    })
  );
}

function bindPlatformActions() {
  els.btnRefreshProjects.addEventListener("click", () => runAction("刷新项目", refreshProjects));
  els.projectSearch.addEventListener("input", renderProjectsTable);

  els.btnCreateProject.addEventListener("click", () =>
    runAction("创建项目", async () => {
      confirmOrThrow("确认创建该项目吗？系统会自动创建默认环境、建库并初始化基础表。");
      const body = await wrapPayload({
        projectKey: els.newProjectKey.value.trim().toLowerCase(),
        name: els.newProjectName.value.trim() || els.newProjectKey.value.trim(),
        status: els.newProjectStatus.value,
      });
      const data = await request("/api/platform/projects", {
        method: "POST",
        body,
      });
      await refreshProjects();
      if (data.defaultEnv?.env) {
        setScope(String(data.item?.projectKey || ""), String(data.defaultEnv.env));
        await refreshEnvs(String(data.item?.projectKey || ""));
      }
      return data;
    })
  );

  els.projectTableBody.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const action = button.getAttribute("data-action");
    const project = button.getAttribute("data-project");
    if (!project) return;

    if (action === "project-use") {
      setScope(project, state.env);
      setStatus(`已切换当前项目为 ${project}。`, true);
      return;
    }

    if (action === "project-load-envs") {
      runAction("加载项目环境", async () => {
        els.configProjectKey.value = project;
        els.varProjectKey.value = project;
        const data = await refreshEnvs(project);
        if (state.data.envs.length > 0) {
          const firstEnv = state.data.envs[0];
          els.configEnvKey.value = firstEnv.env;
          els.varEnvKey.value = firstEnv.env;
          fillEnvEditor(project, firstEnv);
        }
        return data;
      });
    }
  });

  els.btnRefreshEnvs.addEventListener("click", () =>
    runAction("刷新环境", () => refreshEnvs(els.configProjectKey.value.trim().toLowerCase()))
  );
  els.envSearch.addEventListener("input", renderEnvsTable);

  els.envTableBody.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const action = button.getAttribute("data-action");
    const row = button.closest("tr");
    if (!row) return;

    const project = row.getAttribute("data-project") || "";
    const env = row.getAttribute("data-env") || "";
    const host = row.getAttribute("data-host") || "";
    const port = Number(row.getAttribute("data-port") || 3306);
    const user = row.getAttribute("data-user") || "";
    const database = row.getAttribute("data-database") || "";
    const statusEl = row.querySelector("select[data-env-status]");
    const nextStatus = statusEl ? statusEl.value : "active";

    if (action === "env-use") {
      setScope(project, env);
      setStatus(`已切换执行上下文到 ${project}/${env}。`, true);
      return;
    }

    if (action === "env-fill-editor") {
      fillEnvEditor(project, {
        env,
        status: nextStatus,
        db: { host, port, user, database },
      });
      setStatus(`已将 ${project}/${env} 写入环境编辑器。`, true);
      return;
    }

    if (action === "env-save-status") {
      runAction("保存环境状态", async () => {
        confirmOrThrow(`确认将环境 ${project}/${env} 状态改为 ${nextStatus} 吗？`);
        const body = await wrapPayload({
          status: nextStatus,
          db: {
            host,
            port,
            user,
            database,
          },
        });
        const data = await request(
          `/api/platform/projects/${encodeSegment(project, "projectKey")}/envs/${encodeSegment(env, "env")}`,
          {
            method: "PUT",
            body,
          }
        );
        await refreshEnvs(project);
        return data;
      });
    }
  });

  els.btnSaveEnvEditor.addEventListener("click", () =>
    runAction("保存环境", async () => {
      const project = els.configProjectKey.value.trim().toLowerCase();
      const env = els.configEnvKey.value.trim().toLowerCase();
      confirmOrThrow(`确认保存环境配置 ${project}/${env} 吗？此操作会立即影响网关路由。`);
      const payload = collectEnvPayload();
      const body = await wrapPayload(payload);
      const data = await request(
        `/api/platform/projects/${encodeSegment(project, "projectKey")}/envs/${encodeSegment(env, "env")}`,
        {
          method: "PUT",
          body,
        }
      );
      await refreshEnvs(project);
      return data;
    })
  );

  els.btnRefreshVars.addEventListener("click", () => runAction("刷新变量", refreshVars));
  els.varSearch.addEventListener("input", renderVarsTable);
  els.varIncludeSecret.addEventListener("change", () => runAction("刷新变量", refreshVars));

  els.varTableBody.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const action = button.getAttribute("data-action");
    const row = button.closest("tr");
    if (!row) return;

    const key = row.getAttribute("data-key") || "";
    const valueInput = row.querySelector("input[data-var-row-value]");
    const secretInput = row.querySelector("input[data-var-row-secret]");
    const value = valueInput ? valueInput.value : "";
    const isSecret = secretInput ? secretInput.checked : false;
    const project = els.varProjectKey.value.trim().toLowerCase();
    const env = els.varEnvKey.value.trim().toLowerCase();

    if (action === "var-fill-editor") {
      els.varKey.value = key;
      els.varValue.value = value;
      els.varIsSecret.checked = isSecret;
      setStatus(`已将变量 ${key} 填充到编辑器。`, true);
      return;
    }

    if (action === "var-save-row") {
      runAction("保存变量", async () => {
        if (value === "***" && !els.varIncludeSecret.checked) {
          throw new Error("当前变量值被掩码，请填写新值后再保存。");
        }
        if (isSecret) {
          confirmOrThrow(`确认以密文方式保存变量 ${key} 吗？`);
        }
        const body = await wrapPayload({
          value,
          isSecret,
        });
        const data = await request(
          `/api/platform/projects/${encodeSegment(project, "projectKey")}/envs/${encodeSegment(env, "env")}/vars/${encodeSegment(key.toUpperCase(), "varKey")}`,
          {
            method: "PUT",
            body,
          }
        );
        await refreshVars();
        return data;
      });
    }
  });

  els.btnSaveVarEditor.addEventListener("click", () =>
    runAction("保存变量", async () => {
      const project = els.varProjectKey.value.trim().toLowerCase();
      const env = els.varEnvKey.value.trim().toLowerCase();
      const key = els.varKey.value.trim().toUpperCase();
      if (els.varIsSecret.checked) {
        confirmOrThrow(`确认将变量 ${key} 作为密文保存吗？`);
      }
      const body = await wrapPayload({
        value: els.varValue.value,
        isSecret: els.varIsSecret.checked,
      });
      const data = await request(
        `/api/platform/projects/${encodeSegment(project, "projectKey")}/envs/${encodeSegment(env, "env")}/vars/${encodeSegment(key, "varKey")}`,
        {
          method: "PUT",
          body,
        }
      );
      await refreshVars();
      return data;
    })
  );
}

function bindAuditActions() {
  els.btnRefreshAudit.addEventListener("click", () => runAction("刷新审计", refreshAudit));
  els.auditKeyword.addEventListener("input", renderAuditTable);
}

function bindUserActions() {
  els.btnRefreshUsers.addEventListener("click", () => runAction("刷新用户", refreshUsers));

  els.btnCreateUser.addEventListener("click", () =>
    runAction("创建用户", async () => {
      confirmOrThrow("确认创建该用户吗？请确保用户名和权限级别正确。");
      const body = await wrapPayload({
        username: els.createUsername.value.trim(),
        password: els.createPassword.value,
        role: els.createRole.value,
        status: els.createStatus.value,
      });
      const data = await request("/api/admin/users", {
        method: "POST",
        body,
      });
      await refreshUsers();
      return data;
    })
  );

  els.userTableBody.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const action = button.getAttribute("data-action");
    const row = button.closest("tr");
    if (!row) return;

    const username = row.getAttribute("data-username");
    if (!username) return;
    const roleInput = row.querySelector("select[data-user-role]");
    const statusInput = row.querySelector("select[data-user-status]");
    const role = roleInput ? roleInput.value : "analyst";
    const status = statusInput ? statusInput.value : "active";

    if (action === "user-save-row") {
      runAction("更新用户", async () => {
        confirmOrThrow(`确认更新用户 ${username} 的角色/状态吗？`);
        const body = await wrapPayload({ role, status });
        const data = await request(`/api/admin/users/${encodeURIComponent(username)}`, {
          method: "PATCH",
          body,
        });
        await refreshUsers();
        return data;
      });
      return;
    }

    if (action === "user-reset-row") {
      runAction("重置密码", async () => {
        const nextPassword = window.prompt(`请输入用户 ${username} 的新密码（至少8位）`);
        if (!nextPassword) {
          throw new Error("已取消重置密码");
        }
        confirmOrThrow(`确认重置用户 ${username} 的密码吗？`);
        const body = await wrapPayload({ newPassword: nextPassword });
        const data = await request(`/api/admin/users/${encodeURIComponent(username)}/reset-password`, {
          method: "POST",
          body,
        });
        return data;
      });
      return;
    }

    if (action === "user-disable-row") {
      runAction("禁用用户", async () => {
        confirmOrThrow(`确认禁用用户 ${username} 吗？`);
        const data = await request(`/api/admin/users/${encodeURIComponent(username)}/disable`, {
          method: "POST",
        });
        await refreshUsers();
        return data;
      });
      return;
    }

    if (action === "user-enable-row") {
      runAction("启用用户", async () => {
        confirmOrThrow(`确认启用用户 ${username} 吗？`);
        const data = await request(`/api/admin/users/${encodeURIComponent(username)}/enable`, {
          method: "POST",
        });
        await refreshUsers();
        return data;
      });
      return;
    }

    if (action === "user-delete-row") {
      runAction("删除用户", async () => {
        const confirmed = window.confirm(`确认删除用户 ${username} 吗？`);
        if (!confirmed) {
          throw new Error("已取消删除");
        }
        const data = await request(`/api/admin/users/${encodeURIComponent(username)}`, {
          method: "DELETE",
        });
        await refreshUsers();
        return data;
      });
    }
  });
}

async function warmupData() {
  await Promise.allSettled([refreshProjects(), refreshEnvs(state.projectKey), refreshVars(), refreshUsers(), refreshAudit()]);
}

function init() {
  restoreState();
  syncStateToInputs();
  syncBadges();
  bindPanelNavigation();
  bindScopeInputs();
  bindAuthActions();
  bindPlatformActions();
  bindSqlActions();
  bindAuditActions();
  bindUserActions();
  setOutput({ ok: true, message: "控制台已加载，请先使用管理员账号登录。" });
  setStatus("就绪：登录一次后可直接操作所有项目", true);
  warmupData();
}

init();
