const { dbClient } = require("./db");
const { platform } = require("./config");
const { encryptSecret, decryptSecret } = require("./configVault");

function normalizeProjectKey(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeEnvKey(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizePolicy(policy = {}) {
  return {
    allowedSqlTypes: Array.isArray(policy.allowedSqlTypes)
      ? policy.allowedSqlTypes.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean)
      : [],
    allowedTables: Array.isArray(policy.allowedTables)
      ? policy.allowedTables.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean)
      : [],
    roleTables: policy.roleTables && typeof policy.roleTables === "object" ? policy.roleTables : {},
    requireSelectLimit: policy.requireSelectLimit !== undefined ? Boolean(policy.requireSelectLimit) : undefined,
    maxSelectLimit:
      policy.maxSelectLimit !== undefined && Number.isFinite(Number(policy.maxSelectLimit))
        ? Number(policy.maxSelectLimit)
        : undefined,
    publicAccess: policy.publicAccess !== undefined ? Boolean(policy.publicAccess) : false,
  };
}

function parsePolicyJson(raw) {
  if (!raw || typeof raw !== "string") return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch (_err) {
    return {};
  }
}

function buildProjectEnvContext(row) {
  if (!row) return null;
  return {
    envId: row.env_id,
    projectKey: row.project_key,
    projectName: row.project_name,
    projectStatus: row.project_status,
    env: row.env_key,
    status: row.env_status,
    db: {
      host: row.db_host,
      port: Number(row.db_port || 3306),
      user: row.db_user,
      // 密文字段只在服务内存里解密，避免明文落盘。
      password: decryptSecret(row.db_password || ""),
      database: row.db_name,
    },
    policy: parsePolicyJson(row.policy_json),
    requestEncryptionPassword: row.request_encryption_password
      ? decryptSecret(row.request_encryption_password)
      : "",
  };
}

async function ensurePlatformTables() {
  const projectsTable = platform.tables.projects;
  const envsTable = platform.tables.projectEnvs;
  const envVarsTable = platform.tables.envVars;

  // 平台元数据表采用懒初始化，首启时自动建表。
  const projectsExists = await dbClient.schema.hasTable(projectsTable);
  if (!projectsExists) {
    await dbClient.schema.createTable(projectsTable, (table) => {
      table.bigIncrements("id").primary();
      table.string("project_key", 64).notNullable().unique();
      table.string("name", 128).notNullable();
      table.enu("status", ["active", "disabled"]).notNullable().defaultTo("active");
      table.timestamp("created_at").notNullable().defaultTo(dbClient.fn.now());
      table.timestamp("updated_at").notNullable().defaultTo(dbClient.fn.now());
    });
  }

  const envsExists = await dbClient.schema.hasTable(envsTable);
  if (!envsExists) {
    await dbClient.schema.createTable(envsTable, (table) => {
      table.bigIncrements("id").primary();
      table.bigInteger("project_id").notNullable();
      table.string("env_key", 32).notNullable();
      table.enu("status", ["active", "disabled"]).notNullable().defaultTo("active");
      table.string("db_host", 128).notNullable();
      table.integer("db_port").notNullable().defaultTo(3306);
      table.string("db_user", 128).notNullable();
      table.text("db_password").notNullable();
      table.string("db_name", 128).notNullable();
      table.text("policy_json").nullable();
      table.text("request_encryption_password").nullable();
      table.timestamp("created_at").notNullable().defaultTo(dbClient.fn.now());
      table.timestamp("updated_at").notNullable().defaultTo(dbClient.fn.now());
      table.unique(["project_id", "env_key"]);
      table.index(["project_id"], "idx_project_env_project_id");
    });
  }

  const apiGroupsTable = platform.tables.apiGroups;
  const apisTable = platform.tables.apis;

  const apiGroupsExists = await dbClient.schema.hasTable(apiGroupsTable);
  if (!apiGroupsExists) {
    await dbClient.schema.createTable(apiGroupsTable, (table) => {
      table.bigIncrements("id").primary();
      table.bigInteger("project_env_id").notNullable();
      table.string("group_key", 64).notNullable();
      table.string("name", 128).notNullable();
      table.string("base_path", 128).defaultTo("");
      table.text("description").nullable();
      table.integer("sort_order").defaultTo(0);
      table.enu("status", ["active", "disabled"]).notNullable().defaultTo("active");
      table.timestamp("created_at").notNullable().defaultTo(dbClient.fn.now());
      table.timestamp("updated_at").notNullable().defaultTo(dbClient.fn.now());
      table.unique(["project_env_id", "group_key"]);
      table.index(["project_env_id"], "idx_api_group_project_env_id");
    });
  }

  const apisExists = await dbClient.schema.hasTable(apisTable);
  if (!apisExists) {
    await dbClient.schema.createTable(apisTable, (table) => {
      table.bigIncrements("id").primary();
      table.bigInteger("project_env_id").notNullable();
      table.bigInteger("group_id").nullable();
      table.string("api_key", 128).notNullable();
      table.string("name", 128).notNullable();
      table.text("description").nullable();
      table.enu("method", ["GET", "POST", "PUT", "DELETE"]).notNullable().defaultTo("POST");
      table.string("path", 256).defaultTo("");
      table.text("sql_template").notNullable();
      table.enu("sql_type", ["select", "insert", "update", "delete"]).notNullable();
      table.json("params_schema").nullable();
      table.json("result_mapping").nullable();
      table.integer("cache_ttl").defaultTo(0);
      table.enu("auth_mode", ["token", "public"]).notNullable().defaultTo("token");
      table.integer("sort_order").defaultTo(0);
      table.enu("status", ["active", "disabled"]).notNullable().defaultTo("active");
      table.integer("version").notNullable().defaultTo(1);
      table.string("created_by", 64).nullable();
      table.string("updated_by", 64).nullable();
      table.timestamp("created_at").notNullable().defaultTo(dbClient.fn.now());
      table.timestamp("updated_at").notNullable().defaultTo(dbClient.fn.now());
      table.unique(["project_env_id", "api_key"]);
      table.index(["project_env_id", "group_id"], "idx_api_project_env_group");
    });
  }

  const envVarsExists = await dbClient.schema.hasTable(envVarsTable);
  if (!envVarsExists) {
    await dbClient.schema.createTable(envVarsTable, (table) => {
      table.bigIncrements("id").primary();
      table.bigInteger("project_env_id").notNullable();
      table.string("var_key", 128).notNullable();
      table.text("var_value_text").notNullable();
      table.boolean("is_secret").notNullable().defaultTo(false);
      table.integer("version").notNullable().defaultTo(1);
      table.string("created_by", 64).nullable();
      table.string("updated_by", 64).nullable();
      table.timestamp("created_at").notNullable().defaultTo(dbClient.fn.now());
      table.timestamp("updated_at").notNullable().defaultTo(dbClient.fn.now());
      table.unique(["project_env_id", "var_key"]);
      table.index(["project_env_id"], "idx_env_var_project_env_id");
    });
  }
}

async function listProjects() {
  const rows = await dbClient(platform.tables.projects)
    .select("project_key", "name", "status", "created_at", "updated_at")
    .orderBy("project_key", "asc");
  return rows.map((row) => ({
    projectKey: row.project_key,
    name: row.name,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

async function getProject(projectKey) {
  const normalized = normalizeProjectKey(projectKey);
  if (!normalized) return null;
  const row = await dbClient(platform.tables.projects)
    .select("id", "project_key", "name", "status", "created_at", "updated_at")
    .where({ project_key: normalized })
    .first();
  if (!row) return null;
  return {
    id: row.id,
    projectKey: row.project_key,
    name: row.name,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function createProject({ projectKey, name, status = "active" }) {
  const normalizedKey = normalizeProjectKey(projectKey);
  if (!normalizedKey) {
    throw new Error("projectKey is required");
  }
  await dbClient(platform.tables.projects).insert({
    project_key: normalizedKey,
    name: String(name || normalizedKey),
    status,
    created_at: dbClient.fn.now(),
    updated_at: dbClient.fn.now(),
  });
  return getProject(normalizedKey);
}

async function deleteProject(projectKey) {
  const project = await getProject(projectKey);
  if (!project) return false;

  const envRows = await dbClient(platform.tables.projectEnvs).select("id").where({ project_id: project.id });
  const envIds = envRows.map((row) => row.id);

  if (envIds.length > 0) {
    await dbClient(platform.tables.apis).whereIn("project_env_id", envIds).del();
    await dbClient(platform.tables.apiGroups).whereIn("project_env_id", envIds).del();
    await dbClient(platform.tables.envVars).whereIn("project_env_id", envIds).del();
  }
  await dbClient(platform.tables.projectEnvs).where({ project_id: project.id }).del();
  await dbClient(platform.tables.projects).where({ id: project.id }).del();
  return true;
}

async function listProjectEnvs(projectKey) {
  const project = await getProject(projectKey);
  if (!project) return [];
  const rows = await dbClient(platform.tables.projectEnvs)
    .select(
      "env_key",
      "status",
      "db_host",
      "db_port",
      "db_user",
      "db_name",
      "created_at",
      "updated_at"
    )
    .where({ project_id: project.id })
    .orderBy("env_key", "asc");
  return rows.map((row) => ({
    env: row.env_key,
    status: row.status,
    db: {
      host: row.db_host,
      port: row.db_port,
      user: row.db_user,
      database: row.db_name,
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

async function findProjectEnvRecord(projectKey, envKey) {
  const normalizedProjectKey = normalizeProjectKey(projectKey);
  const normalizedEnvKey = normalizeEnvKey(envKey);
  if (!normalizedProjectKey || !normalizedEnvKey) return null;

  const row = await dbClient({ p: platform.tables.projects })
    .join({ e: platform.tables.projectEnvs }, "e.project_id", "p.id")
    .select(
      "p.id as project_id",
      "p.project_key",
      "p.name as project_name",
      "p.status as project_status",
      "e.id as env_id",
      "e.env_key",
      "e.status as env_status",
      "e.db_host",
      "e.db_port",
      "e.db_user",
      "e.db_password",
      "e.db_name",
      "e.policy_json",
      "e.request_encryption_password"
    )
    .where({
      "p.project_key": normalizedProjectKey,
      "e.env_key": normalizedEnvKey,
    })
    .first();

  return row || null;
}

async function getProjectEnvContext(projectKey, envKey) {
  const row = await findProjectEnvRecord(projectKey, envKey);
  return buildProjectEnvContext(row);
}

async function upsertProjectEnv(projectKey, envKey, payload = {}) {
  const normalizedProjectKey = normalizeProjectKey(projectKey);
  const normalizedEnvKey = normalizeEnvKey(envKey);
  if (!normalizedProjectKey || !normalizedEnvKey) {
    throw new Error("projectKey/env is required");
  }

  let project = await getProject(normalizedProjectKey);
  if (!project) {
    project = await createProject({
      projectKey: normalizedProjectKey,
      name: normalizedProjectKey,
      status: "active",
    });
  }

  const existing = await findProjectEnvRecord(normalizedProjectKey, normalizedEnvKey);
  const row = {
    status: payload.status || existing?.env_status || "active",
    db_host: payload.db?.host || existing?.db_host,
    db_port: Number(payload.db?.port || existing?.db_port || 3306),
    db_user: payload.db?.user || existing?.db_user,
    db_name: payload.db?.database || existing?.db_name,
    policy_json: JSON.stringify(normalizePolicy(payload.policy || parsePolicyJson(existing?.policy_json || ""))),
    updated_at: dbClient.fn.now(),
  };

  // 未传密码时复用旧密码，避免编辑环境造成密码丢失。
  if (payload.db?.password !== undefined) {
    row.db_password = encryptSecret(String(payload.db.password || ""));
  } else if (existing?.db_password) {
    row.db_password = existing.db_password;
  }

  if (payload.requestEncryptionPassword !== undefined) {
    row.request_encryption_password = payload.requestEncryptionPassword
      ? encryptSecret(String(payload.requestEncryptionPassword))
      : "";
  } else if (existing?.request_encryption_password) {
    row.request_encryption_password = existing.request_encryption_password;
  }

  if (!row.db_host || !row.db_user || !row.db_name || !row.db_password) {
    throw new Error("db.host/db.user/db.password/db.database is required");
  }

  if (existing) {
    await dbClient(platform.tables.projectEnvs).where({ id: existing.env_id }).update(row);
  } else {
    await dbClient(platform.tables.projectEnvs).insert({
      project_id: project.id,
      env_key: normalizedEnvKey,
      created_at: dbClient.fn.now(),
      ...row,
    });
  }

  return getProjectEnvContext(normalizedProjectKey, normalizedEnvKey);
}

async function listProjectEnvVars(projectKey, envKey, options = {}) {
  const includeSecret = Boolean(options.includeSecret);
  const envRecord = await findProjectEnvRecord(projectKey, envKey);
  if (!envRecord) return [];

  const rows = await dbClient(platform.tables.envVars)
    .select(
      "var_key",
      "var_value_text",
      "is_secret",
      "version",
      "created_by",
      "updated_by",
      "created_at",
      "updated_at"
    )
    .where({ project_env_id: envRecord.env_id })
    .orderBy("var_key", "asc");

  return rows.map((row) => {
    let value;
    if (row.is_secret && !includeSecret) {
      value = "***";
    } else if (row.is_secret) {
      value = decryptSecret(row.var_value_text);
    } else {
      value = row.var_value_text;
    }

    return {
      key: row.var_key,
      value,
      isSecret: Boolean(row.is_secret),
      version: row.version,
      createdBy: row.created_by,
      updatedBy: row.updated_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
}

async function upsertProjectEnvVar(projectKey, envKey, varKey, payload = {}) {
  const envRecord = await findProjectEnvRecord(projectKey, envKey);
  if (!envRecord) {
    throw new Error("project env not found");
  }

  const normalizedKey = String(varKey || "").trim();
  if (!normalizedKey) {
    throw new Error("varKey is required");
  }

  const isSecret = Boolean(payload.isSecret);
  const nextValue = payload.value === undefined || payload.value === null ? "" : String(payload.value);
  const storedValue = isSecret ? encryptSecret(nextValue) : nextValue;
  const actor = String(payload.actor || "");

  const existing = await dbClient(platform.tables.envVars)
    .select("id", "version")
    .where({
      project_env_id: envRecord.env_id,
      var_key: normalizedKey,
    })
    .first();

  if (existing) {
    await dbClient(platform.tables.envVars)
      .where({ id: existing.id })
      .update({
        var_value_text: storedValue,
        is_secret: isSecret,
        version: Number(existing.version || 1) + 1,
        updated_by: actor || null,
        updated_at: dbClient.fn.now(),
      });
  } else {
    await dbClient(platform.tables.envVars).insert({
      project_env_id: envRecord.env_id,
      var_key: normalizedKey,
      var_value_text: storedValue,
      is_secret: isSecret,
      version: 1,
      created_by: actor || null,
      updated_by: actor || null,
      created_at: dbClient.fn.now(),
      updated_at: dbClient.fn.now(),
    });
  }

  const items = await listProjectEnvVars(projectKey, envKey, { includeSecret: true });
  return items.find((entry) => entry.key === normalizedKey) || null;
}

module.exports = {
  ensurePlatformTables,
  listProjects,
  getProject,
  createProject,
  deleteProject,
  listProjectEnvs,
  findProjectEnvRecord,
  getProjectEnvContext,
  upsertProjectEnv,
  listProjectEnvVars,
  upsertProjectEnvVar,
};
