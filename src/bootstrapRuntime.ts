const {
  resolveBootstrapDbConfig,
  applyBootstrapDbConfigToProcessEnv,
  deleteBootstrapDbConfig,
} = require("./bootstrapDbConfig");
const { initializeRuntimeSettings } = require("./runtimeSettings");

type DbBootstrapConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
};

type BootstrapStatus = {
  configured: boolean;
  initialized: boolean;
  source: "env" | "file" | null;
  lastError: string | null;
  updatedAt: string;
};

type BootstrapInitReport = {
  checkedAt: string;
  initializedTables: boolean;
  createdTables: string[];
  existingTables: string[];
};

const bootstrapStatus: BootstrapStatus = {
  configured: false,
  initialized: false,
  source: null,
  lastError: "数据库尚未初始化",
  updatedAt: new Date().toISOString(),
};

let lastBootstrapInitReport: BootstrapInitReport | null = null;

function getBootstrapStatus(): BootstrapStatus {
  return { ...bootstrapStatus };
}

function getBootstrapInitReport(): BootstrapInitReport | null {
  if (!lastBootstrapInitReport) return null;
  return {
    ...lastBootstrapInitReport,
    createdTables: [...lastBootstrapInitReport.createdTables],
    existingTables: [...lastBootstrapInitReport.existingTables],
  };
}

function getEnsurePlatformTables(forceReload = false): () => Promise<void> {
  if (forceReload) {
    for (const modulePath of ["./projectStore", "./apiKeyStore", "./authInitialization", "./db", "./config"]) {
      try {
        delete require.cache[require.resolve(modulePath)];
      } catch {
        // ignore cache miss
      }
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { ensurePlatformTables } = require("./projectStore");
  return ensurePlatformTables;
}

function getEnsureAuthTablesAndSeeds(forceReload = false): () => Promise<void> {
  if (forceReload) {
    for (const modulePath of ["./authInitialization", "./db", "./config"]) {
      try {
        delete require.cache[require.resolve(modulePath)];
      } catch {
        // ignore cache miss
      }
    }
  }
  const { ensureAuthTablesAndSeeds } = require("./authInitialization");
  return ensureAuthTablesAndSeeds;
}

function resolvePlatformTableNames(): string[] {
  const { SETTINGS_TABLE } = require("./runtimeSettings");
  const { platform, authUserTable } = require("./config");
  const { roleTablePermissionTable } = require("./authInitialization");
  return Array.from(
    new Set([
      SETTINGS_TABLE,
      authUserTable,
      roleTablePermissionTable,
      platform.tables.projects,
      platform.tables.projectEnvs,
      platform.tables.envVars,
      platform.tables.apiGroups,
      platform.tables.apis,
      "gateway_api_keys",
    ].filter(Boolean))
  );
}

async function inspectTableState(tableNames: string[]): Promise<Record<string, boolean>> {
  const { dbClient } = require("./db");
  const result: Record<string, boolean> = {};
  for (const tableName of tableNames) {
    try {
      result[tableName] = await dbClient.schema.hasTable(tableName);
    } catch {
      result[tableName] = false;
    }
  }
  return result;
}

function clearBootstrapDbEnv(): void {
  delete process.env.DB_HOST;
  delete process.env.DB_PORT;
  delete process.env.DB_USER;
  delete process.env.DB_PASSWORD;
  delete process.env.DB_NAME;
}

async function resetBootstrapRuntime(): Promise<BootstrapStatus> {
  try {
    const { dbClient } = require("./db");
    await dbClient.destroy().catch(() => undefined);
  } catch {
    // ignore
  }

  for (const modulePath of ["./projectStore", "./apiKeyStore", "./authInitialization", "./db", "./config"]) {
    try {
      delete require.cache[require.resolve(modulePath)];
    } catch {
      // ignore cache miss
    }
  }

  deleteBootstrapDbConfig();
  clearBootstrapDbEnv();
  lastBootstrapInitReport = null;
  bootstrapStatus.configured = false;
  bootstrapStatus.initialized = false;
  bootstrapStatus.source = null;
  bootstrapStatus.lastError = "数据库尚未初始化，请先填写数据库连接";
  bootstrapStatus.updatedAt = new Date().toISOString();
  return getBootstrapStatus();
}

/**
 * 尝试初始化运行时；失败时不抛异常，交由前端引导页面继续处理。
 */
async function initializeBootstrapRuntime(overrideConfig?: DbBootstrapConfig): Promise<BootstrapStatus> {
  const resolved = overrideConfig || resolveBootstrapDbConfig();
  bootstrapStatus.configured = Boolean(resolved);
  bootstrapStatus.source = overrideConfig ? "file" : resolved?.source || null;
  bootstrapStatus.updatedAt = new Date().toISOString();

  if (!resolved) {
    lastBootstrapInitReport = null;
    bootstrapStatus.initialized = false;
    bootstrapStatus.lastError = "数据库尚未初始化，请先填写数据库连接";
    return getBootstrapStatus();
  }

  applyBootstrapDbConfigToProcessEnv(resolved);

  try {
    await initializeRuntimeSettings();
    const tableNames = resolvePlatformTableNames();
    const beforeState = await inspectTableState(tableNames);
    const ensureAuthTablesAndSeeds = getEnsureAuthTablesAndSeeds(true);
    const ensurePlatformTables = getEnsurePlatformTables(true);
    await ensureAuthTablesAndSeeds();
    await ensurePlatformTables();
    const afterState = await inspectTableState(tableNames);
    const createdTables = tableNames.filter((tableName) => !beforeState[tableName] && afterState[tableName]);
    const existingTables = tableNames.filter((tableName) => afterState[tableName] && !createdTables.includes(tableName));
    lastBootstrapInitReport = {
      checkedAt: new Date().toISOString(),
      initializedTables: createdTables.length > 0,
      createdTables,
      existingTables,
    };
    bootstrapStatus.initialized = true;
    bootstrapStatus.lastError = null;
  } catch (err: unknown) {
    lastBootstrapInitReport = null;
    bootstrapStatus.initialized = false;
    bootstrapStatus.lastError = err instanceof Error ? err.message : String(err);
  }
  bootstrapStatus.updatedAt = new Date().toISOString();
  return getBootstrapStatus();
}

module.exports = {
  getBootstrapInitReport,
  getBootstrapStatus,
  initializeBootstrapRuntime,
  resetBootstrapRuntime,
};

export {};
