---
name: frontend-gateway-integration
description: Integrate frontend apps with this repository's SQL Gateway API. Use when users ask to build or update frontend code for login, token management, SQL execution, admin user management, audit log views, encrypted request payloads, or troubleshooting CORS/CSP/auth issues against /api/auth/*, /api/sql, and /api/admin/* endpoints.
---

# Frontend Gateway Integration

Use this skill to implement frontend-to-backend integration for this project quickly and consistently.

## Quick Workflow

1. Read `references/api-contract.md` before changing frontend request logic.
2. Read `references/frontend-recipes.md` when generating service-layer code, auth state, or admin panels.
3. Confirm current API base URL and port from project env values before wiring frontend defaults.
4. Implement or update a centralized HTTP client:
   - Attach `Authorization: Bearer <token>` when token exists.
   - Support plaintext mode and `encryptedPayload` mode.
   - Normalize backend errors (`{ ok:false, error, requestId? }`) into user-facing messages.
5. Implement feature flows in this order:
   - auth (`/api/auth/login`, `/api/auth/me`, logout)
   - SQL runner (`/api/sql`)
   - admin audit logs (`/api/admin/audit-logs`)
   - admin users (`/api/admin/users*`)
6. Gate admin UI by role from JWT/me response (`role === "admin"`).
7. Preserve CSP compatibility:
   - Prefer external JS/CSS files.
   - Avoid inline scripts/styles unless nonce/hash is configured.

## Integration Rules

- Keep request format consistent:
  - Plaintext body: `{...}`
  - Encrypted body: `{ encryptedPayload: { v, iv, data, tag } }`
- Use JSON array for SQL params; reject non-array locally before request.
- Persist token in one place and provide a single logout path.
- Show backend `requestId` in error UI when available.
- For admin user mutations, protect destructive actions with a confirm dialog.

## Delivery Checklist

- Update or add API client module.
- Update UI forms/pages for auth, SQL, audit, and user management as needed.
- Verify role-based button visibility (admin-only operations hidden for non-admin).
- Verify encrypted mode toggle and shared password input behavior.
- Verify CSP-safe script loading (no inline JS in strict CSP pages).
