const { authProvider, authUsers, authUserTable } = require("./config");
const { dbClient } = require("./db");

type UserQueryFilters = {
  status?: string;
  role?: string;
  keyword?: string;
  limit?: number;
  offset?: number;
};

async function getUserFromEnv(username: string) {
  const user = authUsers.get(username);
  if (!user) return null;
  return {
    username: user.username,
    passwordHash: user.password,
    role: user.role,
    status: "active",
  };
}

async function getUserFromDb(username: string) {
  const row = await dbClient(authUserTable)
    .select("username", "password_hash", "role", "status", "avatar")
    .where({ username })
    .first();

  if (!row) return null;
  return {
    username: row.username,
    passwordHash: row.password_hash,
    role: row.role,
    status: row.status,
    avatar: row.avatar || null,
  };
}

async function getUserByUsername(username: string) {
  const normalized = String(username || "").trim();
  if (!normalized) return null;

  if (authProvider === "db") {
    return getUserFromDb(normalized);
  }

  return getUserFromEnv(normalized);
}

async function touchLastLogin(username: string) {
  if (authProvider !== "db") return;
  await dbClient(authUserTable).where({ username }).update({
    last_login_at: dbClient.fn.now(),
    updated_at: dbClient.fn.now(),
  });
}

function isDbAuthProvider() {
  return authProvider === "db";
}

function buildUserQuery(filters: UserQueryFilters = {}) {
  const query = dbClient(authUserTable);
  if (filters.status) query.where("status", filters.status);
  if (filters.role) query.where("role", filters.role);
  if (filters.keyword) query.where("username", "like", `%${filters.keyword}%`);
  return query;
}

async function listUsers(filters: UserQueryFilters = {}) {
  const query = buildUserQuery(filters)
    .select("id", "username", "role", "status", "avatar", "last_login_at", "created_at", "updated_at")
    .orderBy("id", "desc")
    .limit(filters.limit || 50)
    .offset(filters.offset || 0);

  return query;
}

async function countUsers(filters: UserQueryFilters = {}) {
  const row = await buildUserQuery(filters).count({ total: "*" }).first();
  return Number(row?.total || 0);
}

async function getUserDetail(username: string) {
  return dbClient(authUserTable)
    .select("id", "username", "role", "status", "avatar", "last_login_at", "created_at", "updated_at")
    .where({ username })
    .first();
}

async function updateAvatar(username: string, avatar: string) {
  return dbClient(authUserTable)
    .where({ username })
    .update({ avatar, updated_at: dbClient.fn.now() });
}

async function createUser({
  username,
  passwordHash,
  role,
  status,
}: {
  username: string;
  passwordHash: string;
  role: string;
  status: string;
}) {
  return dbClient(authUserTable).insert({
    username,
    password_hash: passwordHash,
    role,
    status,
    created_at: dbClient.fn.now(),
    updated_at: dbClient.fn.now(),
  });
}

async function updateUser(username: string, updates: Record<string, any>) {
  return dbClient(authUserTable)
    .where({ username })
    .update({
      ...updates,
      updated_at: dbClient.fn.now(),
    });
}

async function resetUserPassword(username: string, passwordHash: string) {
  return dbClient(authUserTable).where({ username }).update({
    password_hash: passwordHash,
    updated_at: dbClient.fn.now(),
  });
}

async function deleteUser(username: string) {
  return dbClient(authUserTable).where({ username }).del();
}

async function countActiveAdmins() {
  const row = await dbClient(authUserTable)
    .count({ total: "*" })
    .where({ role: "admin", status: "active" })
    .first();
  return Number(row?.total || 0);
}

module.exports = {
  isDbAuthProvider,
  listUsers,
  countUsers,
  getUserDetail,
  createUser,
  updateUser,
  updateAvatar,
  resetUserPassword,
  deleteUser,
  countActiveAdmins,
  getUserByUsername,
  touchLastLogin,
};

export {};
