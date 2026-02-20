# Frontend Recipes (Project-Prefixed Gateway)

## 1) Build one gateway client with project context

```js
function makeGatewayPath(context, path) {
  return `/api/gw/${context.projectKey}/${context.env}${path}`;
}

async function gatewayRequest(path, { method = "GET", body, token, baseUrl = "" }) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    const err = new Error(data.error || res.statusText || "request failed");
    err.requestId = data.requestId;
    throw err;
  }
  return data;
}
```

## 2) Keep auth state global, context local

Store this in one place:

```json
{
  "token": "<jwt>",
  "user": { "username": "admin", "role": "admin" },
  "context": { "projectKey": "crm", "env": "prod" }
}
```

Rules:
- login once with `/api/auth/login`
- if `projectKey/env` changes, keep token and only update context

## 3) Optional encrypted payload wrapper

```js
async function wrapEncryptedPayload(payload, sharedPassword, enabled) {
  if (!enabled) return payload;

  const raw = new TextEncoder().encode(sharedPassword);
  const hash = await crypto.subtle.digest("SHA-256", raw);
  const key = await crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(payload));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain));

  const tagLen = 16;
  const data = btoa(String.fromCharCode(...encrypted.slice(0, encrypted.length - tagLen)));
  const tag = btoa(String.fromCharCode(...encrypted.slice(encrypted.length - tagLen)));
  const ivB64 = btoa(String.fromCharCode(...iv));

  return { encryptedPayload: { v: 1, iv: ivB64, data, tag } };
}
```

## 4) Feature wiring order

1. Context selector (`projectKey`, `env`)
2. Global login and me (`/api/auth/*`)
3. Project-prefixed SQL runner (`/api/gw/:projectKey/:env/sql`)
4. Admin audit/users
5. Platform management pages (`/api/platform/*`)

## 5) Vite + Router baseline

- Recommended stack: Vite + React Router + TailwindCSS + Ant Design.
- Use `/demo` as router basename when backend serves static files under `/demo/*`.
- Keep a single auth guard: unauthenticated users always redirect to `/demo/login`.
- Keep API base configurable in UI, but default to `http://localhost:3000`.

## 6) UX and error conventions

- show `requestId` in error toast/panel
- hide admin actions unless `role === "admin"`
- for destructive admin actions, require confirm dialog
- keep strict CSP compatibility: avoid inline JS/CSS
