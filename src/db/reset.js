// Setzt die Datenbank auf die Demodaten zurück: npm run reset
const { db } = require('./db');

(async () => {
  await db.migrate.rollback(undefined, true);
  await db.migrate.latest();
  await db.seed.run();
  console.log('Datenbank zurückgesetzt und Demodaten eingespielt.');
  await db.destroy();
})();
