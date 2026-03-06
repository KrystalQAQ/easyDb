const { apiRequest } = require("../client");

const definition = {
  name: "easydb_get_schema",
  description: "获取 EasyDB 项目环境的数据库表结构（表名、列定义、索引）。创建接口前先调用此工具了解表结构。",
  inputSchema: {
    type: "object",
    properties: {
      table: { type: "string", description: "指定表名，为空则返回所有表" },
    },
    required: [],
  },
};

async function handler({ table }) {
  const projectKey = process.env.EASYDB_PROJECT;
  const env = process.env.EASYDB_ENV || "prod";

  if (!projectKey) throw new Error("缺少 EASYDB_PROJECT 环境变量");

  const path = table
    ? `/api/platform/projects/${projectKey}/envs/${env}/schema/${table}`
    : `/api/platform/projects/${projectKey}/envs/${env}/schema`;
  return apiRequest("GET", path);
}

module.exports = { definition, handler };
