const { apiRequest } = require("../client");

const definition = {
  name: "easydb_test_api",
  description: "使用测试参数执行 EasyDB 业务接口并返回结果，用于验证接口是否正常工作。不计入生产审计日志。",
  inputSchema: {
    type: "object",
    properties: {
      projectKey: { type: "string", description: "项目标识" },
      env: { type: "string", description: "环境标识，默认 prod" },
      apiKey: { type: "string", description: "要测试的接口标识" },
      params: { type: "object", description: "测试参数，例如 { userId: 1, limit: 5 }" },
    },
    required: ["projectKey", "apiKey"],
  },
};

async function handler({ projectKey, env = "prod", apiKey, params = {} }) {
  return apiRequest(
    "POST",
    `/api/platform/projects/${projectKey}/envs/${env}/apis/${apiKey}/test`,
    { params },
  );
}

module.exports = { definition, handler };
