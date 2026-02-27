const bcrypt = require("bcryptjs");
const { dbClient } = require("../src/db");
const { bcryptRounds, authUserTable } = require("../src/config");

async function ensureUsersTable() {
  const exists = await dbClient.schema.hasTable(authUserTable);
  if (exists) {
    // 已有表：补加 avatar 列（幂等）
    const hasAvatar = await dbClient.schema.hasColumn(authUserTable, "avatar");
    if (!hasAvatar) {
      await dbClient.schema.alterTable(authUserTable, (table) => {
        table.text("avatar").nullable();
      });
    }
    return;
  }

  await dbClient.schema.createTable(authUserTable, (table) => {
    table.bigIncrements("id").primary();
    table.string("username", 64).notNullable().unique();
    table.string("password_hash", 100).notNullable();
    table.string("role", 32).notNullable().defaultTo("analyst");
    table.enu("status", ["active", "disabled"]).notNullable().defaultTo("active");
    table.text("avatar").nullable();
    table.timestamp("last_login_at").nullable();
    table.timestamp("created_at").notNullable().defaultTo(dbClient.fn.now());
    table.timestamp("updated_at").notNullable().defaultTo(dbClient.fn.now());
  });
}

async function ensureRoleTablePermissionTable() {
  const tableName = "gateway_role_table_permissions";
  const exists = await dbClient.schema.hasTable(tableName);
  if (exists) return;

  await dbClient.schema.createTable(tableName, (table) => {
    table.bigIncrements("id").primary();
    table.string("role", 32).notNullable();
    table.string("table_name", 128).notNullable();
    table.boolean("can_read").notNullable().defaultTo(true);
    table.boolean("can_write").notNullable().defaultTo(false);
    table.timestamp("created_at").notNullable().defaultTo(dbClient.fn.now());
    table.unique(["role", "table_name"]);
  });
}

async function seedUsers() {
  const users = [
    {
      username: process.env.SEED_ADMIN_USERNAME || "admin",
      password: process.env.SEED_ADMIN_PASSWORD || "admin123",
      role: "admin",
    },
    {
      username: process.env.SEED_ANALYST_USERNAME || "analyst",
      password: process.env.SEED_ANALYST_PASSWORD || "analyst123",
      role: "analyst",
    },
  ];

  for (const user of users) {
    const exists = await dbClient(authUserTable).where({ username: user.username }).first();
    if (exists) continue;

    const passwordHash = await bcrypt.hash(user.password, bcryptRounds);
    await dbClient(authUserTable).insert({
      username: user.username,
      password_hash: passwordHash,
      role: user.role,
      status: "active",
    });
  }
}

async function seedRolePermissions() {
  const tableName = "gateway_role_table_permissions";
  const rows = [
    { role: "admin", table_name: "*", can_read: true, can_write: true },
    { role: "analyst", table_name: "users", can_read: true, can_write: false },
    { role: "analyst", table_name: "orders", can_read: true, can_write: false },
  ];

  for (const row of rows) {
    const exists = await dbClient(tableName)
      .where({ role: row.role, table_name: row.table_name })
      .first();
    if (!exists) {
      await dbClient(tableName).insert(row);
    }
  }
}

async function main() {
  await ensureUsersTable();
  await ensureRoleTablePermissionTable();
  await seedUsers();
  await seedRolePermissions();
  console.log(`Auth tables initialized. users table: ${authUserTable}`);
}

main()
  .catch((err) => {
    console.error("init auth db failed:", err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await dbClient.destroy();
  });
