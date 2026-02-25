# EasyDB 业务接口层（Business API）设计文档

> 版本: v1.0 草案
> 日期: 2026-02-25

---

## 1. 背景与动机

### 1.1 现有架构的安全隐患

当前 EasyDB 的数据流为：

```
前端 → POST /api/gw/:projectKey/:env/sql { sql, params } → AST校验 → 执行
```

虽然已有 `sqlPolicy` 做 AST 级别的校验（语句类型、表白名单、LIMIT 强制、角色表权限），但 **SQL 仍然由前端构造并传输**，存在以下风险：

1. **攻击面过大** — 前端可见完整的表名、字段名，攻击者可探测数据库结构
2. **策略绕过风险** — AST 校验依赖解析器完整性，复杂 SQL（子查询、CTE、函数调用）可能存在策略盲区
3. **业务逻辑泄露** — 复杂查询逻辑暴露在前端代码中
4. **版本耦合** — SQL 变更需要前端重新部署

### 1.2 设计目标

在 **保留现有直传 SQL 模式**（供开发调试使用）的基础上，新增**业务接口层**：

- 管理员在后台定义命名接口（Named API），SQL 模板存储在后端
- 前端只需传递接口名 + 参数，不接触 SQL
- 提供 MCP Tool 入口，让 AI 获取表结构并自动生成接口定义
- 支持参数校验、结果转换、缓存等增强能力

---

## 2. 核心概念

### 2.1 业务接口（Business API）

一个业务接口是一个 **命名的、参数化的数据库操作单元**：

```yaml
apiKey:        "getUserOrders"        # 唯一标识（项目+环境维度）
name:          "查询用户订单"          # 人类可读名称
method:        "GET"                   # HTTP 方法
path:          "/orders"              # 自定义路径（可选）
sqlTemplate:   "SELECT o.*, u.username FROM orders o JOIN users u ON o.user_id = u.id WHERE u.id = :userId AND o.status = :status ORDER BY o.created_at DESC LIMIT :limit"
params:                               # 参数定义
  - name: userId
    type: integer
    required: true
  - name: status
    type: string
    required: false
    default: "active"
  - name: limit
    type: integer
    required: false
    default: 20
    max: 100
resultMapping:                        # 结果映射（可选）
  type: "list"                        # list | single | scalar
cacheTTL:      30                     # 缓存秒数（0=不缓存）
auth:          "token"                # token | public
status:        "active"              # active | disabled
```

### 2.2 接口分组（API Group）

接口可以归属于逻辑分组，用于管理和权限控制：

```yaml
groupKey:   "order-service"
name:       "订单服务"
basePath:   "/order"            # 组路径前缀
apis:       ["getUserOrders", "createOrder", ...]
```

### 2.3 SQL 模板语法

使用 **命名参数**（`:paramName`）替代 `?` 占位符，便于阅读和维护：

```sql
-- 命名参数：前端传 { "userId": 123, "status": "active" }
SELECT * FROM orders WHERE user_id = :userId AND status = :status LIMIT :limit

-- 支持条件片段（v2 考虑）：
-- SELECT * FROM orders WHERE 1=1
-- {{#if status}} AND status = :status {{/if}}
-- LIMIT :limit
```

---

## 3. 数据模型

### 3.1 新增平台表

#### `gateway_api_groups` — 接口分组

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | BIGINT AUTO_INCREMENT | PK | |
| `project_env_id` | BIGINT | NOT NULL, FK → gateway_project_envs | 所属项目环境 |
| `group_key` | VARCHAR(64) | NOT NULL | 分组标识 |
| `name` | VARCHAR(128) | NOT NULL | 分组名称 |
| `base_path` | VARCHAR(128) | DEFAULT '' | 路径前缀 |
| `description` | TEXT | | 分组描述 |
| `sort_order` | INT | DEFAULT 0 | 排序序号 |
| `status` | ENUM('active','disabled') | DEFAULT 'active' | |
| `created_at` | TIMESTAMP | DEFAULT NOW() | |
| `updated_at` | TIMESTAMP | DEFAULT NOW() | |
| | | UNIQUE(project_env_id, group_key) | |

#### `gateway_apis` — 业务接口定义

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | BIGINT AUTO_INCREMENT | PK | |
| `project_env_id` | BIGINT | NOT NULL, FK → gateway_project_envs | 所属项目环境 |
| `group_id` | BIGINT | NULLABLE, FK → gateway_api_groups | 所属分组 |
| `api_key` | VARCHAR(128) | NOT NULL | 接口唯一标识 |
| `name` | VARCHAR(128) | NOT NULL | 接口名称 |
| `description` | TEXT | | 接口描述 |
| `method` | ENUM('GET','POST','PUT','DELETE') | DEFAULT 'POST' | HTTP 方法 |
| `path` | VARCHAR(256) | DEFAULT '' | 自定义路径 |
| `sql_template` | TEXT | NOT NULL | SQL 模板（命名参数） |
| `sql_type` | ENUM('select','insert','update','delete') | NOT NULL | SQL 类型 |
| `params_schema` | JSON | | 参数定义（数组） |
| `result_mapping` | JSON | | 结果映射配置 |
| `cache_ttl` | INT | DEFAULT 0 | 缓存秒数 |
| `auth_mode` | ENUM('token','public') | DEFAULT 'token' | 鉴权模式 |
| `sort_order` | INT | DEFAULT 0 | 排序序号 |
| `status` | ENUM('active','disabled') | DEFAULT 'active' | |
| `version` | INT | DEFAULT 1 | 版本号（每次修改+1） |
| `created_by` | VARCHAR(64) | | 创建人 |
| `updated_by` | VARCHAR(64) | | 最后修改人 |
| `created_at` | TIMESTAMP | DEFAULT NOW() | |
| `updated_at` | TIMESTAMP | DEFAULT NOW() | |
| | | UNIQUE(project_env_id, api_key) | |
| | | INDEX(project_env_id, group_id) | |

#### `gateway_api_logs` — 接口调用日志（扩展审计）

复用现有的 `auditLogger` 机制，在审计日志中增加 `apiKey` 字段即可，无需新建表。

### 3.2 params_schema 结构

```json
[
  {
    "name": "userId",
    "type": "integer",
    "required": true,
    "description": "用户ID"
  },
  {
    "name": "status",
    "type": "string",
    "required": false,
    "default": "active",
    "enum": ["active", "disabled", "deleted"],
    "description": "订单状态"
  },
  {
    "name": "limit",
    "type": "integer",
    "required": false,
    "default": 20,
    "min": 1,
    "max": 100
  }
]
```

支持的参数类型：`string`, `integer`, `number`, `boolean`, `datetime`

### 3.3 result_mapping 结构

```json
{
  "type": "list",
  "fields": {
    "id": "id",
    "orderNo": "order_no",
    "amount": "amount",
    "userName": "username"
  }
}
```

- `type`: `list`（返回数组）、`single`（返回第一行对象）、`scalar`（返回第一行第一列的值）
- `fields`: 字段映射/重命名（可选，默认原样返回）

---

## 4. API 设计

### 4.1 数据面 — 业务接口调用

前端调用业务接口，不接触 SQL：

```
POST /api/gw/:projectKey/:env/api/:apiKey
GET  /api/gw/:projectKey/:env/api/:apiKey?userId=123&status=active
```

**请求体**（POST/PUT/DELETE）：

```json
{
  "params": {
    "userId": 123,
    "status": "active"
  }
}
```

**GET 请求**：参数通过 query string 传递。

**响应**：

```json
{
  "ok": true,
  "requestId": "uuid",
  "apiKey": "getUserOrders",
  "type": "select",
  "rowCount": 5,
  "data": [...]
}
```

**路径路由**（可选，v2）：

若接口定义了 `path`，还可以通过自定义路径访问：

```
GET /api/gw/:projectKey/:env/biz/order/list?userId=123
```

### 4.2 管理面 — 接口 CRUD

所有管理接口需要 `authenticate + requireAdmin`。

#### 接口分组

```
GET    /api/platform/projects/:projectKey/envs/:env/api-groups
POST   /api/platform/projects/:projectKey/envs/:env/api-groups
PUT    /api/platform/projects/:projectKey/envs/:env/api-groups/:groupKey
DELETE /api/platform/projects/:projectKey/envs/:env/api-groups/:groupKey
```

#### 接口定义

```
GET    /api/platform/projects/:projectKey/envs/:env/apis
POST   /api/platform/projects/:projectKey/envs/:env/apis
GET    /api/platform/projects/:projectKey/envs/:env/apis/:apiKey
PUT    /api/platform/projects/:projectKey/envs/:env/apis/:apiKey
DELETE /api/platform/projects/:projectKey/envs/:env/apis/:apiKey
```

**创建/更新接口请求体**：

```json
{
  "apiKey": "getUserOrders",
  "name": "查询用户订单",
  "groupKey": "order-service",
  "method": "GET",
  "path": "/orders",
  "sqlTemplate": "SELECT o.*, u.username FROM orders o JOIN users u ON o.user_id = u.id WHERE u.id = :userId LIMIT :limit",
  "sqlType": "select",
  "paramsSchema": [
    { "name": "userId", "type": "integer", "required": true },
    { "name": "limit", "type": "integer", "default": 20, "max": 100 }
  ],
  "resultMapping": { "type": "list" },
  "cacheTTL": 30,
  "authMode": "token",
  "status": "active"
}
```

#### 接口调试

```
POST /api/platform/projects/:projectKey/envs/:env/apis/:apiKey/test
```

请求体：

```json
{
  "params": { "userId": 1, "limit": 5 }
}
```

在管理后台直接执行接口并返回结果，不计入生产审计。

#### 获取表结构（供 AI 和管理员使用）

```
GET /api/platform/projects/:projectKey/envs/:env/schema
GET /api/platform/projects/:projectKey/envs/:env/schema/:tableName
```

返回：

```json
{
  "ok": true,
  "tables": [
    {
      "name": "users",
      "columns": [
        { "name": "id", "type": "bigint", "nullable": false, "key": "PRI", "extra": "auto_increment" },
        { "name": "username", "type": "varchar(64)", "nullable": false, "key": "UNI" },
        { "name": "email", "type": "varchar(128)", "nullable": true }
      ],
      "indexes": [
        { "name": "PRIMARY", "columns": ["id"], "unique": true }
      ]
    }
  ]
}
```

实现方式：通过 `INFORMATION_SCHEMA.COLUMNS` 和 `INFORMATION_SCHEMA.STATISTICS` 查询。

---

## 5. MCP Tool 设计

### 5.1 概述

提供一组 MCP Tool，供 AI（如 Claude Code、Cursor 等）调用，实现**从表结构到业务接口的自动化生成**。

### 5.2 Tool 定义

#### `easydb_get_schema` — 获取数据库表结构

```json
{
  "name": "easydb_get_schema",
  "description": "获取 EasyDB 项目环境的数据库表结构，包括表名、列定义、索引信息",
  "input_schema": {
    "type": "object",
    "properties": {
      "projectKey": { "type": "string", "description": "项目标识" },
      "env": { "type": "string", "description": "环境标识，默认 prod" },
      "table": { "type": "string", "description": "指定表名，为空则返回所有表" }
    },
    "required": ["projectKey"]
  }
}
```

#### `easydb_list_apis` — 列出已有业务接口

```json
{
  "name": "easydb_list_apis",
  "description": "列出项目环境下所有已定义的业务接口",
  "input_schema": {
    "type": "object",
    "properties": {
      "projectKey": { "type": "string" },
      "env": { "type": "string" },
      "groupKey": { "type": "string", "description": "按分组筛选" }
    },
    "required": ["projectKey"]
  }
}
```

#### `easydb_create_api` — 创建业务接口

```json
{
  "name": "easydb_create_api",
  "description": "在 EasyDB 项目环境中创建一个新的业务接口。AI 可根据表结构自动生成 SQL 模板和参数定义。",
  "input_schema": {
    "type": "object",
    "properties": {
      "projectKey": { "type": "string" },
      "env": { "type": "string" },
      "apiKey": { "type": "string", "description": "接口唯一标识" },
      "name": { "type": "string", "description": "接口名称" },
      "groupKey": { "type": "string" },
      "method": { "type": "string", "enum": ["GET", "POST", "PUT", "DELETE"] },
      "sqlTemplate": { "type": "string", "description": "SQL 模板，使用 :paramName 命名参数" },
      "sqlType": { "type": "string", "enum": ["select", "insert", "update", "delete"] },
      "paramsSchema": { "type": "array", "description": "参数定义数组" },
      "resultMapping": { "type": "object" },
      "cacheTTL": { "type": "integer" },
      "authMode": { "type": "string", "enum": ["token", "public"] }
    },
    "required": ["projectKey", "apiKey", "name", "sqlTemplate", "sqlType"]
  }
}
```

#### `easydb_update_api` — 更新业务接口

```json
{
  "name": "easydb_update_api",
  "description": "更新已有的业务接口定义",
  "input_schema": {
    "type": "object",
    "properties": {
      "projectKey": { "type": "string" },
      "env": { "type": "string" },
      "apiKey": { "type": "string" },
      "name": { "type": "string" },
      "sqlTemplate": { "type": "string" },
      "paramsSchema": { "type": "array" },
      "resultMapping": { "type": "object" },
      "cacheTTL": { "type": "integer" },
      "authMode": { "type": "string" },
      "status": { "type": "string" }
    },
    "required": ["projectKey", "apiKey"]
  }
}
```

#### `easydb_test_api` — 测试业务接口

```json
{
  "name": "easydb_test_api",
  "description": "使用测试参数执行业务接口并返回结果",
  "input_schema": {
    "type": "object",
    "properties": {
      "projectKey": { "type": "string" },
      "env": { "type": "string" },
      "apiKey": { "type": "string" },
      "params": { "type": "object", "description": "测试参数" }
    },
    "required": ["projectKey", "apiKey"]
  }
}
```

### 5.3 MCP Server 实现

在项目中新增一个 MCP Server，作为独立进程或集成到现有 Express 服务中：

```
src/
  mcp/
    server.js              # MCP Server 入口（基于 @modelcontextprotocol/sdk）
    tools/
      getSchema.js         # easydb_get_schema 实现
      listApis.js          # easydb_list_apis 实现
      createApi.js         # easydb_create_api 实现
      updateApi.js         # easydb_update_api 实现
      testApi.js           # easydb_test_api 实现
```

MCP Server 通过 HTTP 调用 EasyDB 平台管理 API，复用已有的鉴权和权限机制。配置示例：

```json
{
  "mcpServers": {
    "easydb": {
      "command": "node",
      "args": ["src/mcp/server.js"],
      "env": {
        "EASYDB_BASE_URL": "http://localhost:3000",
        "EASYDB_TOKEN": "<admin-jwt-token>"
      }
    }
  }
}
```

### 5.4 AI 工作流示例

```
用户: "帮我给 CRM 项目创建一个查询用户订单的接口"

AI 执行流程:
1. easydb_get_schema({ projectKey: "crm" })
   → 获取 users, orders 表结构

2. easydb_list_apis({ projectKey: "crm" })
   → 查看是否已有类似接口

3. easydb_create_api({
     projectKey: "crm",
     apiKey: "getUserOrders",
     name: "查询用户订单",
     method: "GET",
     sqlTemplate: "SELECT o.id, o.order_no, o.amount, o.status, o.created_at FROM orders o WHERE o.user_id = :userId ORDER BY o.created_at DESC LIMIT :limit",
     sqlType: "select",
     paramsSchema: [
       { name: "userId", type: "integer", required: true },
       { name: "limit", type: "integer", default: 20, max: 100 }
     ],
     authMode: "token"
   })

4. easydb_test_api({
     projectKey: "crm",
     apiKey: "getUserOrders",
     params: { userId: 1, limit: 5 }
   })
   → 验证接口正常工作

AI 输出: "已创建接口 getUserOrders，前端调用方式：
  GET /api/gw/crm/prod/api/getUserOrders?userId=123&limit=20"
```

---

## 6. 执行引擎设计

### 6.1 接口执行流程

```
请求进入
  │
  ▼
gatewayContext（解析 projectKey/env）
  │
  ▼
查找接口定义（内存缓存 + DB fallback）
  │
  ├── 未找到 → 404
  ├── 已禁用 → 403
  │
  ▼
鉴权检查（根据 authMode）
  │
  ▼
参数校验（根据 paramsSchema）
  │
  ├── 校验失败 → 400 + 详细错误信息
  │
  ▼
缓存命中检查（cacheTTL > 0 时）
  │
  ├── 命中 → 直接返回缓存结果
  │
  ▼
SQL 模板渲染（命名参数 → 位置参数）
  │
  ▼
SQL 安全校验（复用 sqlPolicy 的 AST 校验）
  │
  ▼
执行 SQL（复用 tenantDbManager 获取连接）
  │
  ▼
结果映射（根据 resultMapping 转换）
  │
  ▼
写入缓存（如果 cacheTTL > 0）
  │
  ▼
审计日志（复用 auditLogger，额外记录 apiKey）
  │
  ▼
返回响应
```

### 6.2 SQL 模板渲染

将命名参数转换为数据库驱动支持的 `?` 占位符：

```javascript
// 输入
sqlTemplate: "SELECT * FROM users WHERE id = :userId AND status = :status"
params: { userId: 123, status: "active" }

// 输出
sql:    "SELECT * FROM users WHERE id = ? AND status = ?"
values: [123, "active"]
```

实现要点：
- 正则匹配 `:paramName`，按出现顺序收集为数组
- 同一参数多次出现时，values 中重复填入
- 未提供的可选参数使用 `default` 值
- 必填参数缺失立即拒绝

### 6.3 缓存策略

使用内存缓存（LRU），key 为 `projectKey::env::apiKey::paramsHash`：

- `cacheTTL = 0` — 不缓存（默认）
- `cacheTTL > 0` — 缓存 N 秒
- 接口定义更新时自动清除该接口的所有缓存
- 仅缓存 `select` 类型接口

---

## 7. 前端管理界面

### 7.1 新增页面：接口管理（API Center）

在管理后台左侧菜单新增 **"接口管理"** 入口，路由 `/demo/app/apis`。

#### 页面布局

```
┌─────────────────────────────────────────────────────┐
│  接口管理                     [+ 新建分组] [+ 新建接口] │
├──────────────┬──────────────────────────────────────┤
│              │                                      │
│  分组列表     │  接口列表                              │
│              │  ┌────┬──────┬────┬──────┬────┐      │
│  ▶ 全部 (12) │  │方法│ 接口名│路径│ 状态 │操作│       │
│  ▶ 订单 (5)  │  ├────┼──────┼────┼──────┼────┤      │
│  ▶ 用户 (4)  │  │GET │用户列表│/   │ 启用 │编辑│       │
│  ▶ 产品 (3)  │  │POST│创建订单│/new│ 启用 │编辑│       │
│              │  │... │ ...  │... │ ...  │... │       │
│              │  └────┴──────┴────┴──────┴────┘      │
│              │                                      │
│              │  分页                                  │
├──────────────┴──────────────────────────────────────┤
│  接口编辑区（抽屉或下方展开）                           │
│  ┌────────────────────────────────────────────────┐ │
│  │ 基本信息: apiKey / 名称 / 分组 / HTTP方法 / 路径   │ │
│  │ SQL 模板: [代码编辑器，语法高亮]                    │ │
│  │ 参数定义: [可视化表格，增删参数行]                   │ │
│  │ 高级配置: 鉴权模式 / 缓存TTL / 结果映射            │ │
│  │ 调试面板: [参数输入] [执行] [结果展示]              │ │
│  └────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

#### 核心交互

1. **接口列表** — 按分组筛选，显示方法标签（GET 绿色、POST 蓝色、PUT 橙色、DELETE 红色）
2. **SQL 编辑器** — 使用 CodeMirror/Monaco 提供 SQL 语法高亮，命名参数高亮
3. **参数定义** — 可视化表格，每行一个参数，支持类型选择、必填切换、默认值设置
4. **在线调试** — 填入测试参数，点击执行，实时查看 SQL 渲染结果和执行结果
5. **接口文档** — 每个接口自动生成调用文档和代码片段（cURL、fetch、axios）

### 7.2 项目信息页增强

在 `ProjectCenterPage` 的项目 API 信息区域，增加业务接口的调用说明：

```
数据面接口：
  直传 SQL:  POST /api/gw/{projectKey}/{env}/sql
  业务接口:  POST /api/gw/{projectKey}/{env}/api/{apiKey}
             GET  /api/gw/{projectKey}/{env}/api/{apiKey}?param1=value1
```

---

## 8. 后端模块结构

### 8.1 新增文件

```
src/
  apiStore.js                         # 业务接口元数据持久化（CRUD）
  services/
    apiExecutionService.js            # 接口执行引擎（模板渲染、参数校验、缓存）
    schemaIntrospectService.js        # 数据库表结构自省
  routes/
    gatewayApiRoutes.js               # 数据面路由 /api/gw/:pk/:env/api/*
    platformApiRoutes.js              # 管理面路由 /api/platform/.../apis/*
  mcp/
    server.js                         # MCP Server 入口
    tools/
      getSchema.js
      listApis.js
      createApi.js
      updateApi.js
      testApi.js

frontend-app/src/
  pages/
    ApiCenterPage.jsx                 # 接口管理页面
    components/
      ApiEditor.jsx                   # 接口编辑器组件
      SqlTemplateEditor.jsx           # SQL 模板编辑器
      ParamsSchemaEditor.jsx          # 参数定义编辑器
      ApiDebugPanel.jsx               # 在线调试面板
```

### 8.2 现有文件修改

| 文件 | 修改内容 |
|------|----------|
| `src/app.js` | 挂载新路由 `gatewayApiRoutes`, `platformApiRoutes` |
| `src/projectStore.js` | `ensurePlatformTables()` 中创建新表 |
| `src/services/sqlGatewayService.js` | 抽取 SQL 执行逻辑为可复用函数 |
| `src/auditLogger.js` | 审计日志增加 `apiKey` 字段 |
| `frontend-app/src/App.jsx` | 添加 `/app/apis` 路由 |
| `frontend-app/src/pages/ConsoleLayout.jsx` | 左侧菜单增加 "接口管理" |
| `frontend-app/src/pages/ProjectCenterPage.jsx` | API 信息区增加业务接口说明 |

---

## 9. 安全设计

### 9.1 SQL 模板安全

- 接口创建/更新时，SQL 模板经过 `sqlPolicy` 的 AST 校验，确保不包含危险操作
- SQL 类型（`sqlType`）与模板实际类型必须一致，否则拒绝保存
- 命名参数只能出现在 **值位置**（WHERE 条件值、INSERT 值、LIMIT 值），不可用于表名或列名
- 模板中禁止包含注释（`--`, `/* */`），防止注释注入

### 9.2 参数校验

- 所有参数在渲染前必须通过类型校验
- `integer/number` 类型执行 `min/max` 范围校验
- `string` 类型执行 `maxLength` 校验（默认上限 1000）
- `enum` 类型校验值是否在允许列表中
- 不允许传入未定义的参数（防止参数注入）

### 9.3 权限控制

- 接口管理（CRUD）仅 admin 角色可操作
- 接口调用根据 `authMode` 决定：`token` 需要有效 JWT，`public` 无需认证
- MCP Tool 调用需要有效的 admin JWT token

### 9.4 审计追踪

- 每次接口调用记录：requestId、apiKey、actor、params（脱敏）、执行结果、耗时
- 接口定义变更记录：操作人、变更前后对比、时间戳

---

## 10. 实施计划

### Phase 1 — 基础能力（核心）

1. 数据模型：新增 `gateway_api_groups` 和 `gateway_apis` 表
2. `apiStore.js`：接口元数据 CRUD
3. `apiExecutionService.js`：模板渲染 + 参数校验 + SQL 执行
4. `schemaIntrospectService.js`：表结构查询
5. `gatewayApiRoutes.js`：数据面路由 `POST/GET /api/gw/:pk/:env/api/:apiKey`
6. `platformApiRoutes.js`：管理面路由（接口 CRUD + 调试 + schema 查询）
7. 审计日志扩展

### Phase 2 — 管理界面

1. `ApiCenterPage.jsx`：接口列表 + 分组管理
2. `ApiEditor.jsx`：接口编辑（基本信息 + SQL + 参数）
3. `ApiDebugPanel.jsx`：在线调试
4. 路由和菜单集成

### Phase 3 — MCP 集成

1. MCP Server 实现
2. 5 个 MCP Tool 实现
3. Claude Code Skill 定义（`skills/api-management/`）
4. 使用文档

### Phase 4 — 增强功能（后续迭代）

1. 结果映射和字段重命名
2. 查询缓存
3. 条件 SQL 片段（动态 WHERE 条件）
4. 接口版本管理和回滚
5. 接口导入/导出（JSON 格式，便于环境间迁移）
6. 自定义路径路由（`/api/gw/:pk/:env/biz/...`）

---

## 11. 与现有系统的关系

```
                          ┌─────────────────────┐
                          │    EasyDB Gateway    │
                          ├─────────────────────┤
                          │                     │
  开发/调试 ──────────────▶│ POST /api/.../sql   │──▶ AST校验 → 执行
  （保留，传入原始SQL）      │   (直传SQL模式)      │
                          │                     │
  生产前端 ───────────────▶│ POST /api/.../api/* │──▶ 模板渲染 → 校验 → 执行
  （推荐，只传参数）         │   (业务接口模式)      │
                          │                     │
  AI / MCP ──────────────▶│ MCP Tools           │──▶ 获取schema → 创建/管理接口
  （自动化接口管理）         │   (接口管理)         │
                          │                     │
  管理员 ────────────────▶│ 管理后台             │──▶ 可视化管理接口定义
  （后台管理）              │   (API Center)      │
                          └─────────────────────┘
```

三种模式并存：
1. **直传 SQL 模式**（现有）— 面向开发者调试，保持不变
2. **业务接口模式**（新增）— 面向生产前端，SQL 不出后端
3. **MCP/AI 模式**（新增）— 面向 AI 工具，自动化接口生成

---

## 12. 开放问题

| # | 问题 | 建议 |
|---|------|------|
| 1 | 命名参数是否支持 IN 列表（`:ids` → `WHERE id IN (1,2,3)`）？ | Phase 1 暂不支持，Phase 4 以数组类型参数实现 |
| 2 | 是否需要接口级别的限流配置？ | Phase 1 复用环境级限流，Phase 4 支持接口级 |
| 3 | 是否需要支持事务（多条 SQL 原子执行）？ | Phase 4 以「组合接口」形式支持 |
| 4 | MCP Server 是独立进程还是内嵌到 Express？ | 建议独立进程，通过 HTTP 调用平台 API，解耦运维 |
| 5 | 接口定义是否需要审批流？ | 初期不需要，后续按需增加 |
