# Frontend Recipes

## 1) Build a unified gateway client

Use one request function for all endpoints:

```js
async function gatewayRequest(path, { method = "GET", body, token, baseUrl }) {
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

## 2) Optional encrypted payload wrapper

Backend decrypts AES-GCM payload with shared password-derived key.

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

## 3) Role-gated UI

- After login, save `{token, role}` in central auth store.
- Hide admin panels unless `role === "admin"`.
- On `403`, show clear message and keep current page stable.

## 4) UX conventions

- Show loading state per action button.
- Show backend `requestId` in error panel for support/debug.
- Keep plaintext/encrypted toggle in a visible location.
- For destructive admin actions, require confirm prompt.
