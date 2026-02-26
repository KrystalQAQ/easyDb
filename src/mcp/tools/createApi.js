const { apiRequest } = require("../client");

const definition = {
  name: "easydb_create_api",
  description: "在 EasyDB 项目环境中创建一个新的业务接口。建议先调用 easydb_get_schema 了解表结构，再调用 easydb_list_apis 确认接口不重复。",
  inputSchema: {
    type: "object",
    properties: {
      projectKey: { type: "string", description: "项目标识" },
      env: { type: "string", description: "环境标识，默认 prod", default: "prod" },
      apiKey: { type: "string", description: "接口唯一标识，小写字母开头，允许字母数字下划线连字符，例如 get-user-orders" },
      name: { type: "string", description: "接口名称，人类可读，例如 查询用户订单" },
      groupKey: { type: "string", description: "所属分组标识（可选）" },
      method: { type: "string", enum: ["GET", "POST", "PUT", "DELETE"], description: "HTTP 方法，默认 POST" },
      path: { type: "string", description: "自定义路径（可选），例如 /orders" },
      sqlTemplate: { type: "string", description: "SQL 模板，使用 :paramName 命名参数，例如 SELECT * FROM orders WHERE user_id = :userId LIMIT :limit" },
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
            default: { description: "默认值" },
            description: { type: "string" },
            min: { type: "number" },
            max: { type: "number" },
            enum: { type: "array" },
          },
          required: ["name", "type"],
        },
      },
      resultMapping: {
        type: "object",
        description: "结果映射配置，例如 { type: 'list' } 或 { type: 'single' }",
      },
      cacheTTL: { type: "integer", description: "缓存秒数，0 表示不缓存，默认 0" },
      authMode: { type: "string", enum: ["token", "public"], description: "鉴权模式，默认 token" },
    },
    required: ["projectKey", "apiKey", "name", "sqlTemplate", "sqlType"],
  },
};

async function handler({ projectKey, env = "prod", ...body }) {
  const data = await apiRequest("POST", `/api/platform/projects/${projectKey}/envs/${env}/apis`, {
    method: "POST",
    authMode: "token",
    cacheTTL: 0,
    ...body,
  });
  return data;
}

module.exports = { definition, handler };
