const knex = require('knex');
const config = require('./knexfile');

const db = knex(config);

// Migrationen ausführen und Demodaten einspielen, falls die Datenbank leer ist.
async function init() {
  await db.migrate.latest();
  const { count } = await db('users').count({ count: '*' }).first();
  if (Number(count) === 0) await db.seed.run();
}

module.exports = { db, init };
