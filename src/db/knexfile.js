const path = require('path');

// SQLite für die lokale Entwicklung. Für den Produktivbetrieb genügt z. B.
// DB_CLIENT=pg DATABASE_URL=postgres://... (zusätzlich `npm i pg`).
module.exports = {
  client: process.env.DB_CLIENT || 'better-sqlite3',
  connection: process.env.DATABASE_URL || {
    filename: process.env.DB_FILE || path.join(__dirname, '..', '..', 'data', 'shop.sqlite'),
  },
  useNullAsDefault: true,
  migrations: { directory: path.join(__dirname, 'migrations') },
  seeds: { directory: path.join(__dirname, 'seeds') },
};
