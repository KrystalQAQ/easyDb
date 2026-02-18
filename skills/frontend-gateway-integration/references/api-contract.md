# API Contract (Current Project)

## Auth

### `POST /api/auth/login`

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

### `GET /api/auth/me`

- Header: `Authorization: Bearer <jwt>`
- Success:
  ```json
  { "ok": true, "user": { "username": "admin", "role": "admin" } }
  ```

## SQL

### `POST /api/sql`

- Header: `Authorization: Bearer <jwt>`
- Plain request:
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

## Admin Audit

### `GET /api/admin/audit-logs`

- Header: `Authorization: Bearer <jwt>`
- Query: `limit,status,actor,role,sqlType,requestId,from,to`
- Success:
  ```json
  { "ok": true, "count": 10, "items": [] }
  ```

## Admin Users (requires `AUTH_PROVIDER=db`)

### Endpoints

- `GET /api/admin/users?limit=50&offset=0&status=active&role=analyst&keyword=ali`
- `GET /api/admin/users/:username`
- `POST /api/admin/users`
- `PATCH /api/admin/users/:username`
- `POST /api/admin/users/:username/reset-password`
- `POST /api/admin/users/:username/disable`
- `POST /api/admin/users/:username/enable`
- `DELETE /api/admin/users/:username`

### Payload examples

- Create:
  ```json
  { "username": "dev01", "password": "StrongPass123!", "role": "analyst", "status": "active" }
  ```
- Patch:
  ```json
  { "role": "admin", "status": "active" }
  ```
- Reset password:
  ```json
  { "newPassword": "NewPass123!" }
  ```

## Common failure statuses

- `400`: validation/decrypt/SQL payload errors
- `401`: missing/invalid token or bad credentials
- `403`: role forbidden (non-admin hitting admin API, disabled user, etc.)
- `409`: duplicate username
- `429`: rate limit hit
- `500`: backend internal error
