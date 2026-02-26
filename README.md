# EasyDB Multi-Project SQL Gateway

一个统一网关，面向前端提供安全 SQL 接口，并支持多项目多环境隔离。  
核心目标：`单端口统一接入 + 项目前缀路由 + 平台化配置管理`。

## 功能概览

- 多项目多环境数据面：`/api/gw/:projectKey/:env/*`
- 平台控制面：项目、环境、变量管理 ` /api/platform/*`
- 兼容旧接口：`/api/auth/*`、`/api/sql`、`/api/health`
- JWT 鉴权（管理员单点登录）
- SQL AST 校验（类型、单语句、表权限、LIMIT）
- 可选请求体加密（AES-256-GCM）
- 管理员 API（用户管理、审计查询）
- SQL 限流与审计日志落盘

## 系统架构

### 架构分层

- 接入层：`Nginx` 承载前端静态资源，并将固定接口 `/api/auth/login`、`/api/auth/me`、`/api/sql`、`/api/health` 转发到网关
- 网关层：`Node.js + Express`，负责统一鉴权、项目路由解析、SQL 安全校验、审计与限流
- 平台控制层：`/api/platform/*` 与 `/api/admin/*`，提供项目开通、环境参数、变量管理、Nginx 配置管理、用户与审计能力
- 数据层：
  - 平台库（如 `easydb_platform`）：存放 `gateway_users`、项目/环境/变量元数据
  - 业务库（每项目每环境）：存放业务表（可自动初始化）

### 逻辑拓扑

```text
Browser / App
    |
    v
Nginx (static + /api reverse proxy)
    |
    v
EasyDB Gateway (Express)
  ├─ Auth/Admin APIs (/api/auth/*, /api/admin/*, /api/platform/*)
  ├─ Data APIs (/api/gw/:projectKey/:env/*)
  ├─ SQL Policy + RateLimit + Audit
  └─ Nginx Conf Manager (generate/save/reload)
    |
    +--> Platform DB (gateway_users, projects, envs, vars)
    |
    +--> Project DBs (crm_prod, erp_prod, ...)
```

### 核心请求流程

1. 登录：前端调用 `/api/auth/login`，在平台库校验 `gateway_users`，返回 JWT
2. 业务访问：前端调用固定 `/api/sql`（经 Nginx 转发到目标 `project/env`），网关执行 SQL AST 策略校验后访问业务库
3. 项目开通：管理员创建项目后，系统自动创建默认环境、可选建库建表、可选生成 Nginx conf
4. 配置变更：在控制台修改环境参数/变量/Nginx 配置，保存后可触发 Nginx reload

## 代码结构（已模块化）

```text
src/
  app.js                        # 应用装配（中间件 + 路由挂载）
  server.js                     # 进程入口（HTTP/HTTPS 启动）
  routes/
    legacyRoutes.js             # 兼容旧 API
    gatewayRoutes.js            # 多项目网关 API
    platformRoutes.js           # 平台配置 API
    adminRoutes.js              # 管理员 API
  services/
    sqlGatewayService.js        # SQL 执行/审计/限流核心逻辑
    nginxConfigService.js       # Nginx conf 生成/读取/保存/重载
  http/
    adminCommon.js              # admin 公共中间件
    gatewayContext.js           # 项目环境上下文解析
    mountFrontendApp.js         # 前端静态托管与 history fallback
  utils/
    validators.js               # 输入规范与格式校验
    gatewayPolicy.js            # 策略归一化与合并
  ... 其他基础模块（auth/db/config/projectStore 等）
```

## 快速开始

### 1) 安装

```bash
npm install
pnpm --dir frontend-app install
```

### 2) 配置

```bash
cp .env.example .env
```

重点变量：

- 基础：`PORT`、`DB_*`
- 鉴权：`REQUIRE_AUTH`、`JWT_SECRET`、`AUTH_PROVIDER`
- SQL 策略：`ALLOWED_SQL_TYPES`、`ALLOWED_TABLES`、`ROLE_TABLES`
- 加密：`REQUEST_ENCRYPTION_*`
- 默认关闭请求体加密（`REQUEST_ENCRYPTION_ENABLED=false`），按需开启
- 多项目默认上下文：`DEFAULT_PROJECT_KEY`、`DEFAULT_PROJECT_ENV`
- 平台配置中心：`CONFIG_ENCRYPTION_KEY`、`PLATFORM_*`
- 创建项目自动初始化默认环境（可关闭）：`PLATFORM_AUTO_CREATE_DEFAULT_ENV`
- 是否自动建库（默认开启）：`PLATFORM_AUTO_CREATE_DATABASE`
- 是否自动初始化基础表：`PLATFORM_AUTO_INIT_TABLES`、`PLATFORM_DEFAULT_INIT_TABLES`
- Nginx 管理：`NGINX_*`（创建项目自动生成 conf，后台可编辑并触发重载）
- 项目前端目录：可按模板自动创建（`NGINX_PROJECT_FRONTEND_*`）

### 3) 初始化表

```bash
npm run auth:init
npm run platform:init
```

- `auth:init`：初始化 `gateway_users` 与权限辅助表
- `platform:init`：初始化项目/环境/变量表，并写入默认项目上下文

### 4) 启动

```bash
pnpm frontend:build
npm run dev
# or
npm start
```

可选：本地调试新版控制台

```bash
pnpm frontend:dev
```

## API 分组

详细接口说明见：`docs/api-reference.zh-CN.md`

### A. 多项目网关（推荐）

- `GET /api/gw/:projectKey/:env/auth/me`
- `POST /api/gw/:projectKey/:env/sql`
- `GET /api/gw/:projectKey/:env/health`

说明：

- 登录走全局接口 `/api/auth/login`，管理员 token 可直接访问任意项目环境
- SQL 执行路径仍按 `projectKey/env` 进行隔离
- `/api/gw/:projectKey/:env/auth/login` 已废弃，调用会返回 `410`

### B. 平台管理（仅 admin）

- `GET  /api/platform/projects`
- `POST /api/platform/projects`
- `DELETE /api/platform/projects/:projectKey`
- `GET  /api/platform/projects/:projectKey/envs`
- `GET  /api/platform/projects/:projectKey/envs/:env`
- `PUT  /api/platform/projects/:projectKey/envs/:env`
- `GET  /api/platform/projects/:projectKey/envs/:env/nginx`
- `PUT  /api/platform/projects/:projectKey/envs/:env/nginx`
- `POST /api/platform/projects/:projectKey/envs/:env/nginx/reload`
- `GET  /api/platform/projects/:projectKey/envs/:env/vars`
- `PUT  /api/platform/projects/:projectKey/envs/:env/vars/:varKey`

说明：

- 创建项目后会自动初始化一个默认环境（默认 `prod`），库名按 `PLATFORM_DEFAULT_DB_NAME_TEMPLATE` 渲染
- 是否自动执行 `CREATE DATABASE IF NOT EXISTS` 由 `PLATFORM_AUTO_CREATE_DATABASE` 控制（默认 `true`）
- 删除项目默认只删除平台配置，不自动删除 MySQL 物理库
- 环境详情接口会返回 `policy`、`db` 和 `requestEncryptionPasswordEnabled`，便于前端完整展示环境参数
- 若开启 Nginx 管理，创建项目会同步生成 conf 文件（默认目录 `runtime/nginx/conf.d`）
- 创建项目时可自动创建该项目的前端发布目录（默认 `runtime/project-web/{projectKey}/{env}/current`）

### C. 管理员能力（仅 admin）

- `GET /api/admin/audit-logs`
- `GET/POST/PATCH/DELETE /api/admin/users...`

### D. 兼容旧接口

- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/sql`
- `GET /api/health`

`/api/sql` 会优先映射到 `DEFAULT_PROJECT_KEY/DEFAULT_PROJECT_ENV`，若未配置对应项目则回退单库模式。

## 项目开通默认流程

1. 管理员登录（一次登录即可）
2. 创建项目（`POST /api/platform/projects`）
3. 系统自动完成：
   - 创建默认环境（默认 `prod`）
   - 自动建库（`CREATE DATABASE IF NOT EXISTS`）
   - 自动初始化基础表（默认 `users,orders,products`）
   - 自动生成项目对应 Nginx conf（可在后台继续编辑）
   - 自动创建项目前端占位目录（可直接发布业务前端 dist）
4. 直接通过 `/api/gw/:projectKey/:env/sql` 开始联调

说明：

- 默认初始化表 `users,orders,products` 是业务模板，不是强制标准
- 必需表数量为 0，是否初始化以及初始化哪些表由 `PLATFORM_AUTO_INIT_TABLES` 和 `PLATFORM_DEFAULT_INIT_TABLES` 决定
- 平台登录用户在 `easydb_platform.gateway_users`；业务库里的 `users` 是业务数据表，两者不共享
- 默认管理员 `admin/admin123` 仅用于首次引导，生产环境应立即改密并新增专用管理员

## 生产部署 TODO（建议顺序）

1. 配置强密码与密钥：`JWT_SECRET`、`CONFIG_ENCRYPTION_KEY`
2. 初始化数据库：`npm run auth:init && npm run platform:init`
3. 创建项目后检查默认环境是否符合预期（库名模板、账号、状态）
4. 管理端改为走 `/api/platform/*`，不再手改 `.env`
5. 旧客户端逐步从 `/api/sql` 迁移到 `/api/gw/:projectKey/:env/sql`
6. 开启 HTTPS（内网也建议），并接入日志归档/告警

## 安全建议

- 网关外网暴露，MySQL 只允许内网访问
- 生产禁用弱口令，管理员账号最少化
- 每个项目单独配置白名单表和 SQL 类型
- 敏感变量用平台密文字段存储，避免明文散落
- 审计日志定期归档并设置检索保留策略

## 前端控制台（Vite + TailwindCSS + Ant Design + Router）

- 前端工程：`frontend-app`
- 访问入口：`http://localhost:3000/`
- 路由结构：先登录 `/login`，后进入 `/app/*`
- 本地开发：`pnpm frontend:dev`（默认 5173，代理 `/api` 到 3000）
- 生产构建：`pnpm frontend:build`（输出目录由 `FRONTEND_DIST_DIR` 指向 `frontend-app/dist`）

## Docker + Nginx 一体部署

仓库已提供：

- `docker-compose.yml`
- `nginx/nginx.conf`
- `runtime/nginx/conf.d/default.conf`
- `runtime/nginx/conf.d/00-log-format.conf`

启动：

```bash
pnpm frontend:build
docker compose up -d --build
```

说明：

- 创建项目时会自动在 `runtime/nginx/conf.d` 下生成对应 conf
- 在控制台“项目配置中心”可直接编辑该 conf
- 保存后可点“保存后重载 Nginx”（依赖 `NGINX_RELOAD_COMMAND`）
- 推荐在 `.env` 设置：`NGINX_RELOAD_COMMAND=docker exec easydb-nginx nginx -s reload`
- 默认站点会拦截 `/api/sql`（防止误命中 `_` 站点导致落到 `default/prod`）
- 项目前端建议发布到：`runtime/project-web/{projectKey}/{env}/current`（容器内映射 `/project-web/...`）

## GitHub Actions（已同步）

- 工作流：`.github/workflows/docker-image.yml`
- 现已包含前端构建并上传制品（`frontend-dist`）
- 现已构建并推送双镜像到 GHCR：
  - `ghcr.io/<owner>/<repo>/gateway`
  - `ghcr.io/<owner>/<repo>/nginx`
