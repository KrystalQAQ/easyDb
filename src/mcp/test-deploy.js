#!/usr/bin/env node
/**
 * 测试 deploy_frontend 工具
 * 用法: node test-deploy.js
 */

const path = require("path");

// 模拟环境变量
process.env.EASYDB_PROJECT = "ai";
process.env.EASYDB_ENV = "prod";
process.env.EASYDB_BASE_URL = "http://admin.254253.xyz:3080";
process.env.EASYDB_API_KEY = "edb_ai_1b4139f7f53028c98cbe873f5102c3394e4f84a0";

const { handler } = require("./src/tools/deployFrontend");

async function test() {
  try {
    console.log("开始测试 deploy_frontend...");
    console.log("环境变量:");
    console.log("  EASYDB_PROJECT:", process.env.EASYDB_PROJECT);
    console.log("  EASYDB_ENV:", process.env.EASYDB_ENV);
    console.log("  EASYDB_BASE_URL:", process.env.EASYDB_BASE_URL);
    console.log("");

    // 测试参数 - 使用相对路径
    const result = await handler({
      distPath: "D:\\workspace\\tanyu\\useage\\dist", // 或者你的实际 dist 目录路径
    });

    console.log("✅ 测试成功!");
    console.log(result);
  } catch (error) {
    console.error("❌ 测试失败:");
    console.error(error);
    console.error(error.stack);
    process.exit(1);
  }
}

test();
