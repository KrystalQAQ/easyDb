# 前端开发食谱（业务前端视角）

## 1) 构建统一的请求客户端

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

所有接口路径都是简单的 `/api/*`，无需拼接项目或环境信息。

---

## 2) 鉴权状态管理

```json
{
  "token": "<jwt>",
  "user": { "username": "admin", "role": "admin" }
}
```

规则：
- 通过 `/api/auth/login` 登录一次，Token 全局复用。
- 持久化到 `localStorage`。
- 公开访问接口无需 Token，直接发请求即可。

```js
// 登录
async function login(username, password) {
  const data = await request('/api/auth/login', {
    method: 'POST',
    body: { username, password },
  })
  // data.token, data.user
  localStorage.setItem('token', data.token)
  return data
}

// 验证当前身份
async function verifyMe(token) {
  return request('/api/auth/me', { token })
}
```

---

## 3) 调用业务 API

业务 API 通过 EasyDB MCP 工具预先定义，前端直接按 `/api/<apiKey>` 调用。

```js
async function callApi(apiKey, params = {}, { method = 'POST', token } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`

  let url = `/api/${apiKey}`
  let body = undefined

  if (method === 'GET') {
    const qs = new URLSearchParams(params).toString()
    if (qs) url += `?${qs}`
  } else {
    // 业务接口参数需要包在 params 字段中
    body = JSON.stringify({ params })
  }

  const res = await fetch(url, { method, headers, body })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.ok === false) {
    const err = new Error(data.error || '请求失败')
    err.requestId = data.requestId
    throw err
  }
  return data
}
```

使用示例：
```js
// 调用预定义的 get-user-list 接口
const result = await callApi('get-user-list', { status: 'active', limit: 10 }, { token })
console.log(result.data) // [{ id: 1, name: '张三' }, ...]

// 调用公开接口（无需 token）
const publicResult = await callApi('get-public-notice', { page: 1 })
```

---

## 4) 管理业务接口（MCP 工具指南）

当用户需要新建或修改业务接口时，引导使用 EasyDB MCP 工具，而不是手写 HTTP 调用。

### 典型工作流

```
步骤 1: 了解数据库结构
  → easydb_get_schema(projectKey: "nav")
  → 返回所有表名、列定义、索引

步骤 2: 检查是否已有类似接口
  → easydb_list_apis(projectKey: "nav")
  → 返回已定义接口列表

步骤 3: 创建新接口
  → easydb_create_api({
      projectKey: "nav",
      apiKey: "get-user-list",
      name: "获取用户列表",
      sqlTemplate: "SELECT id, name FROM users WHERE status = :status LIMIT :limit",
      sqlType: "select",
      paramsSchema: [
        { name: "status", type: "string", required: true, default: "active" },
        { name: "limit", type: "integer", required: false, default: 20 }
      ],
      authMode: "token",
      method: "POST"
    })

步骤 4: 测试接口
  → easydb_test_api({
      projectKey: "nav",
      apiKey: "get-user-list",
      params: { status: "active", limit: 5 }
    })

步骤 5: 前端调用
  → POST /api/get-user-list  { "params": { "status": "active", "limit": 10 } }
```

### SQL 模板语法

- 使用 `:paramName` 命名参数
- 模板会经过 AST 安全校验，确保 SQL 类型与 `sqlType` 匹配
- 示例：`SELECT * FROM orders WHERE user_id = :userId AND status = :status LIMIT :limit`

### 参数类型

| type | 说明 | 示例 |
|------|------|------|
| `string` | 字符串 | `"active"` |
| `integer` | 整数 | `10` |
| `number` | 数字（含小数） | `3.14` |
| `boolean` | 布尔值 | `true` |

---

## 5) 可选：加密请求体

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

## 6) 功能接入顺序

1. 全局登录与身份验证（`/api/auth/login`、`/api/auth/me`）
2. 业务 API 调用（`/api/<apiKey>`）
3. 可选：加密请求模式

---

## 7) UX 与错误处理规范

- 错误 Toast/面板中展示 `requestId`，方便排查。
- 公开访问接口无需显示登录入口，直接使用。
- 严格 CSP 页面避免内联 JS/CSS，使用外部文件。
- 非管理员用户隐藏管理员操作按钮。
- 破坏性操作弹出确认对话框。
