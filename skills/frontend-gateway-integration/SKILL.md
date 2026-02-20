---
name: frontend-gateway-integration
description: Integrate frontend apps with this repository's multi-project SQL Gateway. Use when users need login/token flows, project-prefixed routing, SQL execution, platform project/env/variable management UI, admin user management, audit log pages, encrypted payload handling, or CORS/CSP/auth troubleshooting across /api/gw/:projectKey/:env/*, /api/platform/*, /api/admin/*, and legacy /api/* endpoints.
---

# Frontend Gateway Integration

Implement frontend-to-backend integration for the current multi-project gateway architecture.

## Quick Workflow

1. Read `references/api-contract.md` before changing frontend request logic.
2. Read `references/frontend-recipes.md` before writing service-layer code or auth/project state management.
3. Decide route mode first:
   - project-prefixed mode: `/api/gw/:projectKey/:env/*` (preferred)
   - legacy mode: `/api/*` (compatibility only)
4. Implement or update a centralized HTTP client:
   - Attach `Authorization: Bearer <token>` when token exists.
   - Login once via `/api/auth/login`; token is global and reused across projects.
   - Support plaintext and `encryptedPayload` modes.
   - Normalize backend errors (`{ ok:false, error, requestId? }`) into user-facing messages.
5. Implement feature flows in this order:
   - global auth (`/api/auth/login`, `/api/auth/me`)
   - project-prefixed SQL (`/api/gw/:projectKey/:env/sql`)
   - platform project/env/vars (`/api/platform/*`) for admin console
   - admin audit/users (`/api/admin/*`)
6. Gate admin UI by `role === "admin"`, and block SQL button when project/env is not selected.
7. Preserve CSP compatibility:
   - Prefer external JS/CSS files.
   - Avoid inline scripts/styles unless nonce/hash is configured.

## Integration Rules

- Keep request format consistent:
  - Plaintext body: `{...}`
  - Encrypted body: `{ encryptedPayload: { v, iv, data, tag } }`
- Token does not need to be reset when switching project/env.
- Use JSON array for SQL params; reject non-array locally before request.
- Persist auth state in one place and provide a single logout path.
- Show backend `requestId` in error UI when available.
- For admin user mutations, protect destructive actions with a confirm dialog.

## Delivery Checklist

- Update or add API client module.
- Update UI forms/pages for auth, SQL, platform config, audit, and user management as needed.
- Verify role-based button visibility (admin-only operations hidden for non-admin).
- Verify project/env switching flow does not invalidate token.
- Verify encrypted mode toggle and shared password input behavior.
- Verify CSP-safe script loading (no inline JS in strict CSP pages).
