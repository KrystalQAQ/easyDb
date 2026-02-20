const crypto = require("crypto");
const { platform } = require("./config");

const ENCRYPTION_PREFIX = "enc:v1";

function deriveKey() {
  const source = String(platform.configEncryptionKey || "").trim();
  if (!source) {
    throw new Error("CONFIG_ENCRYPTION_KEY is required for secret management");
  }
  return crypto.createHash("sha256").update(source).digest();
}

function isEncryptedValue(value) {
  return typeof value === "string" && value.startsWith(`${ENCRYPTION_PREFIX}:`);
}

function encryptSecret(plainText) {
  const raw = String(plainText ?? "");
  const iv = crypto.randomBytes(12);
  const key = deriveKey();
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
  const key = deriveKey();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

module.exports = {
  encryptSecret,
  decryptSecret,
  isEncryptedValue,
};
