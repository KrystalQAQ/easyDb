const crypto = require("crypto");
const { authCode } = require("./config");

type AuthCodePayload = {
  token: string;
  user: any;
  client: string;
  redirectOrigin: string;
  expiresAt: number;
};

const codeStore = new Map<string, AuthCodePayload>();

function nowMs() {
  return Date.now();
}

function clearExpiredCodes(now = nowMs()) {
  for (const [code, payload] of codeStore.entries()) {
    if (!payload || payload.expiresAt <= now) {
      codeStore.delete(code);
    }
  }
}

function parseRedirectUrl(value) {
  let parsed;
  try {
    parsed = new URL(String(value || "").trim());
  } catch (_err) {
    throw new Error("redirect 必须是完整 URL");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("redirect 仅支持 http/https");
  }
  return parsed;
}

function isAllowedRedirectOrigin(origin) {
  const rules = authCode.allowedRedirectOrigins || [];
  if (!rules.length) return false;
  return rules.some((rule) => {
    const normalized = String(rule || "").trim();
    if (!normalized) return false;
    if (normalized === "*") return true;
    return normalized.toLowerCase() === origin.toLowerCase();
  });
}

function assertAllowedRedirectOrThrow(redirectUrl) {
  if (!authCode.enabled) {
    throw new Error("授权码登录未启用");
  }
  const parsed = parseRedirectUrl(redirectUrl);
  if (!isAllowedRedirectOrigin(parsed.origin)) {
    throw new Error("redirect 不在允许列表中");
  }
  return parsed;
}

function buildAuthorizeRedirectUrl(redirectUrl: string, { code, state = "" }: { code: string; state?: string }) {
  const parsed = parseRedirectUrl(redirectUrl);
  parsed.searchParams.set("code", code);
  if (state) {
    parsed.searchParams.set("state", state);
  }
  return parsed.toString();
}

function issueAuthCode({
  token,
  user,
  client = "",
  redirect,
  state = "",
}: {
  token: string;
  user: any;
  client?: string;
  redirect: string;
  state?: string;
}) {
  const parsedRedirect = assertAllowedRedirectOrThrow(redirect);
  clearExpiredCodes();
  if (codeStore.size >= authCode.maxStoreSize) {
    clearExpiredCodes();
  }
  if (codeStore.size >= authCode.maxStoreSize) {
    throw new Error("授权码存储已满，请稍后重试");
  }

  const code = `ac_${crypto.randomBytes(24).toString("base64url")}`;
  const expiresAt = nowMs() + authCode.ttlSeconds * 1000;
  codeStore.set(code, {
    token,
    user,
    client: String(client || "").trim(),
    redirectOrigin: parsedRedirect.origin,
    expiresAt,
  });
  return {
    code,
    expiresAt,
  };
}

function consumeAuthCode(code: string, options: { client?: string } = {}) {
  clearExpiredCodes();
  const normalized = String(code || "").trim();
  if (!normalized) {
    throw new Error("code 不能为空");
  }

  const payload = codeStore.get(normalized);
  if (!payload) {
    throw new Error("code 无效或已过期");
  }
  codeStore.delete(normalized);

  const expectedClient = String(options.client || "").trim();
  if (expectedClient && payload.client && expectedClient !== payload.client) {
    throw new Error("code 与 client 不匹配");
  }

  return payload;
}

module.exports = {
  assertAllowedRedirectOrThrow,
  buildAuthorizeRedirectUrl,
  consumeAuthCode,
  issueAuthCode,
};

export {};
