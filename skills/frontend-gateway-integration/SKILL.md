---
name: frontend-gateway-integration
description: 将前端应用与本仓库的多项目网关集成。适用场景：登录/Token 流程、业务 API 调用、加密请求处理、CORS/CSP/鉴权问题排查。需要创建或管理业务接口时，引导使用 EasyDB MCP 工具。
---

# 前端网关集成指南

为业务前端应用提供与 EasyDB 网关的集成对接指南。

## 核心概念

业务前端**不感知**多租户路由结构。每个项目通过独立域名部署，Nginx 按 `server_name` 将简单路径反代到网关内部多租户路由：

```
业务前端（nav.example.com）
  GET  /login            → 统一认证页（推荐统一入口）
  POST /api/get-users    → Nginx → gateway:3000/api/gw/nav/prod/api/get-users
  POST /api/auth/login   → Nginx → gateway:3000/api/auth/login（全局）
```

前端只需使用简单的 `/api/*` 路径，项目和环境信息由 Nginx 配置决定。

统一认证建议：
- 优先复用统一认证页，不在每个业务系统重复开发独立账号密码页。
- 统一认证页提交到全局接口 `POST /api/auth/login`，返回 JWT 后全局复用。
- 登录后通过 `GET /api/auth/me` 做身份校验与会话恢复。
- 若登录页与业务页不同源（如 `admin.xxx` → `nav.xxx`），使用 `POST /api/auth/authorize` + `POST /api/auth/token` 的授权码中转模式。

## 快速工作流

1. 修改前端请求逻辑前，先读 `references/api-contract.md` 了解可用接口。
2. 编写服务层代码或鉴权管理前，先读 `references/frontend-recipes.md`。
3. **需要创建或管理业务接口时**，使用 EasyDB MCP 工具：
   - `easydb_get_schema` — 查看数据库表结构
   - `easydb_list_apis` — 列出已有接口
   - `easydb_create_api` — 创建新接口
   - `easydb_update_api` — 更新已有接口
   - `easydb_test_api` — 测试接口
4. 实现功能时按以下顺序推进：
   - 统一认证登录（优先统一认证页 + `POST /api/auth/login`）
   - 业务 API 调用（`/api/<apiKey>`）
5. 实现统一 HTTP 客户端：
   - 有 Token 时自动附加 `Authorization: Bearer <token>`。
   - 登录一次 Token 全局复用。
   - 业务 API（`/api/<apiKey>`）请求体统一使用 `{ "params": { ... } }`。
   - 支持明文和 `encryptedPayload` 两种请求模式。
   - 统一处理后端错误格式 `{ ok: false, error, requestId? }`。

## 接口管理（MCP 工具）

当用户需要新建或修改业务接口时，**不要手写 HTTP 调用去操作平台 API**，而是引导使用 EasyDB MCP 工具：

```
1. easydb_get_schema(projectKey)           → 了解数据库表结构
2. easydb_list_apis(projectKey)            → 查看已有接口，避免重复
3. easydb_create_api(projectKey, ...)      → 创建新接口（含 SQL 模板、参数定义）
4. easydb_test_api(projectKey, apiKey)     → 测试接口是否正常
```

接口创建后，业务前端即可通过 `/api/<apiKey>` 调用。

## 集成规范

- 登录入口优先统一到认证页（如 `/login`），避免多套登录交互。
- 业务前端使用简单路径：`/api/auth/login`、`/api/<apiKey>`。
- 切换项目通过不同域名实现，前端代码无需感知 projectKey/env。
- `/api/<apiKey>` 参数放在 `params` 字段内，例如 `{ "params": { "userId": 1 } }`。
- `/api/auth/login`、`/api/auth/me` 按鉴权接口规范传参，不使用 `params` 包装。
- 错误提示中展示后端返回的 `requestId`。

## 公开访问模式

部分环境可开启公开访问（无需登录），此时：
- `authMode: "public"` 的业务 API 不需要携带 Token。

## 交付检查清单

- 新增或更新 API 客户端模块。
- 验证登录和 Token 持久化正确。
- 验证业务 API 调用正常。
- 验证加密模式切换行为正确。
- 验证 CSP 安全（严格 CSP 页面无内联 JS）。
- 验证公开访问模式下无需登录即可请求。
