const { apiRequest } = require("../client");

const definition = {
  name: "easydb_get_schema",
  description: "获取 EasyDB 项目环境的数据库表结构（表名、列定义、索引）。创建接口前先调用此工具了解表结构。",
  inputSchema: {
    type: "object",
    properties: {
      projectKey: { type: "string", description: "项目标识，例如 crm" },
      env: { type: "string", description: "环境标识，默认 prod" },
      table: { type: "string", description: "指定表名，为空则返回所有表" },
    },
    required: ["projectKey"],
  },
};

async function handler({ projectKey, env = "prod", table }) {
  const path = table
    ? `/api/platform/projects/${projectKey}/envs/${env}/schema/${table}`
    : `/api/platform/projects/${projectKey}/envs/${env}/schema`;
  return apiRequest("GET", path);
}

module.exports = { definition, handler };
