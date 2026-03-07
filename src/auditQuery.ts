const fs = require("fs/promises");
const { auditLogFile } = require("./config");

type AuditRecord = Record<string, any>;

type AuditQueryOptions = {
  limit?: number;
  status?: string;
  actor?: string;
  role?: string;
  sqlType?: string;
  requestId?: string;
  from?: string;
  to?: string;
};

function parseLine(line: string): AuditRecord | null {
  if (!line || !line.trim()) return null;
  try {
    return JSON.parse(line) as AuditRecord;
  } catch (_err) {
    return null;
  }
}

function toIsoOrNull(value: unknown): string | null {
  if (!value) return null;
  const time = new Date(value as any);
  if (Number.isNaN(time.getTime())) return null;
  return time.toISOString();
}

function recordMatches(record: AuditRecord | null, filters: AuditRecord): boolean {
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

async function queryAuditLogs(options: AuditQueryOptions = {}): Promise<AuditRecord[]> {
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
  } catch (err: any) {
    if (err.code === "ENOENT") {
      return [];
    }
    throw err;
  }

  const lines = raw.split(/\r?\n/).filter(Boolean);
  const results: AuditRecord[] = [];
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

export {};
