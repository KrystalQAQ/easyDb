function normalizeUsername(value: unknown): string {
  return String(value || "").trim();
}

function normalizeRole(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function normalizeStatus(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function normalizeProjectKey(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function normalizeEnvKey(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function normalizeVarKey(value: unknown): string {
  return String(value || "").trim().toUpperCase();
}

function isValidUsername(username: string): boolean {
  return /^[a-zA-Z0-9._-]{3,64}$/.test(username);
}

function isValidRole(role: string): boolean {
  return /^[a-z][a-z0-9_-]{1,31}$/.test(role);
}

function isValidProjectKey(projectKey: string): boolean {
  return /^[a-z][a-z0-9_-]{1,31}$/.test(projectKey);
}

function isValidEnvKey(envKey: string): boolean {
  return /^[a-z][a-z0-9_-]{1,31}$/.test(envKey);
}

function isValidVarKey(varKey: string): boolean {
  return /^[A-Z][A-Z0-9_]{0,127}$/.test(varKey);
}

function normalizeApiKey(value: unknown): string {
  return String(value || "").trim();
}

function isValidApiKey(apiKey: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9_-]{1,127}$/.test(apiKey);
}

function normalizeGroupKey(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function isValidGroupKey(groupKey: string): boolean {
  return /^[a-z][a-z0-9_-]{1,63}$/.test(groupKey);
}

module.exports = {
  normalizeUsername,
  normalizeRole,
  normalizeStatus,
  normalizeProjectKey,
  normalizeEnvKey,
  normalizeVarKey,
  normalizeApiKey,
  normalizeGroupKey,
  isValidUsername,
  isValidRole,
  isValidProjectKey,
  isValidEnvKey,
  isValidVarKey,
  isValidApiKey,
  isValidGroupKey,
};
