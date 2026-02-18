const knex = require("knex");
const { db } = require("./config");

const dbClient = knex({
  client: "mysql2",
  connection: db,
  pool: { min: 0, max: 10 },
});

async function healthCheck() {
  await dbClient.raw("SELECT 1");
}

module.exports = {
  dbClient,
  healthCheck,
};
