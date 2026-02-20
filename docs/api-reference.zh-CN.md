# EasyDB API 参考（中文）

本文按模块整理当前后端接口，便于前端和运维对照联调。

## 1. 多项目网关（数据面）

前缀：`/api/gw/:projectKey/:env`

- `POST /auth/login`：已废弃（返回 `410`，请改用全局 `/api/auth/login`）
- `GET /auth/me`：查看当前用户与当前路径上下文
- `POST /sql`：执行 SQL（管理员 token）
- `GET /health`：目标项目环境健康检查

说明：

- 推荐所有新客户端走该前缀。
- 登录只做一次，不再区分作用域 token。

## 2. 平台管理（控制面，admin）

前缀：`/api/platform`

- `GET /projects`：项目列表
- `POST /projects`：创建项目
- `DELETE /projects/:projectKey`：删除项目（仅删除平台配置）
- `GET /projects/:projectKey/envs`：环境列表
- `GET /projects/:projectKey/envs/:env`：环境详情（含策略与加密开关状态）
- `PUT /projects/:projectKey/envs/:env`：新增/更新环境配置
- `GET /projects/:projectKey/envs/:env/nginx`：读取该环境 Nginx 配置
- `PUT /projects/:projectKey/envs/:env/nginx`：保存该环境 Nginx 配置
- `POST /projects/:projectKey/envs/:env/nginx/reload`：重载 Nginx
- `GET /projects/:projectKey/envs/:env/vars`：变量列表
- `PUT /projects/:projectKey/envs/:env/vars/:varKey`：新增/更新变量

创建项目响应会包含 `defaultEnv` 字段（若开启自动初始化）：

```json
{
  "ok": true,
  "item": { "projectKey": "crm", "name": "CRM", "status": "active" },
  "defaultEnv": {
    "created": true,
    "databaseCreated": true,
    "initializedTables": ["users", "orders", "products"],
    "env": "prod",
    "db": { "host": "127.0.0.1", "port": 3306, "user": "root", "database": "crm_prod" },
    "nginxConfPath": "/app/runtime/nginx/conf.d/crm_prod.conf"
  }
}
```

说明：

- `PLATFORM_AUTO_CREATE_DEFAULT_ENV=true` 时，创建项目会自动生成默认环境（默认 `prod`）
- 库名由 `PLATFORM_DEFAULT_DB_NAME_TEMPLATE` 渲染（默认 `{projectKey}_{env}`）
- `databaseCreated` 取决于 `PLATFORM_AUTO_CREATE_DATABASE`（默认 `true`）
- `initializedTables` 为自动初始化的基础表（默认 `users,orders,products`）
- 业务表模板可通过 `PLATFORM_DEFAULT_INIT_TABLES` 调整，也可关闭 `PLATFORM_AUTO_INIT_TABLES`
- 删除项目仅移除平台侧 metadata，不会自动 `DROP DATABASE`
- 若启用 Nginx 管理，创建项目会同步生成对应 `conf` 文件（默认目录 `runtime/nginx/conf.d`）

环境保存请求示例：

```json
{
  "status": "active",
  "db": {
    "host": "192.168.1.125",
    "port": 3306,
    "user": "root",
    "password": "your-password",
    "database": "weibo"
  },
  "policy": {
    "allowedSqlTypes": ["select", "insert", "update", "delete"],
    "allowedTables": ["users", "orders"],
    "roleTables": { "admin": "*", "analyst": ["users", "orders"] },
    "requireSelectLimit": true,
    "maxSelectLimit": 500
  }
}
```

环境详情响应示例：

```json
{
  "ok": true,
  "item": {
    "projectKey": "crm",
    "env": "prod",
    "status": "active",
    "db": { "host": "192.168.1.125", "port": 3306, "user": "root", "database": "crm_prod" },
    "policy": {
      "allowedSqlTypes": ["select", "insert", "update", "delete"],
      "allowedTables": ["users", "orders"],
      "roleTables": { "admin": "*", "analyst": ["users"] },
      "requireSelectLimit": true,
      "maxSelectLimit": 500
    },
    "requestEncryptionPasswordEnabled": false
  }
}
```

Nginx 配置响应示例：

```json
{
  "ok": true,
  "item": {
    "exists": true,
    "source": "file",
    "path": "/app/runtime/nginx/conf.d/crm_prod.conf",
    "settings": {
      "serverName": "crm.local",
      "listenPort": 80,
      "frontendRoot": "/usr/share/nginx/html",
      "upstreamOrigin": "http://gateway:3000"
    },
    "configText": "server { ... }"
  }
}
```

## 3. 管理员能力（admin）

前缀：`/api/admin`

- `GET /audit-logs`：审计检索
- `GET /users`：用户列表
- `GET /users/:username`：用户详情
- `POST /users`：创建用户
- `PATCH /users/:username`：更新角色/状态
- `POST /users/:username/reset-password`：重置密码
- `POST /users/:username/disable`：禁用用户
- `POST /users/:username/enable`：启用用户
- `DELETE /users/:username`：删除用户

## 4. 兼容接口（旧客户端）

前缀：`/api`

- `POST /auth/login`
- `GET /auth/me`
- `POST /sql`
- `GET /health`

说明：

- `/api/sql` 会优先映射到默认项目环境。
- 若默认项目不存在，会回退到旧单库模式。

## 5. 常见状态码

- `200`：成功
- `400`：参数、解密、SQL 校验失败
- `401`：未登录或 token 无效
- `403`：权限不足（admin only）或项目禁用
- `404`：项目/环境/用户不存在
- `409`：资源冲突（如重复项目/用户名）
- `429`：触发 SQL 限流
- `500`：服务异常

## 6. 常见疑问

- `users/orders/products` 是什么？
  - 这是新项目自动开通时的业务表示例模板，不是平台强制标准。
- 哪些表是必须的？
  - 业务表没有强制项，真正必须的是平台控制库里的配置表和 `gateway_users`。
- 业务库 `users` 和平台 `gateway_users` 是同一个吗？
  - 不是。`gateway_users` 负责网关登录；业务库 `users` 仅是业务数据。
- 是否应该有默认管理员？
  - 本地和首次部署建议保留默认管理员用于引导，生产必须立即改密并增加专用管理员账号。
