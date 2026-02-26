#!/usr/bin/env node
/**
 * EasyDB MCP Server
 *
 * 启动方式：
 *   EASYDB_BASE_URL=http://localhost:3000 EASYDB_TOKEN=<jwt> node src/mcp/server.js
 *
 * 在 Claude Desktop / Cursor 的 mcp 配置中使用：
 *   {
 *     "mcpServers": {
 *       "easydb": {
 *         "command": "node",
 *         "args": ["src/mcp/server.js"],
 *         "env": {
 *           "EASYDB_BASE_URL": "http://localhost:3000",
 *           "EASYDB_TOKEN": "<admin-jwt-token>"
 *         }
 *       }
 *     }
 *   }
 */

const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { z } = require("zod");

const getSchema = require("./tools/getSchema");
const listApis = require("./tools/listApis");
const createApi = require("./tools/createApi");
const updateApi = require("./tools/updateApi");
const testApi = require("./tools/testApi");

const tools = [getSchema, listApis, createApi, updateApi, testApi];

const server = new McpServer({
  name: "easydb",
  version: "1.0.0",
});

// 将每个 tool 的 inputSchema (JSON Schema) 转换为 zod shape 并注册
for (const tool of tools) {
  const { definition, handler } = tool;
  const shape = jsonSchemaToZodShape(definition.inputSchema);

  server.tool(definition.name, definition.description, shape, async (args) => {
    try {
      const result = await handler(args);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `错误: ${err.message}` }],
        isError: true,
      };
    }
  });
}

/**
 * 将简单的 JSON Schema properties 转换为 zod shape
 * 只处理 MCP tool 常用的类型，不做完整实现
 */
function jsonSchemaToZodShape(schema) {
  const shape = {};
  const props = schema.properties || {};
  const required = new Set(schema.required || []);

  for (const [key, prop] of Object.entries(props)) {
    let zField;

    if (prop.enum) {
      zField = z.enum(prop.enum);
    } else if (prop.type === "string") {
      zField = z.string();
    } else if (prop.type === "integer") {
      zField = z.number().int();
    } else if (prop.type === "number") {
      zField = z.number();
    } else if (prop.type === "boolean") {
      zField = z.boolean();
    } else if (prop.type === "array") {
      zField = z.array(z.any());
    } else if (prop.type === "object") {
      zField = z.record(z.any());
    } else {
      zField = z.any();
    }

    if (prop.description) {
      zField = zField.describe(prop.description);
    }

    if (!required.has(key)) {
      zField = zField.optional();
    }

    shape[key] = zField;
  }

  return shape;
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("[easydb-mcp] server started\n");
}

main().catch((err) => {
  process.stderr.write(`[easydb-mcp] fatal: ${err.message}\n`);
  process.exit(1);
});
