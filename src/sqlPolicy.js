const { Parser } = require("node-sql-parser");
const {
  allowedSqlTypes,
  allowedTables,
  roleTableMap,
  requireSelectLimit,
  maxSelectLimit,
} = require("./config");

const parser = new Parser();

function parseRoleTableRules(roleTables) {
  if (!roleTables) return new Map();
  if (roleTables instanceof Map) return roleTables;

  const roleMap = new Map();
  for (const [roleName, rule] of Object.entries(roleTables)) {
    const normalizedRole = String(roleName || "").trim().toLowerCase();
    if (!normalizedRole) continue;

    if (rule === "*") {
      roleMap.set(normalizedRole, { allowAllTables: true, tables: new Set() });
      continue;
    }

    const sourceList = Array.isArray(rule)
      ? rule
      : typeof rule === "string"
        ? rule.split("|")
        : Array.isArray(rule?.tables)
          ? rule.tables
          : [];

    const tableSet = new Set(
      sourceList.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean)
    );
    roleMap.set(normalizedRole, { allowAllTables: false, tables: tableSet });
  }

  return roleMap;
}

function extractLimit(sql) {
  const lower = sql.toLowerCase();
  const match = lower.match(/\blimit\s+(\d+)(\s*,\s*(\d+))?\b/);
  if (!match) return null;
  if (match[3]) return Number(match[3]);
  return Number(match[1]);
}

function normalizeTable(tableToken) {
  if (!tableToken) return "";
  const parts = String(tableToken).split("::");
  const table = parts[2] || "";
  return table.toLowerCase();
}

function extractTables(sql) {
  try {
    return parser
      .tableList(sql, { database: "MySQL" })
      .map(normalizeTable)
      .filter(Boolean);
  } catch (_err) {
    return [];
  }
}

function validateSqlWithPolicy(sql, context = {}, policy = {}) {
  const policyAllowedSqlTypes = policy.allowedSqlTypes instanceof Set
    ? policy.allowedSqlTypes
    : new Set(
        (Array.isArray(policy.allowedSqlTypes) ? policy.allowedSqlTypes : [])
          .map((item) => String(item || "").trim().toLowerCase())
          .filter(Boolean)
      );

  const policyAllowedTables = policy.allowedTables instanceof Set
    ? policy.allowedTables
    : new Set(
        (Array.isArray(policy.allowedTables) ? policy.allowedTables : [])
          .map((item) => String(item || "").trim().toLowerCase())
          .filter(Boolean)
      );

  const policyRoleTableMap = parseRoleTableRules(policy.roleTables || new Map());
  const policyRequireSelectLimit =
    policy.requireSelectLimit === undefined ? true : Boolean(policy.requireSelectLimit);
  const policyMaxSelectLimit = Number.isFinite(Number(policy.maxSelectLimit))
    ? Number(policy.maxSelectLimit)
    : 500;

  if (typeof sql !== "string" || !sql.trim()) {
    return { ok: false, message: "sql 不能为空" };
  }

  let ast;
  try {
    ast = parser.astify(sql, { database: "MySQL" });
  } catch (err) {
    return { ok: false, message: `SQL 语法错误: ${err.message}` };
  }

  if (Array.isArray(ast)) {
    return { ok: false, message: "不允许一次执行多条 SQL" };
  }

  const sqlType = (ast.type || "").toLowerCase();
  if (!policyAllowedSqlTypes.has(sqlType)) {
    return { ok: false, message: `不允许的 SQL 类型: ${sqlType}` };
  }

  const tables = extractTables(sql);

  if (policyAllowedTables.size > 0) {
    const forbidden = tables.filter((t) => !policyAllowedTables.has(t));
    if (forbidden.length > 0) {
      return { ok: false, message: `表未授权: ${forbidden.join(", ")}` };
    }
  }

  const role = String(context.role || "").toLowerCase();
  if (role) {
    const roleRule = policyRoleTableMap.get(role);
    if (!roleRule) {
      return { ok: false, message: `角色未配置权限: ${role}` };
    }
    if (!roleRule.allowAllTables) {
      const forbiddenByRole = tables.filter((t) => !roleRule.tables.has(t));
      if (forbiddenByRole.length > 0) {
        return { ok: false, message: `角色 ${role} 无权访问表: ${forbiddenByRole.join(", ")}` };
      }
    }
  }

  if (sqlType === "select" && policyRequireSelectLimit) {
    const limit = extractLimit(sql);
    if (limit === null) {
      return { ok: false, message: "SELECT 必须带 LIMIT" };
    }
    if (limit > policyMaxSelectLimit) {
      return { ok: false, message: `LIMIT 不能超过 ${policyMaxSelectLimit}` };
    }
  }

  return { ok: true, sqlType, tables };
}

function validateSql(sql, context = {}) {
  return validateSqlWithPolicy(sql, context, {
    allowedSqlTypes,
    allowedTables,
    roleTables: roleTableMap,
    requireSelectLimit,
    maxSelectLimit,
  });
}

module.exports = {
  validateSql,
  validateSqlWithPolicy,
  parseRoleTableRules,
};
