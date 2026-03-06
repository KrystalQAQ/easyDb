#!/usr/bin/env node
/**
 * EasyDB MCP Server
 *
 * 用法：
 *   npx easydb-mcp
 *
 * 必须设置环境变量：
 *   EASYDB_API_KEY   — 在 EasyDB 管理后台「接口中心 → API Keys」创建
 *
 * 可选：
 *   EASYDB_BASE_URL  — 网关地址，默认 http://localhost:3000
 *   EASYDB_PROJECT   — 默认项目标识（工具调用时可省略 projectKey）
 *   EASYDB_ENV       — 默认环境标识，默认 prod
 */

const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { z } = require("zod");

const tools = [
  require("./tools/getSchema"),
  require("./tools/listApis"),
  require("./tools/createApi"),
  require("./tools/updateApi"),
  require("./tools/testApi"),
  require("./tools/deployFrontend"),
];

// 从环境变量读取默认 project/env，注入到每次调用
const DEFAULT_PROJECT = process.env.EASYDB_PROJECT || "";
const DEFAULT_ENV = process.env.EASYDB_ENV || "prod";

const server = new McpServer({
  name: "easydb",
  version: require("../package.json").version,
});

for (const tool of tools) {
  const { definition, handler } = tool;
  const injectedOptionalKeys = new Set(["env"]);
  if (DEFAULT_PROJECT) injectedOptionalKeys.add("projectKey");
  const shape = buildZodShape(definition.inputSchema, injectedOptionalKeys);

  server.tool(definition.name, definition.description, shape, async (args) => {
    // 注入默认值
    if (!args.projectKey && DEFAULT_PROJECT) args.projectKey = DEFAULT_PROJECT;
    if (!args.env) args.env = DEFAULT_ENV;
    if (!args.projectKey) {
      return {
        content: [{ type: "text", text: "Error: Missing projectKey. Please pass projectKey or set EASYDB_PROJECT." }],
        isError: true,
      };
    }

    try {
      const result = await handler(args);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  });
}

/**
 * 将 JSON Schema properties 转换为 zod shape
 */
function buildZodShape(schema, optionalKeys = new Set()) {
  const shape = {};
  const props = schema.properties || {};
  const required = new Set(schema.required || []);

  for (const [key, prop] of Object.entries(props)) {
    let field;

    if (prop.enum) {
      field = z.enum(prop.enum);
    } else {
      switch (prop.type) {
        case "string":   field = z.string(); break;
        case "integer":  field = z.number().int(); break;
        case "number":   field = z.number(); break;
        case "boolean":  field = z.boolean(); break;
        case "array":    field = z.array(z.any()); break;
        case "object":   field = z.record(z.any()); break;
        default:         field = z.any(); break;
      }
    }

    if (prop.description) field = field.describe(prop.description);
    if (!required.has(key) || optionalKeys.has(key)) field = field.optional();

    shape[key] = field;
  }

  return shape;
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(`[easydb-mcp] v${require("../package.json").version} started\n`);
  if (!process.env.EASYDB_API_KEY) {
    process.stderr.write("[easydb-mcp] WARNING: EASYDB_API_KEY not set — all requests will fail\n");
  }
}

main().catch((err) => {
  process.stderr.write(`[easydb-mcp] fatal: ${err.message}\n`);
  process.exit(1);
});
