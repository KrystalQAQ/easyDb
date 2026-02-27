# API 接口文档（业务前端视角）

业务前端通过 Nginx 反代访问网关，所有路径为简单的 `/api/*` 格式。
项目和环境信息由 Nginx `server_name` 配置决定，前端无需感知。

## 0) 统一认证页约定（推荐）

推荐所有业务系统复用统一认证页作为入口，例如：

`/login?client=nav-web&redirect=/app/home`

约定：
- `client`：发起登录的业务系统标识（用于页面展示或审计标签）。
- `redirect`：认证成功后的站内回跳路径（必须是 `/` 开头的相对路径）。
- 统一认证页内部调用 `POST /api/auth/login`，成功后保存 Token 并跳转 `redirect`。

---

## 1) 统一认证接口

### `POST /api/auth/login`

请求（明文）：
```json
{ "username": "admin", "password": "admin123" }
```

请求（加密）：
```json
{
  "encryptedPayload": {
    "v": 1,
    "iv": "<base64>",
    "data": "<base64>",
    "tag": "<base64>"
  }
}
```

成功响应：
```json
{
  "ok": true,
  "token": "<jwt>",
  "user": { "username": "admin", "role": "admin" },
  "expiresIn": "8h",
  "encryptedRequest": true
}
```

### `GET /api/auth/me`

- 请求头：`Authorization: Bearer <jwt>`
- 成功响应：
```json
{
  "ok": true,
  "user": { "username": "admin", "role": "admin" },
  "scope": { "projectKey": "nav", "env": "prod" }
}
```

---

### `POST /api/auth/authorize`（跨子域登录）

请求体：
```json
{
  "username": "admin",
  "password": "admin123",
  "client": "nav-web",
  "redirect": "http://nav.254253.xyz:3080/auth/callback?next=/app/home",
  "state": "nonce-123"
}
```

成功响应：
```json
{
  "ok": true,
  "code": "ac_xxx",
  "codeExpiresInSeconds": 60,
  "redirectTo": "http://nav.254253.xyz:3080/auth/callback?next=%2Fapp%2Fhome&code=ac_xxx&state=nonce-123"
}
```

### `POST /api/auth/token`（授权码换 JWT）

请求体：
```json
{
  "code": "ac_xxx",
  "client": "nav-web"
}
```

成功响应：
```json
{
  "ok": true,
  "token": "<jwt>",
  "user": { "username": "admin", "role": "admin" },
  "expiresIn": "8h"
}
```

---

### 统一认证登录时序（推荐）

1. 打开统一认证页：`GET /login?client=<client>&redirect=<path>`。
2. 认证页调用：`POST /api/auth/login`。
3. 登录成功后校验：`GET /api/auth/me`。
4. 业务 API 请求统一携带：`Authorization: Bearer <jwt>`。

---

## 2) 业务 API 调用

### `POST /api/<apiKey>`（或 GET/PUT/DELETE，取决于接口定义）

业务接口通过 EasyDB MCP 工具预先定义，定义好后即可通过 `/api/<apiKey>` 调用。

鉴权模式由接口定义的 `authMode` 决定：
- `authMode: "token"` — 必须携带 `Authorization: Bearer <jwt>`
- `authMode: "public"` — 无需 Token

请求体示例（POST）：
```json
{
  "params": {
    "status": "active",
    "limit": 10
  }
}
```

说明：
- 业务接口参数统一放在 `params` 字段内，网关按 `params.<name>` 取值。
- 直接传 `{ "status": "active" }` 会触发“参数 xxx 是必填项”。
- `/api/auth/login`、`/api/auth/me` 不使用该包装规则。

成功响应（SELECT 类接口）：
```json
{
  "ok": true,
  "type": "select",
  "rowCount": 5,
  "data": [{ "id": 1, "name": "张三" }, ...]
}
```

成功响应（INSERT/UPDATE/DELETE 类接口）：
```json
{
  "ok": true,
  "type": "insert",
  "affectedRows": 1
}
```

---

## 3) 健康检查

### `GET /api/health`

成功响应：
```json
{ "ok": true, "projectKey": "nav", "env": "prod" }
```

---

## 4) 业务接口管理（MCP 工具）

业务接口的创建和管理**不通过 HTTP API 调用**，而是使用 EasyDB MCP 工具：

| MCP 工具 | 用途 |
|----------|------|
| `easydb_get_schema` | 查看项目数据库的表结构（表名、列定义、索引） |
| `easydb_list_apis` | 列出项目下所有已定义的业务接口 |
| `easydb_create_api` | 创建新的业务接口（定义 SQL 模板、参数、鉴权模式等） |
| `easydb_update_api` | 更新已有接口定义 |
| `easydb_test_api` | 用测试参数执行接口，验证是否正常 |

### 创建接口示例

```
easydb_create_api({
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
```

创建后，业务前端即可通过 `POST /api/get-user-list` 调用此接口，请求体例如：

```json
{
  "params": {
    "status": "active",
    "limit": 10
  }
}
```

### 接口定义字段说明

| 字段 | 说明 |
|------|------|
| `apiKey` | 接口标识，即 URL 路径名（如 `get-user-list`） |
| `sqlTemplate` | SQL 模板，使用 `:paramName` 命名参数 |
| `sqlType` | `select` / `insert` / `update` / `delete` |
| `method` | HTTP 方法 `GET` / `POST` / `PUT` / `DELETE`，默认 POST |
| `paramsSchema` | 参数定义数组，每项含 `name`、`type`（string/integer/number/boolean）、`required`、`default` |
| `authMode` | `token`（需认证）/ `public`（公开访问），默认 token |
| `cacheTTL` | 缓存秒数，0 表示不缓存 |
| `groupKey` | 所属分组标识（可选） |
| `resultMapping` | 结果映射，如 `{ type: "list" }` 或 `{ type: "single" }` |

---

## 5) 常见错误状态码

| 状态码 | 含义 |
|--------|------|
| `400` | 参数校验失败 / 解密失败 |
| `401` | 缺少或无效 Token / 用户名密码错误 / 此接口需要身份认证 |
| `403` | 权限不足 / 项目或环境已禁用 |
| `404` | 接口不存在 |
| `429` | 请求频率超限 |
| `500` | 后端内部错误 |

---

## 6) Nginx 反代原理（参考）

业务前端不需要关心此部分，仅供理解架构：

```
业务前端 (nav.example.com)
  │
  ├── POST /api/auth/login   ──→ Nginx ──→ gateway:3000/api/auth/login       （全局鉴权）
  ├── GET  /api/auth/me      ──→ Nginx ──→ gateway:3000/api/gw/nav/prod/auth/me
  ├── GET  /api/health       ──→ Nginx ──→ gateway:3000/api/gw/nav/prod/health
  └── POST /api/get-users    ──→ Nginx ──→ gateway:3000/api/gw/nav/prod/api/get-users
```

每个项目的 Nginx 配置在管理控制台中自动生成，`projectKey` 和 `env` 被写入 `proxy_pass` 地址中，业务前端完全无需感知。
