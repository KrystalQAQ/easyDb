const {
  allowedSqlTypes,
  allowedTables,
  roleTableMap,
  requireSelectLimit,
  maxSelectLimit,
  requestEncryption,
} = require("../config");
const { parseRoleTableRules } = require("../sqlPolicy");

function normalizePolicyInput(payload = {}) {
  const source = payload || {};
  return {
    allowedSqlTypes: Array.isArray(source.allowedSqlTypes)
      ? source.allowedSqlTypes.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean)
      : [],
    allowedTables: Array.isArray(source.allowedTables)
      ? source.allowedTables.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean)
      : [],
    roleTables: source.roleTables && typeof source.roleTables === "object" ? source.roleTables : {},
    requireSelectLimit:
      source.requireSelectLimit === undefined ? undefined : Boolean(source.requireSelectLimit),
    maxSelectLimit:
      source.maxSelectLimit === undefined || !Number.isFinite(Number(source.maxSelectLimit))
        ? undefined
        : Number(source.maxSelectLimit),
  };
}

function buildEffectivePolicy(rawPolicy = {}) {
  return {
    allowedSqlTypes:
      Array.isArray(rawPolicy.allowedSqlTypes) && rawPolicy.allowedSqlTypes.length > 0
        ? new Set(rawPolicy.allowedSqlTypes)
        : new Set(allowedSqlTypes),
    allowedTables:
      Array.isArray(rawPolicy.allowedTables) && rawPolicy.allowedTables.length > 0
        ? new Set(rawPolicy.allowedTables)
        : new Set(allowedTables),
    roleTables:
      rawPolicy.roleTables && Object.keys(rawPolicy.roleTables).length > 0
        ? parseRoleTableRules(rawPolicy.roleTables)
        : roleTableMap,
    requireSelectLimit:
      rawPolicy.requireSelectLimit === undefined
        ? requireSelectLimit
        : Boolean(rawPolicy.requireSelectLimit),
    maxSelectLimit:
      rawPolicy.maxSelectLimit === undefined || !Number.isFinite(Number(rawPolicy.maxSelectLimit))
        ? maxSelectLimit
        : Number(rawPolicy.maxSelectLimit),
  };
}

function getGatewayPayloadOptions(context) {
  return {
    enabled: requestEncryption.enabled,
    allowPlaintext: requestEncryption.allowPlaintext,
    password: context?.requestEncryptionPassword || requestEncryption.password,
  };
}

module.exports = {
  normalizePolicyInput,
  buildEffectivePolicy,
  getGatewayPayloadOptions,
};
