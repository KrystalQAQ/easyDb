# API Contract (Multi-Project Gateway)

## 1) Project-Prefixed Gateway APIs (preferred)

All gateway APIs use project+environment prefix:

- `/api/gw/:projectKey/:env/auth/login` (deprecated, returns 410)
- `/api/gw/:projectKey/:env/auth/me`
- `/api/gw/:projectKey/:env/sql`
- `/api/gw/:projectKey/:env/health`

### `POST /api/gw/:projectKey/:env/auth/login`

- Plain request:
  ```json
  { "username": "admin", "password": "admin123" }
  ```
- Encrypted request:
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
- Success:
  ```json
  {
    "ok": true,
    "token": "<jwt>",
    "user": { "username": "admin", "role": "admin" },
    "expiresIn": "8h",
    "encryptedRequest": true
  }
  ```

### `GET /api/gw/:projectKey/:env/auth/me`

- Header: `Authorization: Bearer <jwt>`
- Success:
  ```json
  {
    "ok": true,
    "user": { "username": "admin", "role": "admin", "projectKey": "default", "env": "prod" },
    "scope": { "projectKey": "default", "env": "prod" }
  }
  ```

### `POST /api/gw/:projectKey/:env/sql`

- Header: `Authorization: Bearer <jwt>`
- Request:
  ```json
  {
    "sql": "select id,name from users where id > ? limit 20",
    "params": [100]
  }
  ```
- Success (select):
  ```json
  {
    "ok": true,
    "requestId": "<uuid>",
    "type": "select",
    "rowCount": 2,
    "data": [{ "id": 101, "name": "Tom" }]
  }
  ```
- Error:
  ```json
  { "ok": false, "error": "message", "requestId": "<uuid>" }
  ```

Notes:
- Use global `/api/auth/login` token for project-prefixed SQL requests.
- SQL path still isolates project/environment data.

## 2) Platform APIs (admin only)

- `GET  /api/platform/projects`
- `POST /api/platform/projects`
- `DELETE /api/platform/projects/:projectKey`
- `GET  /api/platform/projects/:projectKey/envs`
- `PUT  /api/platform/projects/:projectKey/envs/:env`
- `GET  /api/platform/projects/:projectKey/envs/:env/vars?includeSecret=true`
- `PUT  /api/platform/projects/:projectKey/envs/:env/vars/:varKey`

`POST /api/platform/projects` success now may include auto-provision result:

```json
{
  "ok": true,
  "item": { "projectKey": "crm", "name": "CRM", "status": "active" },
  "defaultEnv": {
    "created": true,
    "databaseCreated": true,
    "initializedTables": ["users", "orders", "products"],
    "env": "prod",
    "db": { "host": "127.0.0.1", "port": 3306, "user": "root", "database": "crm_prod" }
  }
}
```

Notes:
- `defaultEnv` appears when `PLATFORM_AUTO_CREATE_DEFAULT_ENV=true`.
- `databaseCreated` depends on `PLATFORM_AUTO_CREATE_DATABASE`.

`PUT /api/platform/projects/:projectKey/envs/:env` example:

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
    "allowedSqlTypes": ["select", "insert", "update", "delete"],
    "allowedTables": ["users", "orders"],
    "roleTables": {
      "admin": "*",
      "analyst": ["users", "orders"]
    },
    "requireSelectLimit": true,
    "maxSelectLimit": 500
  },
  "requestEncryptionPassword": "shared-password"
}
```

`PUT /api/platform/projects/:projectKey/envs/:env/vars/:varKey` example:

```json
{
  "value": "https://api.example.com",
  "isSecret": false
}
```

## 3) Admin APIs (admin only)

- Audit logs: `GET /api/admin/audit-logs`
- User management:
  - `GET /api/admin/users`
  - `GET /api/admin/users/:username`
  - `POST /api/admin/users`
  - `PATCH /api/admin/users/:username`
  - `POST /api/admin/users/:username/reset-password`
  - `POST /api/admin/users/:username/disable`
  - `POST /api/admin/users/:username/enable`
  - `DELETE /api/admin/users/:username`

## 4) Legacy Compatibility APIs

- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/sql`
- `GET /api/health`

Use legacy APIs only when old clients cannot switch to project-prefixed routes yet.

## 5) Common failure statuses

- `400`: validation/decrypt/SQL payload errors
- `401`: missing/invalid token or bad credentials
- `403`: role forbidden (admin only) or project disabled
- `404`: missing project/env or user
- `409`: duplicate username/project
- `429`: rate limit hit
- `500`: backend internal error
