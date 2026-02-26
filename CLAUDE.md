# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

EasyDB is a multi-tenant SQL gateway for frontend applications. It provides secure, policy-enforced SQL access to multiple projects/environments with centralized auth, audit logging, and an admin console.

## Commands

### Backend (root)
```bash
npm run dev          # Start gateway with nodemon (port 3000)
npm start            # Start production server
npm run auth:init    # Initialize auth database
npm run platform:init # Initialize platform database
npm run hash:password # Hash a password
```

### Frontend (frontend-app)
```bash
pnpm --dir frontend-app dev      # Start Vite dev server (port 5173)
pnpm --dir frontend-app build    # Build for production
pnpm --dir frontend-app lint     # Run ESLint
```

### Combined
```bash
npm install && pnpm --dir frontend-app install  # Install all dependencies
```

## Architecture

### Request Flow
```
Browser → Nginx (static + /api proxy) → Express Gateway (port 3000) → Project DB
```

The frontend dev server (port 5173) proxies `/api` to `http://localhost:3000`.

### Backend (`src/`)

**Entry points:**
- `src/server.js` — HTTP/HTTPS server startup
- `src/app.js` — Express app assembly (middleware + routes)

**Route groups:**
- `src/routes/legacyRoutes.js` — `/api/auth/*`, `/api/sql`, `/api/health` (backward compat)
- `src/routes/gatewayRoutes.js` — `/api/gw/:projectKey/:env/*` (multi-project data plane)
- `src/routes/platformRoutes.js` — `/api/platform/*` (project/env/variable management)
- `src/routes/adminRoutes.js` — `/api/admin/*` (user and audit management)

**Core services:**
- `src/services/sqlGatewayService.js` — SQL execution, audit, rate limiting
- `src/services/nginxConfigService.js` — Nginx config generation and hot-reload
- `src/services/projectProvisionService.js` — Auto-provisioning of projects/environments

**Key modules:**
- `src/sqlPolicy.js` — SQL AST validation (type, single-statement, table permissions, LIMIT)
- `src/tenantDbManager.js` — Multi-tenant DB connection management
- `src/projectStore.js` — Project metadata persistence
- `src/configVault.js` — Encrypted config storage
- `src/requestCrypto.js` — Optional AES-256-GCM request body encryption
- `src/auditLogger.js` / `src/auditQuery.js` — Audit trail

**Middleware (`src/http/`):**
- `gatewayContext.js` — Parses project/env from request path
- `adminCommon.js` — Admin auth middleware
- `mountFrontendApp.js` — Serves frontend static files with history fallback

### Frontend (`frontend-app/`)

React 19 + Vite + TailwindCSS 4 + Ant Design 6. Base URL is `/`.

- `src/main.jsx` — Entry point
- `src/App.jsx` — Root with React Router (`/login` → `/app/*`)
- `src/pages/` — Login and app management pages
- `src/context/` — React context for state management
- `src/lib/` — Utilities

### Infrastructure

- `nginx/` — Nginx config templates
- `runtime/nginx/conf.d/` — Dynamically generated per-project Nginx configs
- `docker-compose.yml` — Multi-container orchestration
- `Dockerfile` — Gateway container
- `.github/workflows/` — CI/CD (dual image builds: gateway + nginx)

## Key Concepts

**Multi-tenancy:** Each project gets its own database and Nginx config. The gateway routes by `projectKey` + `env` in the URL path.

**SQL Security:** All SQL goes through AST parsing (`node-sql-parser`) before execution. Policies control allowed statement types, table access, and enforce LIMIT clauses.

**Platform DB:** `easydb_platform` stores gateway users, projects, environments, and variables. Initialized via `npm run auth:init` + `npm run platform:init`.

**Config:** Environment variables via `.env` (copy from `.env.example`). Sensitive config can be stored encrypted via `configVault.js`.
