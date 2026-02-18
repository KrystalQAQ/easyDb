const crypto = require("crypto");
const { requestEncryption } = require("./config");

function normalizePayload(input) {
  if (typeof input === "string") {
    return JSON.parse(input);
  }
  return input;
}

function toBuffer(value, fieldName) {
  if (!value || typeof value !== "string") {
    throw new Error(`encryptedPayload.${fieldName} is required`);
  }
  return Buffer.from(value, "base64");
}

function deriveKey(password) {
  return crypto.createHash("sha256").update(password).digest();
}

function decryptPayload(encryptedPayload) {
  if (!requestEncryption.enabled) {
    throw new Error("request encryption is disabled");
  }

  const normalized = normalizePayload(encryptedPayload);
  if (!normalized || typeof normalized !== "object") {
    throw new Error("encryptedPayload format error");
  }

  const iv = toBuffer(normalized.iv, "iv");
  const tag = toBuffer(normalized.tag, "tag");
  const data = toBuffer(normalized.data, "data");

  const key = deriveKey(requestEncryption.password);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  const decryptedRaw = Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  const payload = JSON.parse(decryptedRaw);
  if (!payload || typeof payload !== "object") {
    throw new Error("decrypted payload format error");
  }
  return payload;
}

function readRequestPayload(body) {
  const requestBody = body || {};
  if (requestBody.encryptedPayload) {
    try {
      const payload = decryptPayload(requestBody.encryptedPayload);
      return { ok: true, payload, encrypted: true };
    } catch (err) {
      return { ok: false, error: `decrypt failed: ${err.message}` };
    }
  }

  if (requestEncryption.enabled && !requestEncryption.allowPlaintext) {
    return { ok: false, error: "encryptedPayload is required" };
  }

  return { ok: true, payload: requestBody, encrypted: false };
}

module.exports = {
  readRequestPayload,
};
