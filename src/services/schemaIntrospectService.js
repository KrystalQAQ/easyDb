/**
 * 数据库表结构自省服务 —— 查询租户数据库的 INFORMATION_SCHEMA
 * 获取表、列、索引信息，供管理后台和 MCP Tool 使用。
 */

async function getTableList(dbClient, dbName) {
  const [rows] = await dbClient.raw(
    `SELECT TABLE_NAME, TABLE_COMMENT, TABLE_ROWS
       FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME`,
    [dbName]
  );
  return rows.map((r) => ({
    name: r.TABLE_NAME,
    comment: r.TABLE_COMMENT || "",
    estimatedRows: r.TABLE_ROWS || 0,
  }));
}

async function getTableColumns(dbClient, dbName, tableName) {
  const [rows] = await dbClient.raw(
    `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT,
            COLUMN_KEY, EXTRA, COLUMN_COMMENT
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION`,
    [dbName, tableName]
  );
  return rows.map((r) => ({
    name: r.COLUMN_NAME,
    type: r.COLUMN_TYPE,
    nullable: r.IS_NULLABLE === "YES",
    defaultValue: r.COLUMN_DEFAULT,
    key: r.COLUMN_KEY || "",
    extra: r.EXTRA || "",
    comment: r.COLUMN_COMMENT || "",
  }));
}

async function getTableIndexes(dbClient, dbName, tableName) {
  const [rows] = await dbClient.raw(
    `SELECT INDEX_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columns,
            CASE WHEN NON_UNIQUE = 0 THEN 1 ELSE 0 END AS is_unique
       FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
      GROUP BY INDEX_NAME, NON_UNIQUE
      ORDER BY INDEX_NAME`,
    [dbName, tableName]
  );
  return rows.map((r) => ({
    name: r.INDEX_NAME,
    columns: (r.columns || "").split(","),
    unique: Boolean(r.is_unique),
  }));
}

async function getFullSchema(dbClient, dbName) {
  const tables = await getTableList(dbClient, dbName);
  const result = [];
  for (const t of tables) {
    const [columns, indexes] = await Promise.all([
      getTableColumns(dbClient, dbName, t.name),
      getTableIndexes(dbClient, dbName, t.name),
    ]);
    result.push({
      name: t.name,
      comment: t.comment,
      estimatedRows: t.estimatedRows,
      columns,
      indexes,
    });
  }
  return result;
}

async function getTableSchema(dbClient, dbName, tableName) {
  const [columns, indexes] = await Promise.all([
    getTableColumns(dbClient, dbName, tableName),
    getTableIndexes(dbClient, dbName, tableName),
  ]);
  if (columns.length === 0) return null;
  return { name: tableName, columns, indexes };
}

module.exports = {
  getTableList,
  getTableColumns,
  getTableIndexes,
  getFullSchema,
  getTableSchema,
};
