const crypto = require("crypto");
const { platform } = require("./config");

const ENCRYPTION_PREFIX = "enc:v1";

function deriveKeyFromSecret(secret: string): Buffer {
  return crypto.createHash("sha256").update(secret).digest();
}

/**
 * 兼容历史密钥来源：
 * 1) 当前平台密钥 CONFIG_ENCRYPTION_KEY
 * 2) 旧版本可能直接使用 JWT_SECRET
 * 3) 极早期默认值（仅用于解密回退，不用于新加密）
 */
function getCandidateSecrets(): string[] {
  const candidates = [
    String(platform.configEncryptionKey || "").trim(),
    String(process.env.CONFIG_ENCRYPTION_KEY || "").trim(),
    String(process.env.JWT_SECRET || "").trim(),
    "change-this-secret-in-production",
  ].filter(Boolean);
  return Array.from(new Set(candidates));
}

function derivePrimaryKey(): Buffer {
  const source = String(platform.configEncryptionKey || process.env.CONFIG_ENCRYPTION_KEY || "").trim();
  if (!source) {
    throw new Error("CONFIG_ENCRYPTION_KEY is required for secret management");
  }
  return deriveKeyFromSecret(source);
}

function isEncryptedValue(value) {
  return typeof value === "string" && value.startsWith(`${ENCRYPTION_PREFIX}:`);
}

function encryptSecret(plainText) {
  const raw = String(plainText ?? "");
  const iv = crypto.randomBytes(12);
  const key = derivePrimaryKey();
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(raw, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENCRYPTION_PREFIX}:${iv.toString("base64")}:${tag.toString("base64")}:${data.toString("base64")}`;
}

function decryptSecret(payload) {
  if (!isEncryptedValue(payload)) return String(payload ?? "");

  const segments = String(payload).split(":");
  if (segments.length !== 5) {
    throw new Error("invalid encrypted payload format");
  }

  const iv = Buffer.from(segments[2], "base64");
  const tag = Buffer.from(segments[3], "base64");
  const data = Buffer.from(segments[4], "base64");
  let lastError: unknown = null;
  for (const secret of getCandidateSecrets()) {
    try {
      const key = deriveKeyFromSecret(secret);
      const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
    } catch (err: unknown) {
      lastError = err;
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error("failed to decrypt secret");
}

module.exports = {
  encryptSecret,
  decryptSecret,
  isEncryptedValue,
};

export {};
