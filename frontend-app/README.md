# EasyDB 控制台前端

基于 Vite + React + TailwindCSS + Ant Design + React Router。

## 本地开发

```bash
pnpm install
pnpm dev
```

默认地址：`http://localhost:5173/`

- 路由基准路径为 `/`
- `vite` 开发代理会把 `/api` 转发到 `http://localhost:3000`

## 构建

```bash
pnpm build
```

构建产物输出到 `frontend-app/dist`，由后端通过 `FRONTEND_DIST_DIR` 托管到 `http://localhost:3000/`。
