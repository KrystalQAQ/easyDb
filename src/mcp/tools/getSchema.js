const { apiRequest } = require("../client");

const definition = {
  name: "easydb_get_schema",
  description: "获取 EasyDB 项目环境的数据库表结构，包括表名、列定义、索引信息。在创建接口前调用此工具了解表结构。",
  inputSchema: {
    type: "object",
    properties: {
      projectKey: { type: "string", description: "项目标识，例如 crm" },
      env: { type: "string", description: "环境标识，默认 prod", default: "prod" },
      table: { type: "string", description: "指定表名，为空则返回所有表" },
    },
    required: ["projectKey"],
  },
};

async function handler({ projectKey, env = "prod", table }) {
  if (table) {
    const data = await apiRequest("GET", `/api/platform/projects/${projectKey}/envs/${env}/schema/${table}`);
    return data;
  }
  const data = await apiRequest("GET", `/api/platform/projects/${projectKey}/envs/${env}/schema`);
  return data;
}

module.exports = { definition, handler };
