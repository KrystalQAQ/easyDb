const knex = require("knex");

const dbClients = new Map();

function clientKey(projectKey, env) {
  return `${String(projectKey || "").toLowerCase()}::${String(env || "").toLowerCase()}`;
}

function buildSignature(db) {
  return [db.host, db.port, db.user, db.password, db.database].join("|");
}

function createDbClient(db) {
  return knex({
    client: "mysql2",
    connection: {
      host: db.host,
      port: Number(db.port || 3306),
      user: db.user,
      password: db.password,
      database: db.database,
    },
    pool: { min: 0, max: 10 },
  });
}

function getTenantDbClient(context) {
  if (!context || !context.db) {
    throw new Error("tenant db context is required");
  }

  const key = clientKey(context.projectKey, context.env);
  const signature = buildSignature(context.db);
  const current = dbClients.get(key);

  // 连接信息未变化时复用连接池，避免频繁重连 MySQL。
  if (current && current.signature === signature) {
    return current.client;
  }

  if (current) {
    // 配置变化时销毁旧池，防止新旧配置串用。
    void current.client.destroy();
  }

  const client = createDbClient(context.db);
  dbClients.set(key, { signature, client });
  return client;
}

async function closeAllTenantDbClients() {
  const closing = [];
  for (const entry of dbClients.values()) {
    closing.push(entry.client.destroy().catch(() => undefined));
  }
  dbClients.clear();
  await Promise.all(closing);
}

module.exports = {
  getTenantDbClient,
  closeAllTenantDbClients,
};
