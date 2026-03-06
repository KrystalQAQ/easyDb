const { apiRequest } = require("../client");

const definition = {
  name: "easydb_update_api",
  description: "更新 EasyDB 中已有的业务接口定义。只传需要修改的字段即可。",
  inputSchema: {
    type: "object",
    properties: {
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
    required: ["apiKey"],
  },
};

async function handler({ apiKey, ...body }) {
  const projectKey = process.env.EASYDB_PROJECT;
  const env = process.env.EASYDB_ENV || "prod";

  if (!projectKey) throw new Error("缺少 EASYDB_PROJECT 环境变量");

  return apiRequest("PUT", `/api/platform/projects/${projectKey}/envs/${env}/apis/${apiKey}`, body);
}

module.exports = { definition, handler };
