# EasyDB Multi-Project SQL Gateway

一个统一网关，面向前端提供安全 SQL 接口，并支持多项目多环境隔离。
核心目标：`单端口统一接入 + 项目前缀路由 + 平台化配置管理`。

当前支持两种业务访问方式：

- 域名模式：`https://test1.example.com/`
- 内网路径模式：`http://10.0.0.8/p/test1/prod/`

前端可根据浏览器当前 URL 自动判断运行基座：命中 `/p/{projectKey}/{env}/` 时走路径模式，否则走域名模式。

## 演示站点

🌐 [http://admin.254253.xyz:3080](http://admin.254253.xyz:3080)

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

- 接入层：`Nginx` 承载前端静态资源，并支持两套入口
  - 域名模式：`server_name` 绑定单项目入口
  - 路径模式：统一入口 `/p/{projectKey}/{env}/...`
  - 两种模式下固定接口 `/api/auth/login`、`/api/auth/me`、`/api/sql`、`/api/health` 都会被转发到网关
- 网关层：`Node.js + Express`，负责统一鉴权、项目路由解析、SQL 安全校验、审计与限流
- 平台控制层：`/api/v2/*`（兼容 `/api/platform/*` 与 `/api/admin/*`），提供项目开通、环境参数、变量管理、Nginx 配置管理、用户与审计能力
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
  ├─ Auth/Admin APIs (/api/auth/*, /api/v2/*, /api/admin/*, /api/platform/*)
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

- 外部环境变量默认只需要：`PORT`
- 若你希望跳过初始化引导，也可额外提供：`DB_HOST`、`DB_PORT`、`DB_USER`、`DB_PASSWORD`、`DB_NAME`
- 其余运行参数（JWT、限流、SQL 策略、加密、Nginx 模板等）统一存放在数据库表 `gateway_platform_settings`
- 首次启动会自动生成密钥并写入 `gateway_platform_settings`，后续重启不会变化

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

首次启动若未配置数据库，系统会进入初始化引导模式：

- 打开控制台首页后自动跳转到 `/setup`
- 填写 DB 连接信息并提交
- 后端会写入 `runtime/bootstrap-db.json`，并自动初始化系统表（包含 `gateway_users` 登录表，若目标库为空还会补默认管理员）
- 控制台顶部提供“系统重置”入口，会删除 `bootstrap-db.json` 并回到初始化向导

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

### A.1 v2 并行接口（可直接发布）

- `POST /api/v2/auth/login`
- `POST /api/v2/auth/authorize`
- `POST /api/v2/auth/token`
- `GET  /api/v2/auth/me`
- `GET  /api/v2/projects`
- `POST /api/v2/projects`
- `DELETE /api/v2/projects/:projectKey`
- `GET  /api/v2/projects/:projectKey/envs`
- `GET  /api/v2/projects/:projectKey/envs/:env`
- `PUT  /api/v2/projects/:projectKey/envs/:env`
- `GET  /api/v2/system/settings`
- `PUT  /api/v2/system/settings/:settingKey`
- `PUT  /api/v2/auth/me/avatar`

同时，v2 已补齐控制面全量能力，按以下规则可直接迁移：

- 旧：`/api/platform/...`
- 新：`/api/v2/...`

例如：

- `/api/platform/projects/:projectKey/envs/:env/nginx` → `/api/v2/projects/:projectKey/envs/:env/nginx`
- `/api/platform/projects/:projectKey/envs/:env/apis` → `/api/v2/projects/:projectKey/envs/:env/apis`
- `/api/platform/projects/:projectKey/envs/:env/api-keys` → `/api/v2/projects/:projectKey/envs/:env/api-keys`

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
- `GET  /api/platform/settings`
- `PUT  /api/platform/settings/:settingKey`

说明：

- 创建项目后会自动初始化一个默认环境（默认 `prod`），库名按 `PLATFORM_DEFAULT_DB_NAME_TEMPLATE` 渲染
- 是否自动执行 `CREATE DATABASE IF NOT EXISTS` 由 `PLATFORM_AUTO_CREATE_DATABASE` 控制（默认 `true`）
- 删除项目默认只删除平台配置，不自动删除 MySQL 物理库
- 环境详情接口会返回 `policy`、`db` 和 `requestEncryptionPasswordEnabled`，便于前端完整展示环境参数
- 若开启 Nginx 管理，创建项目会同步生成 conf 文件（默认目录 `runtime/nginx/conf.d`）
- 创建项目时可自动创建该项目的前端发布目录（默认 `runtime/project-web/{projectKey}/{env}/current`）
- 运行时配置统一落在 `gateway_platform_settings`，`/api/platform/settings/*` 可在线维护（建议改完重启）

### C. 管理员能力（仅 admin）

- `GET /api/v2/admin/audit-logs`（兼容 `/api/admin/audit-logs`）
- `GET/POST/PATCH/DELETE /api/v2/admin/users...`（兼容 `/api/admin/users...`）

### D. 兼容旧接口

- `POST /api/auth/login`
- `POST /api/auth/authorize`（登录后签发一次性 code 并返回回跳地址）
- `POST /api/auth/token`（业务域名回调页用 code 换 JWT）
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

## 低改动统一登录过渡方案

不新增 IdP 的情况下，可先让多个 Node 系统共享同一套 JWT 规则：

1. 统一登录入口继续使用 `POST /api/auth/login`。
2. 所有业务系统统一透传 `Authorization: Bearer <token>`。
3. 统一配置并共享 `JWT_SECRET`、`JWT_ISSUER`、`JWT_AUDIENCE`。
4. 网关会按上述规则严格验签，确保 token 只在受信系统内流通。

建议迁移顺序：

1. 第 1 阶段：只配置 `JWT_SECRET`（保持现状）。
2. 第 2 阶段：新增 `JWT_ISSUER` / `JWT_AUDIENCE`，并让调用方按新规则发 token。
3. 第 3 阶段：所有业务系统切到统一验签参数，完成联调后上线。

### 跨子域（Bearer + localStorage）推荐时序

当管理域名与业务域名不同（如 `admin.xxx` → `nav.xxx`）且不使用 Cookie 共享时：

1. 业务系统跳转统一登录页  
   `/login?client=nav-web&redirect=http://nav.xxx/auth/callback?next=/app/home&state=<nonce>`
2. 登录页调用 `POST /api/auth/authorize`（用户名密码 + client + redirect + state）
3. 网关返回 `redirectTo`（仅包含一次性 `code`，不携带 JWT）
4. 业务系统回调页调用 `POST /api/auth/token` 用 `code` 兑换 JWT
5. 业务系统将 JWT 存入本域 `localStorage`，后续请求带 `Authorization: Bearer <token>`

安全要求：

- 必须配置 `AUTH_CODE_ALLOWED_REDIRECT_ORIGINS` 白名单（精确到 origin）。
- `redirect` 仅允许可信业务域名，禁止任意回跳。
- 授权码默认 60 秒有效且单次使用。

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
- 授权码回调页：`/auth/callback`（`code` 换 JWT 并写入本域存储）
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
docker compose up -d --build
```

说明：

- 现在是单镜像单容器（容器内同时运行 Nginx + Node）
- 默认不依赖 `.env` 中的 DB 参数，首次启动可直接在 `/setup` 填写数据库连接
- 初始化完成后会写入 `runtime/bootstrap-db.json`（已通过 `./runtime:/app/runtime` 持久化）
- 内网无三级域名时可使用路径模式访问项目：`/p/{projectKey}/{env}/`
  - 业务前端：`http://<IP>/p/{projectKey}/{env}/`
  - 业务 SQL：`POST http://<IP>/p/{projectKey}/{env}/api/sql`
  - 业务鉴权：`GET http://<IP>/p/{projectKey}/{env}/api/auth/me`
- 创建项目时会自动在 `runtime/nginx/conf.d` 下生成对应 conf
- 在控制台“项目配置中心”可直接编辑该 conf
- 保存后可点“保存后重载 Nginx”（容器内执行 `nginx -s reload`）
- 管理后台前端已内置到镜像，默认由 Nginx 直接托管
- 项目前端建议发布到：`runtime/project-web/{projectKey}/{env}/current`（容器内映射 `/app/runtime/project-web/...`）

## GitHub Actions（已同步）

- 工作流：`.github/workflows/docker-image.yml`
- `pull_request` 会执行后端类型检查、前端 lint、前端构建，用来拦截无效发布
- `push` 到 `main/master`、推送 `v*` 标签、以及手动触发 `workflow_dispatch` 时，会构建并推送多架构单镜像到 GHCR
- 默认镜像仓库：`ghcr.io/<owner>/<repo>/easydb`
- 默认标签规则：
  - 分支推送：分支名
  - 标签推送：git tag，例如 `v1.2.0`
  - 提交标识：短 SHA
  - 默认分支额外附带 `latest`
- 手动触发工作流时，可额外提供 `image_tag` 生成一个自定义标签
- 工作流摘要会直接输出可执行部署命令

## Docker 发布与部署

当前发布模型已经统一为“前端构建产物 + Node 网关 + Nginx”的单镜像。

### 直接部署

```bash
EASYDB_IMAGE=ghcr.io/<owner>/<repo>/easydb:latest ./deploy/easydb.sh install
```

现在 `.env` 不是必需项。

- 不提供 `.env`：容器会直接启动，首次打开控制台进入 `/setup`，在线填写数据库连接并自动初始化系统表
- 提供 `.env`：容器会带上其中的运行时环境变量启动；如果你已经提前写好了 `DB_*`，也可以跳过引导

若是升级已有环境：

```bash
EASYDB_IMAGE=ghcr.io/<owner>/<repo>/easydb:latest ./deploy/easydb.sh update
```

### 只生成部署命令

如果你想先让脚本帮你拼好完整的 docker 命令，再自行复制到服务器执行：

```bash
EASYDB_IMAGE=ghcr.io/<owner>/<repo>/easydb:latest ./deploy/easydb.sh command install
```

升级命令同理：

```bash
EASYDB_IMAGE=ghcr.io/<owner>/<repo>/easydb:latest ./deploy/easydb.sh command update
```

### 可覆盖的部署变量

- `EASYDB_IMAGE`: 完整镜像名，优先级最高
- `EASYDB_IMAGE_REPOSITORY`: 镜像仓库，默认 `ghcr.io/krystalqaq/easydb/easydb`
- `EASYDB_IMAGE_TAG`: 镜像标签，默认 `latest`
- `EASYDB_BASE_DIR`: 部署根目录，默认 `/opt/easydb-platform`
- `EASYDB_DOCKER_NETWORK`: Docker 网络名，默认 `easydb-platform-net`
- `EASYDB_CONTAINER_NAME`: 容器名，默认 `easydb`
- `EASYDB_PORT`: 对外端口，默认 `3080`

### 需要显式初始化数据库时

只有在你明确要走“命令行预初始化数据库”时，才需要准备 `.env`，然后执行：

```bash
./deploy/easydb.sh init-db
```

这一步会在容器内执行：

- `npm run auth:init`
- `npm run platform:init`
