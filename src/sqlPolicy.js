const { Parser } = require("node-sql-parser");
const {
  allowedSqlTypes,
  allowedTables,
  roleTableMap,
  requireSelectLimit,
  maxSelectLimit,
} = require("./config");

const parser = new Parser();

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

function validateSql(sql, context = {}) {
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
  if (!allowedSqlTypes.has(sqlType)) {
    return { ok: false, message: `不允许的 SQL 类型: ${sqlType}` };
  }

  const tables = extractTables(sql);

  if (allowedTables.size > 0) {
    const forbidden = tables.filter((t) => !allowedTables.has(t));
    if (forbidden.length > 0) {
      return { ok: false, message: `表未授权: ${forbidden.join(", ")}` };
    }
  }

  const role = String(context.role || "").toLowerCase();
  if (role) {
    const roleRule = roleTableMap.get(role);
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

  if (sqlType === "select" && requireSelectLimit) {
    const limit = extractLimit(sql);
    if (limit === null) {
      return { ok: false, message: "SELECT 必须带 LIMIT" };
    }
    if (limit > maxSelectLimit) {
      return { ok: false, message: `LIMIT 不能超过 ${maxSelectLimit}` };
    }
  }

  return { ok: true, sqlType, tables };
}

module.exports = {
  validateSql,
};
