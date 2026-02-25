# 前端开发食谱（多项目网关）

## 1) 构建统一的网关请求客户端

```js
async function request(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.ok === false) {
    const err = new Error(data.error || res.statusText || '请求失败')
    err.requestId = data.requestId
    throw err
  }
  return data
}
```

---

## 2) 鉴权状态全局管理，项目上下文本地管理

在一个地方统一存储：

```json
{
  "token": "<jwt>",
  "user": { "username": "admin", "role": "admin" },
  "context": { "projectKey": "crm", "env": "prod" }
}
```

规则：
- 通过 `/api/auth/login` 登录一次，Token 全局复用。
- 切换项目/环境时只更新 `context`，不重置 Token。
- 公开访问环境无需 Token，直接发请求即可。

---

## 3) 执行 SQL 查询

```js
async function runSql(sql, params = [], token = null) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch('/api/sql', {
    method: 'POST',
    headers,
    body: JSON.stringify({ sql, params }),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.ok === false) {
    const err = new Error(data.error || '查询失败')
    err.requestId = data.requestId
    throw err
  }
  return data
}
```

说明：
- `params` 必须是数组，发请求前本地校验。
- 公开访问环境不传 `token`（或传 `null`）即可。
- 错误提示中展示 `requestId`，方便排查。

---

## 4) 可选：加密请求体

```js
async function wrapEncryptedPayload(payload, sharedPassword, enabled) {
  if (!enabled) return payload

  const raw = new TextEncoder().encode(sharedPassword)
  const hash = await crypto.subtle.digest('SHA-256', raw)
  const key = await crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt'])
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plain = new TextEncoder().encode(JSON.stringify(payload))
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain))

  const tagLen = 16
  const data = btoa(String.fromCharCode(...encrypted.slice(0, encrypted.length - tagLen)))
  const tag = btoa(String.fromCharCode(...encrypted.slice(encrypted.length - tagLen)))
  const ivB64 = btoa(String.fromCharCode(...iv))

  return { encryptedPayload: { v: 1, iv: ivB64, data, tag } }
}
```

---

## 5) 功能接入顺序

1. 项目/环境选择器（`projectKey`、`env`）
2. 全局登录与身份验证（`/api/auth/login`、`/api/auth/me`）
3. SQL 查询执行（`/api/sql`）
4. 平台管理页面（`/api/platform/*`）
5. 管理员审计日志与用户管理（`/api/admin/*`）

---

## 6) Vite + Router 基础配置

- 推荐技术栈：Vite + React Router + TailwindCSS + Ant Design。
- 后端在 `/demo/*` 下提供静态文件时，Router basename 设为 `/demo`。
- 统一鉴权守卫：未登录用户始终跳转到 `/demo/login`。
- 公开访问环境的页面无需鉴权守卫，可直接访问。

---

## 7) UX 与错误处理规范

- 错误 Toast/面板中展示 `requestId`，方便用户反馈和排查。
- 非管理员用户隐藏管理员操作按钮（`role !== "admin"` 时不渲染）。
- 删除用户、禁用账号等破坏性操作必须弹出确认对话框。
- 严格 CSP 页面避免内联 JS/CSS，使用外部文件。
- 公开访问模式下，SQL 输入框可直接使用，无需显示登录入口。
