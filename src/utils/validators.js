function normalizeUsername(value) {
  return String(value || "").trim();
}

function normalizeRole(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeStatus(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeProjectKey(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeEnvKey(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeVarKey(value) {
  return String(value || "").trim().toUpperCase();
}

function isValidUsername(username) {
  return /^[a-zA-Z0-9._-]{3,64}$/.test(username);
}

function isValidRole(role) {
  return /^[a-z][a-z0-9_-]{1,31}$/.test(role);
}

function isValidProjectKey(projectKey) {
  return /^[a-z][a-z0-9_-]{1,31}$/.test(projectKey);
}

function isValidEnvKey(envKey) {
  return /^[a-z][a-z0-9_-]{1,31}$/.test(envKey);
}

function isValidVarKey(varKey) {
  return /^[A-Z][A-Z0-9_]{0,127}$/.test(varKey);
}

function normalizeApiKey(value) {
  return String(value || "").trim();
}

function isValidApiKey(apiKey) {
  return /^[a-zA-Z][a-zA-Z0-9_-]{1,127}$/.test(apiKey);
}

function normalizeGroupKey(value) {
  return String(value || "").trim().toLowerCase();
}

function isValidGroupKey(groupKey) {
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
