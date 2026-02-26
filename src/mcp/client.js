/**
 * EasyDB platform API 的轻量 HTTP 客户端
 * 从环境变量读取 base URL 和 admin token
 */

const BASE_URL = (process.env.EASYDB_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const TOKEN = process.env.EASYDB_TOKEN || "";

if (!TOKEN) {
  process.stderr.write("[easydb-mcp] 警告: EASYDB_TOKEN 未设置，所有请求将被拒绝\n");
}

async function apiRequest(method, path, body) {
  const url = `${BASE_URL}${path}`;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${TOKEN}`,
  };

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  if (!res.ok || json.ok === false) {
    throw new Error(json.error || `HTTP ${res.status}`);
  }

  return json;
}

module.exports = { apiRequest };
