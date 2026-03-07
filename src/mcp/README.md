# EasyDB 前端部署 MCP 服务器

自动化前端构建、打包和部署的 MCP 服务器。

## 功能

提供 4 个工具：

1. **build_frontend** - 构建前端项目
2. **package_frontend** - 打包构建产物为 zip
3. **deploy_frontend** - 部署 zip 到目标目录
4. **publish_frontend** - 一键发布（构建→打包→部署）

## 安装

```bash
cd src/mcp
npm install
chmod +x bin/easydb-mcp
```

## 配置 MCP 客户端

在 `.claude/settings/mcp.json` 中添加：

```json
{
  "mcpServers": {
    "easydb-deploy": {
      "command": "node",
      "args": ["--import", "tsx", "d:/workspace/tanyu/easyDb/src/mcp/deploy-server.ts"],
      "disabled": false
    }
  }
}
```

## 使用示例

### 一键发布
```
使用 publish_frontend 工具发布前端到 default 项目的 prod 环境
```

### 分步操作
```
1. 使用 build_frontend 构建前端
2. 使用 package_frontend 打包
3. 使用 deploy_frontend 部署
```

## 目录结构

- `frontend-app/dist/` - 构建产物
- `runtime/deploy/` - zip 包存储
- `runtime/project-web/{projectKey}/{env}/current/` - 部署目标
