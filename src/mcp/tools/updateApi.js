const { apiRequest } = require("../client");

const definition = {
  name: "easydb_update_api",
  description: "更新 EasyDB 中已有的业务接口定义。只传需要修改的字段即可。",
  inputSchema: {
    type: "object",
    properties: {
      projectKey: { type: "string", description: "项目标识" },
      env: { type: "string", description: "环境标识，默认 prod", default: "prod" },
      apiKey: { type: "string", description: "要更新的接口标识" },
      name: { type: "string" },
      groupKey: { type: "string" },
      method: { type: "string", enum: ["GET", "POST", "PUT", "DELETE"] },
      path: { type: "string" },
      sqlTemplate: { type: "string" },
      sqlType: { type: "string", enum: ["select", "insert", "update", "delete"] },
      paramsSchema: { type: "array" },
      resultMapping: { type: "object" },
      cacheTTL: { type: "integer" },
      authMode: { type: "string", enum: ["token", "public"] },
      status: { type: "string", enum: ["active", "disabled"] },
    },
    required: ["projectKey", "apiKey"],
  },
};

async function handler({ projectKey, env = "prod", apiKey, ...body }) {
  const data = await apiRequest(
    "PUT",
    `/api/platform/projects/${projectKey}/envs/${env}/apis/${apiKey}`,
    body,
  );
  return data;
}

module.exports = { definition, handler };
