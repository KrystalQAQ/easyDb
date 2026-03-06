const { apiRequest } = require("../client");

const definition = {
  name: "easydb_test_api",
  description: "使用测试参数执行 EasyDB 业务接口并返回结果，用于验证接口是否正常工作。不计入生产审计日志。",
  inputSchema: {
    type: "object",
    properties: {
      apiKey: { type: "string", description: "要测试的接口标识" },
      params: { type: "object", description: "测试参数，例如 { userId: 1, limit: 5 }" },
    },
    required: ["apiKey"],
  },
};

async function handler({ apiKey, params = {} }) {
  const projectKey = process.env.EASYDB_PROJECT;
  const env = process.env.EASYDB_ENV || "prod";

  if (!projectKey) throw new Error("缺少 EASYDB_PROJECT 环境变量");

  return apiRequest(
    "POST",
    `/api/platform/projects/${projectKey}/envs/${env}/apis/${apiKey}/test`,
    { params },
  );
}

module.exports = { definition, handler };
