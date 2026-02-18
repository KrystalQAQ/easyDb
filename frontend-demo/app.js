const els = {
  apiBase: document.getElementById("apiBase"),
  username: document.getElementById("username"),
  password: document.getElementById("password"),
  encryptToggle: document.getElementById("encryptToggle"),
  sharedPassword: document.getElementById("sharedPassword"),
  sql: document.getElementById("sql"),
  params: document.getElementById("params"),
  auditQuery: document.getElementById("auditQuery"),
  userQuery: document.getElementById("userQuery"),
  targetUsername: document.getElementById("targetUsername"),
  targetRole: document.getElementById("targetRole"),
  targetStatus: document.getElementById("targetStatus"),
  targetPassword: document.getElementById("targetPassword"),
  output: document.getElementById("output"),
  status: document.getElementById("status"),
  tokenPreview: document.getElementById("tokenPreview"),
  roleTag: document.getElementById("roleTag"),
  btnLogin: document.getElementById("btnLogin"),
  btnMe: document.getElementById("btnMe"),
  btnLogout: document.getElementById("btnLogout"),
  btnSql: document.getElementById("btnSql"),
  btnSample: document.getElementById("btnSample"),
  btnAudit: document.getElementById("btnAudit"),
  btnUserList: document.getElementById("btnUserList"),
  btnUserGet: document.getElementById("btnUserGet"),
  btnUserCreate: document.getElementById("btnUserCreate"),
  btnUserUpdate: document.getElementById("btnUserUpdate"),
  btnUserResetPwd: document.getElementById("btnUserResetPwd"),
  btnUserDisable: document.getElementById("btnUserDisable"),
  btnUserEnable: document.getElementById("btnUserEnable"),
  btnUserDelete: document.getElementById("btnUserDelete"),
};

const state = {
  token: localStorage.getItem("jwt_token") || "",
  role: localStorage.getItem("jwt_role") || "-",
};

function setLoading(v) {
  [
    els.btnLogin,
    els.btnMe,
    els.btnLogout,
    els.btnSql,
    els.btnSample,
    els.btnAudit,
    els.btnUserList,
    els.btnUserGet,
    els.btnUserCreate,
    els.btnUserUpdate,
    els.btnUserResetPwd,
    els.btnUserDisable,
    els.btnUserEnable,
    els.btnUserDelete,
  ].forEach((b) => {
    b.disabled = v;
  });
}

function setStatus(text, ok) {
  els.status.textContent = text;
  els.status.className = ok ? "ok" : "bad";
}

function setOutput(obj) {
  els.output.textContent = typeof obj === "string" ? obj : JSON.stringify(obj, null, 2);
}

function syncTokenUI() {
  els.tokenPreview.textContent = state.token ? state.token.slice(0, 28) + "..." : "(none)";
  els.roleTag.textContent = "role: " + (state.role || "-");
}

function getHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (state.token) headers.Authorization = "Bearer " + state.token;
  return headers;
}

function toBase64(uint8) {
  let s = "";
  for (let i = 0; i < uint8.length; i += 1) s += String.fromCharCode(uint8[i]);
  return btoa(s);
}

async function deriveKey(password) {
  const raw = new TextEncoder().encode(password);
  const hash = await crypto.subtle.digest("SHA-256", raw);
  return crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, ["encrypt"]);
}

async function encryptPayload(payload) {
  const pwd = els.sharedPassword.value;
  if (!pwd) throw new Error("Shared encryption password is required");
  const key = await deriveKey(pwd);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(payload));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain));
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
  if (!els.encryptToggle.checked) return payload;
  return encryptPayload(payload);
}

async function request(path, options) {
  const res = await fetch(els.apiBase.value.trim() + path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || res.statusText || "request failed");
  }
  return data;
}

els.btnLogin.addEventListener("click", async () => {
  setLoading(true);
  try {
    const body = await wrapPayload({
      username: els.username.value.trim(),
      password: els.password.value,
    });
    const data = await request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    state.token = data.token;
    state.role = (data.user && data.user.role) || "-";
    localStorage.setItem("jwt_token", state.token || "");
    localStorage.setItem("jwt_role", state.role || "-");
    syncTokenUI();
    setOutput(data);
    setStatus("Login success", true);
  } catch (e) {
    setStatus("Login failed: " + e.message, false);
  } finally {
    setLoading(false);
  }
});

els.btnMe.addEventListener("click", async () => {
  setLoading(true);
  try {
    const data = await request("/api/auth/me", { headers: getHeaders() });
    state.role = (data.user && data.user.role) || "-";
    localStorage.setItem("jwt_role", state.role || "-");
    syncTokenUI();
    setOutput(data);
    setStatus("Token is valid", true);
  } catch (e) {
    setStatus("Check failed: " + e.message, false);
  } finally {
    setLoading(false);
  }
});

els.btnLogout.addEventListener("click", () => {
  state.token = "";
  state.role = "-";
  localStorage.removeItem("jwt_token");
  localStorage.removeItem("jwt_role");
  syncTokenUI();
  setStatus("Logged out", true);
});

els.btnSql.addEventListener("click", async () => {
  setLoading(true);
  try {
    const params = JSON.parse(els.params.value);
    if (!Array.isArray(params)) throw new Error("Params must be JSON array");
    const body = await wrapPayload({ sql: els.sql.value, params });
    const data = await request("/api/sql", {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(body),
    });
    setOutput(data);
    setStatus("SQL success", true);
  } catch (e) {
    setStatus("SQL failed: " + e.message, false);
  } finally {
    setLoading(false);
  }
});

els.btnSample.addEventListener("click", () => {
  els.sql.value = "select id,name from users where id > ? limit 20";
  els.params.value = "[100]";
});

els.btnAudit.addEventListener("click", async () => {
  setLoading(true);
  try {
    const qs = els.auditQuery.value.trim();
    const path = "/api/admin/audit-logs" + (qs ? "?" + qs : "");
    const data = await request(path, { headers: getHeaders() });
    setOutput(data);
    setStatus("Audit logs loaded", true);
  } catch (e) {
    setStatus("Load logs failed: " + e.message, false);
  } finally {
    setLoading(false);
  }
});

function getTargetUsername() {
  return els.targetUsername.value.trim();
}

els.btnUserList.addEventListener("click", async () => {
  setLoading(true);
  try {
    const qs = els.userQuery.value.trim();
    const path = "/api/admin/users" + (qs ? "?" + qs : "");
    const data = await request(path, { headers: getHeaders() });
    setOutput(data);
    setStatus("Users loaded", true);
  } catch (e) {
    setStatus("List users failed: " + e.message, false);
  } finally {
    setLoading(false);
  }
});

els.btnUserGet.addEventListener("click", async () => {
  setLoading(true);
  try {
    const username = getTargetUsername();
    if (!username) throw new Error("Target username is required");
    const data = await request("/api/admin/users/" + encodeURIComponent(username), { headers: getHeaders() });
    setOutput(data);
    setStatus("User loaded", true);
  } catch (e) {
    setStatus("Get user failed: " + e.message, false);
  } finally {
    setLoading(false);
  }
});

els.btnUserCreate.addEventListener("click", async () => {
  setLoading(true);
  try {
    const username = getTargetUsername();
    const body = await wrapPayload({
      username,
      password: els.targetPassword.value,
      role: els.targetRole.value.trim() || "analyst",
      status: els.targetStatus.value.trim() || "active",
    });
    const data = await request("/api/admin/users", {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(body),
    });
    setOutput(data);
    setStatus("User created", true);
  } catch (e) {
    setStatus("Create user failed: " + e.message, false);
  } finally {
    setLoading(false);
  }
});

els.btnUserUpdate.addEventListener("click", async () => {
  setLoading(true);
  try {
    const username = getTargetUsername();
    if (!username) throw new Error("Target username is required");
    const body = await wrapPayload({
      role: els.targetRole.value.trim() || undefined,
      status: els.targetStatus.value.trim() || undefined,
    });
    const data = await request("/api/admin/users/" + encodeURIComponent(username), {
      method: "PATCH",
      headers: getHeaders(),
      body: JSON.stringify(body),
    });
    setOutput(data);
    setStatus("User updated", true);
  } catch (e) {
    setStatus("Update user failed: " + e.message, false);
  } finally {
    setLoading(false);
  }
});

els.btnUserResetPwd.addEventListener("click", async () => {
  setLoading(true);
  try {
    const username = getTargetUsername();
    if (!username) throw new Error("Target username is required");
    const body = await wrapPayload({
      newPassword: els.targetPassword.value,
    });
    const data = await request("/api/admin/users/" + encodeURIComponent(username) + "/reset-password", {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(body),
    });
    setOutput(data);
    setStatus("Password reset success", true);
  } catch (e) {
    setStatus("Reset password failed: " + e.message, false);
  } finally {
    setLoading(false);
  }
});

els.btnUserDisable.addEventListener("click", async () => {
  setLoading(true);
  try {
    const username = getTargetUsername();
    if (!username) throw new Error("Target username is required");
    const data = await request("/api/admin/users/" + encodeURIComponent(username) + "/disable", {
      method: "POST",
      headers: getHeaders(),
    });
    setOutput(data);
    setStatus("User disabled", true);
  } catch (e) {
    setStatus("Disable user failed: " + e.message, false);
  } finally {
    setLoading(false);
  }
});

els.btnUserEnable.addEventListener("click", async () => {
  setLoading(true);
  try {
    const username = getTargetUsername();
    if (!username) throw new Error("Target username is required");
    const data = await request("/api/admin/users/" + encodeURIComponent(username) + "/enable", {
      method: "POST",
      headers: getHeaders(),
    });
    setOutput(data);
    setStatus("User enabled", true);
  } catch (e) {
    setStatus("Enable user failed: " + e.message, false);
  } finally {
    setLoading(false);
  }
});

els.btnUserDelete.addEventListener("click", async () => {
  setLoading(true);
  try {
    const username = getTargetUsername();
    if (!username) throw new Error("Target username is required");
    const data = await request("/api/admin/users/" + encodeURIComponent(username), {
      method: "DELETE",
      headers: getHeaders(),
    });
    setOutput(data);
    setStatus("User deleted", true);
  } catch (e) {
    setStatus("Delete user failed: " + e.message, false);
  } finally {
    setLoading(false);
  }
});

syncTokenUI();
