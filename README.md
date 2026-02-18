# MySQL SQL Gateway (for frontend)

给前端提供一个“类 SQL”接口，但不让前端直连 MySQL。  
前端调用 `POST /api/sql`，后端会做：

- JWT 鉴权
- 支持前端参数加密（AES-256-GCM）后端解密
- 按角色限制可访问表
- admin 用户管理 API（增删改查、重置密码、禁用/启用）
- SQL AST 校验（类型、单语句、LIMIT、表白名单）
- 接口限流
- 审计日志落盘

## 1. 安装

```bash
npm install
```

## 2. 配置

```bash
cp .env.example .env
```

按你的数据库信息修改 `.env`。

重点配置：

- `REQUIRE_AUTH` / `JWT_SECRET`
- `AUTH_PROVIDER` (`env` 或 `db`) / `AUTH_USER_TABLE`
- `AUTH_USERS`（仅 `env` 模式）
- `REQUEST_ENCRYPTION_ENABLED` / `REQUEST_ENCRYPTION_PASSWORD`
- `ROLE_TABLES`: 按角色配置可访问表
- `ALLOWED_SQL_TYPES`: 允许执行的 SQL 类型
- `ALLOWED_TABLES`: 全局允许访问的表（强烈建议设置）
- `REQUIRE_SELECT_LIMIT`: 是否强制 SELECT 带 LIMIT
- `MAX_SELECT_LIMIT`: 查询最大 LIMIT
- `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX`
- `AUDIT_LOG_FILE` / `AUDIT_QUERY_MAX_LIMIT` / `ADMIN_USER_QUERY_MAX_LIMIT`

生成 bcrypt 哈希密码：

```bash
npm run hash:password -- yourPassword
```

初始化数据库认证表（推荐）：

```bash
npm run auth:init
```

## 3. 启动

```bash
npm run dev
```

生产环境：

```bash
npm start
```

## 4. API

### 健康检查

```http
GET /api/health
```

### 登录拿 JWT

```http
POST /api/auth/login
Content-Type: application/json
```

请求体：

```json
{
  "username": "admin",
  "password": "admin123"
}
```

如果启用前端参数加密，也可以发送：

```json
{
  "encryptedPayload": {
    "iv": "base64...",
    "tag": "base64...",
    "data": "base64..."
  }
}
```

### 查看当前用户

```http
GET /api/auth/me
Authorization: Bearer <token>
```

### 执行 SQL（受保护）

```http
POST /api/sql
Content-Type: application/json
Authorization: Bearer <token>
```

请求体：

```json
{
  "sql": "select id,name from users where id > ? limit 20",
  "params": [100]
}
```

加密模式下同样改为 `encryptedPayload` 包装即可。

### 审计日志查询（仅 admin）

```http
GET /api/admin/audit-logs?limit=100&status=ok&actor=admin
Authorization: Bearer <token>
```

### 用户管理（仅 admin，要求 `AUTH_PROVIDER=db`）

```http
GET    /api/admin/users?limit=50&offset=0&status=active&role=analyst&keyword=ali
GET    /api/admin/users/:username
POST   /api/admin/users
PATCH  /api/admin/users/:username
POST   /api/admin/users/:username/reset-password
POST   /api/admin/users/:username/disable
POST   /api/admin/users/:username/enable
DELETE /api/admin/users/:username
```

创建用户示例：

```json
{
  "username": "dev01",
  "password": "StrongPass123!",
  "role": "analyst",
  "status": "active"
}
```

更新用户示例：

```json
{
  "role": "admin",
  "status": "active"
}
```

重置密码示例：

```json
{
  "newPassword": "NewPass123!"
}
```

以上接口同样支持 `encryptedPayload` 模式。

响应示例（SELECT）：

```json
{
  "ok": true,
  "requestId": "6f6e9a13-f632-4cf5-90d2-6bf2bf7dcd5b",
  "type": "select",
  "rowCount": 2,
  "data": [
    { "id": 101, "name": "Tom" },
    { "id": 102, "name": "Jerry" }
  ]
}
```

## 5. 审计日志

- 默认写入 `logs/audit.log`（JSON Lines）
- 记录内容包含：用户、角色、IP、SQL 类型、目标表、执行时长、结果状态等
- 支持通过 `/admin/audit-logs` 做筛选查询（`limit/status/actor/role/sqlType/requestId/from/to`）

## 6. 用户表结构（AUTH_PROVIDER=db）

初始化脚本会创建两张表：

- `gateway_users`：登录用户表
- `gateway_role_table_permissions`：角色到表权限映射（当前主要用于管理展示，核心校验仍由 `ROLE_TABLES` 控制）

`gateway_users` 关键字段：

- `id` bigint PK
- `username` varchar(64) UNIQUE
- `password_hash` varchar(100)（bcrypt）
- `role` varchar(32)（如 `admin` / `analyst`）
- `status` enum(`active`,`disabled`)
- `last_login_at` timestamp
- `created_at` / `updated_at`

## 7. 前端 Demo

- 启动后打开 `http://localhost:3000/demo/`
- 支持登录、验证 token、执行 SQL、查看审计日志、用户管理 API 调试
- 支持“参数加密开关 + 共享密码”模式
- Demo 文件在 `frontend-demo/index.html` + `frontend-demo/app.js`

## 8. 安全建议

- 永远只开放这个网关，不要开放 MySQL 到公网。
- 生产环境务必替换 `JWT_SECRET`，并用数据库或加密哈希管理账号密码。
- 生产只给角色开放必要表，并收紧 `ALLOWED_SQL_TYPES`。
- 审计日志建议定期归档并接入告警系统。

## 10. GitHub Actions Docker 发布

已内置工作流：`.github/workflows/docker-image.yml`

- 触发：push 到 `main/master` 或打 `v*` tag
- 构建：`linux/amd64` + `linux/arm64`
- 推送仓库：`ghcr.io/<owner>/<repo>`

## 11. Docker 一键部署命令

先准备：

- `/opt/sql-gateway/.env`
- `/opt/sql-gateway/frontend-dist/`（Vue 打包产物，含 `index.html`）

然后执行：

```bash
sudo mkdir -p /opt/sql-gateway/frontend-dist /opt/sql-gateway/logs && \
sudo docker pull ghcr.io/<owner>/<repo>:latest && \
(sudo docker rm -f sql-gateway >/dev/null 2>&1 || true) && \
sudo docker run -d \
  --name sql-gateway \
  --restart unless-stopped \
  --env-file /opt/sql-gateway/.env \
  -p 3000:3000 \
  -v /opt/sql-gateway/frontend-dist:/app/frontend-dist:ro \
  -v /opt/sql-gateway/logs:/app/logs \
  ghcr.io/<owner>/<repo>:latest
```

## 9. Vue 前后端分离接入（网关根路径托管）

目标：访问网关根路径 `/` 直接打开 Vue 页面，同时 `/api/*` 继续走后端接口。

1. Vue 侧建议

- Vue Router 使用 history 模式（`createWebHistory()`）。
- API 地址用同源相对路径：`/api/auth/login`、`/api/sql`、`/api/admin/users`，不要写死域名端口。
- 打包后得到 `dist/` 目录。

2. 网关侧配置

- 设置 `FRONTEND_ENABLED=true`
- 设置 `FRONTEND_DIST_DIR=./frontend-dist`（或改成你的实际 dist 路径）
- 把 Vue `dist` 内容放到 `FRONTEND_DIST_DIR` 指向目录，确保有 `index.html`

3. 路由与刷新保证

- 网关会优先处理接口路由：`/api/*`
- 其余前端路由（如 `/users/1`）会回退到 `index.html`，由 Vue Router 接管
- 静态资源请求（`.js/.css/.png`）仍按文件路径直接返回

4. 常见坑

- 刷新 404：通常是没有开启 history fallback，当前网关已处理
- CSP 报错（例如图片被拦截）：这不是 CORS。请配置 `CSP_IMG_SRC` 白名单，例如 `CSP_IMG_SRC='self',data:,https://wb.254253.xyz,https://tvax4.sinaimg.cn`
- 仍建议避免内联脚本，使用外链 JS/CSS（当前 demo 已按此处理）
- 跨域：同源部署后通常不再需要前端额外跨域配置
