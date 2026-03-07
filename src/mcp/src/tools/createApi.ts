const { apiRequest } = require("../client");

const definition = {
  name: "easydb_create_api",
  description: "在 EasyDB 项目环境中创建一个新的业务接口。建议先调用 easydb_get_schema 了解表结构，再调用 easydb_list_apis 确认接口不重复。",
  inputSchema: {
    type: "object",
    properties: {
      apiKey: { type: "string", description: "接口唯一标识，如 get-user-list" },
      name: { type: "string", description: "接口名称，如 获取用户列表" },
      groupKey: { type: "string", description: "所属分组标识（可选）" },
      method: { type: "string", enum: ["GET", "POST", "PUT", "DELETE"], description: "HTTP 方法，默认 POST" },
      path: { type: "string", description: "自定义路径（可选）" },
      sqlTemplate: { type: "string", description: "SQL 模板，使用 :paramName 命名参数" },
      sqlType: { type: "string", enum: ["select", "insert", "update", "delete"], description: "SQL 类型，必须与模板一致" },
      paramsSchema: {
        type: "array",
        description: "参数定义数组",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            type: { type: "string", enum: ["string", "integer", "number", "boolean", "datetime"] },
            required: { type: "boolean" },
            default: {},
            description: { type: "string" },
            min: { type: "number" },
            max: { type: "number" },
            enum: { type: "array" },
          },
          required: ["name", "type"],
        },
      },
      resultMapping: { type: "object", description: "结果映射，例如 { type: 'list' } 或 { type: 'single' }" },
      cacheTTL: { type: "integer", description: "缓存秒数，0 表示不缓存" },
      authMode: { type: "string", enum: ["token", "public"], description: "鉴权模式，默认 token" },
    },
    required: ["apiKey", "name", "sqlTemplate", "sqlType"],
  },
};

async function handler(body) {
  const projectKey = process.env.EASYDB_PROJECT;
  const env = process.env.EASYDB_ENV || "prod";

  if (!projectKey) throw new Error("缺少 EASYDB_PROJECT 环境变量");

  return apiRequest("POST", `/api/v2/projects/${projectKey}/envs/${env}/apis`, {
    method: "POST",
    authMode: "token",
    cacheTTL: 0,
    ...body,
  });
}

module.exports = { definition, handler };

export {};
