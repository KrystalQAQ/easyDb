# API 接口文档（多项目网关）

## 1) 全局鉴权接口

登录和身份验证使用全局接口，Token 全局复用，无需按项目区分。

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
  "user": { "username": "admin", "role": "admin" }
}
```

---

## 2) SQL 执行接口

### `POST /api/sql`

- 请求头：`Authorization: Bearer <jwt>`（公开访问环境无需此头）
- 请求体：
```json
{
  "sql": "select id, name from users where id > ? limit 20",
  "params": [100]
}
```

成功响应（select）：
```json
{
  "ok": true,
  "requestId": "<uuid>",
  "type": "select",
  "rowCount": 2,
  "data": [{ "id": 101, "name": "Tom" }]
}
```

错误响应：
```json
{ "ok": false, "error": "错误信息", "requestId": "<uuid>" }
```

说明：
- 所有 SQL 请求经过 AST 解析和策略校验，不符合策略的请求直接拒绝。
- 公开访问模式下无需 Token，但只允许 SELECT。
- SQL 参数使用 `?` 占位符，`params` 传数组。

---

## 3) 平台管理接口（仅管理员）

所有平台接口需要 `Authorization: Bearer <jwt>`，且用户角色必须为 `admin`。

### 项目管理

- `GET  /api/platform/projects` — 获取所有项目列表
- `POST /api/platform/projects` — 创建项目
- `DELETE /api/platform/projects/:projectKey` — 删除项目

`POST /api/platform/projects` 请求体：
```json
{
  "projectKey": "crm",
  "name": "CRM 系统",
  "status": "active",
  "dbMode": "manual",
  "db": {
    "host": "127.0.0.1",
    "port": 3306,
    "user": "root",
    "password": "secret",
    "database": "crm_prod"
  }
}
```

成功响应：
```json
{
  "ok": true,
  "item": { "projectKey": "crm", "name": "CRM 系统", "status": "active" },
  "defaultEnv": {
    "created": true,
    "databaseCreated": true,
    "env": "prod",
    "db": { "host": "127.0.0.1", "port": 3306, "user": "root", "database": "crm_prod" }
  }
}
```

### 环境管理

- `GET  /api/platform/projects/:projectKey/envs` — 获取项目下所有环境
- `GET  /api/platform/projects/:projectKey/envs/:env` — 获取单个环境详情
- `PUT  /api/platform/projects/:projectKey/envs/:env` — 创建或更新环境

`PUT` 请求体：
```json
{
  "status": "active",
  "db": {
    "host": "127.0.0.1",
    "port": 3306,
    "user": "root",
    "password": "secret",
    "database": "demo_db"
  },
  "policy": {
    "allowedSqlTypes": ["select"],
    "allowedTables": ["users", "orders"],
    "roleTables": {
      "admin": "*",
      "analyst": ["users", "orders"]
    },
    "requireSelectLimit": true,
    "maxSelectLimit": 500,
    "publicAccess": false
  },
  "requestEncryptionPassword": "shared-password"
}
```

`GET` 单个环境响应：
```json
{
  "ok": true,
  "item": {
    "projectKey": "crm",
    "env": "prod",
    "status": "active",
    "db": { "host": "127.0.0.1", "port": 3306, "user": "root", "database": "crm_prod" },
    "policy": { "allowedSqlTypes": ["select"], "publicAccess": false },
    "publicAccess": false,
    "requestEncryptionPasswordEnabled": true
  }
}
```

### 环境变量管理

- `GET  /api/platform/projects/:projectKey/envs/:env/vars?includeSecret=true` — 获取变量列表
- `PUT  /api/platform/projects/:projectKey/envs/:env/vars/:varKey` — 创建或更新变量

`PUT` 请求体：
```json
{
  "value": "https://api.example.com",
  "isSecret": false
}
```

---

## 4) 管理员接口（仅管理员）

### 审计日志

- `GET /api/admin/audit-logs` — 查询审计日志

### 用户管理

- `GET    /api/admin/users` — 用户列表
- `GET    /api/admin/users/:username` — 用户详情
- `POST   /api/admin/users` — 创建用户
- `PATCH  /api/admin/users/:username` — 更新用户
- `POST   /api/admin/users/:username/reset-password` — 重置密码
- `POST   /api/admin/users/:username/disable` — 禁用用户
- `POST   /api/admin/users/:username/enable` — 启用用户
- `DELETE /api/admin/users/:username` — 删除用户

---

## 5) 常见错误状态码

| 状态码 | 含义 |
|--------|------|
| `400` | 参数校验失败 / 解密失败 / SQL 格式错误 |
| `401` | 缺少或无效 Token / 用户名密码错误 |
| `403` | 权限不足（非管理员）/ 项目或环境已禁用 |
| `404` | 项目/环境/用户不存在 |
| `409` | 用户名或项目已存在（重复） |
| `429` | 请求频率超限 |
| `500` | 后端内部错误 |
