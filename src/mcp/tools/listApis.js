const { apiRequest } = require("../client");

const definition = {
  name: "easydb_list_apis",
  description: "列出 EasyDB 项目环境下所有已定义的业务接口，可按分组筛选。",
  inputSchema: {
    type: "object",
    properties: {
      projectKey: { type: "string", description: "项目标识" },
      env: { type: "string", description: "环境标识，默认 prod", default: "prod" },
      groupKey: { type: "string", description: "按分组筛选，为空则返回全部" },
    },
    required: ["projectKey"],
  },
};

async function handler({ projectKey, env = "prod", groupKey }) {
  const qs = groupKey ? `?groupKey=${groupKey}` : "";
  const data = await apiRequest("GET", `/api/platform/projects/${projectKey}/envs/${env}/apis${qs}`);
  return data;
}

module.exports = { definition, handler };
