const fs = require("fs/promises");
const path = require("path");
const { auditLogFile } = require("./config");

async function ensureAuditDir() {
  const dir = path.dirname(auditLogFile);
  await fs.mkdir(dir, { recursive: true });
}

async function writeAuditLog(payload) {
  const record = {
    timestamp: new Date().toISOString(),
    ...payload,
  };

  try {
    await ensureAuditDir();
    await fs.appendFile(auditLogFile, `${JSON.stringify(record)}\n`, "utf8");
  } catch (err) {
    console.error("audit log write failed:", err.message);
  }
}

module.exports = {
  writeAuditLog,
};
