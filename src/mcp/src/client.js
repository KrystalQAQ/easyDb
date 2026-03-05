/**
 * EasyDB HTTP client
 * Reads EASYDB_BASE_URL and EASYDB_API_KEY from environment
 */

const BASE_URL = (process.env.EASYDB_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const API_KEY = process.env.EASYDB_API_KEY || "";

if (!API_KEY) {
  process.stderr.write("[easydb-mcp] WARNING: EASYDB_API_KEY is not set\n");
}

async function apiRequest(method, path, body) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": API_KEY,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  }

  if (!res.ok || json.ok === false) {
    throw new Error(json.error || `HTTP ${res.status}`);
  }

  return json;
}

module.exports = { apiRequest };
