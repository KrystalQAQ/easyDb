const fs = require("fs/promises");
const { auditLogFile } = require("./config");

function parseLine(line) {
  if (!line || !line.trim()) return null;
  try {
    return JSON.parse(line);
  } catch (_err) {
    return null;
  }
}

function toIsoOrNull(value) {
  if (!value) return null;
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) return null;
  return time.toISOString();
}

function recordMatches(record, filters) {
  if (!record) return false;
  if (filters.status && record.status !== filters.status) return false;
  if (filters.actor && record.actor !== filters.actor) return false;
  if (filters.role && record.role !== filters.role) return false;
  if (filters.sqlType && record.sqlType !== filters.sqlType) return false;
  if (filters.requestId && record.requestId !== filters.requestId) return false;

  if (filters.fromIso && record.timestamp && record.timestamp < filters.fromIso) return false;
  if (filters.toIso && record.timestamp && record.timestamp > filters.toIso) return false;

  return true;
}

async function queryAuditLogs(options = {}) {
  const limit = options.limit || 100;
  const filters = {
    status: options.status || "",
    actor: options.actor || "",
    role: options.role || "",
    sqlType: options.sqlType || "",
    requestId: options.requestId || "",
    fromIso: toIsoOrNull(options.from),
    toIso: toIsoOrNull(options.to),
  };

  let raw = "";
  try {
    raw = await fs.readFile(auditLogFile, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") {
      return [];
    }
    throw err;
  }

  const lines = raw.split(/\r?\n/).filter(Boolean);
  const results = [];
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const parsed = parseLine(lines[i]);
    if (!recordMatches(parsed, filters)) continue;
    results.push(parsed);
    if (results.length >= limit) break;
  }

  return results;
}

module.exports = {
  queryAuditLogs,
};
