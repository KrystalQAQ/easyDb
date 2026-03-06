const { apiRequest } = require("../client");

const definition = {
  name: "easydb_list_apis",
  description: "列出 EasyDB 项目环境下所有已定义的业务接口，可按分组筛选。",
  inputSchema: {
    type: "object",
    properties: {
      groupKey: { type: "string", description: "按分组筛选，为空则返回全部" },
    },
    required: [],
  },
};

async function handler({ groupKey }) {
  const projectKey = process.env.EASYDB_PROJECT;
  const env = process.env.EASYDB_ENV || "prod";

  if (!projectKey) throw new Error("缺少 EASYDB_PROJECT 环境变量");

  const qs = groupKey ? `?groupKey=${groupKey}` : "";
  return apiRequest("GET", `/api/platform/projects/${projectKey}/envs/${env}/apis${qs}`);
}

module.exports = { definition, handler };
