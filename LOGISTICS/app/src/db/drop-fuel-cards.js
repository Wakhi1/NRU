// One-time cleanup: removes the fuel-card feature from an already-migrated database (product
// decision — cards were removed after the initial build). Drops the FK before the column before the
// table, since fuel_transaction.fuel_card_id references fuel_card.id. Safe to re-run — every step
// swallows "doesn't exist" errors (1091 drop FK, 1091/1054 drop column not present).
require('dotenv').config();
const mysql = require('mysql2/promise');

const ER_CANT_DROP_FIELD_OR_KEY = 1091;
const ER_BAD_FIELD_ERROR = 1054;

async function run() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD || '', database: process.env.DB_NAME,
  });

  try {
    await conn.query('ALTER TABLE fuel_transaction DROP FOREIGN KEY fk_fuel_card');
    console.log('[drop-fuel-cards] dropped fk_fuel_card');
  } catch (err) {
    if (err.errno !== ER_CANT_DROP_FIELD_OR_KEY) throw err;
    console.log('[drop-fuel-cards] fk_fuel_card already gone');
  }

  try {
    await conn.query('ALTER TABLE fuel_transaction DROP COLUMN fuel_card_id');
    console.log('[drop-fuel-cards] dropped fuel_transaction.fuel_card_id');
  } catch (err) {
    if (err.errno !== ER_BAD_FIELD_ERROR && err.errno !== ER_CANT_DROP_FIELD_OR_KEY) throw err;
    console.log('[drop-fuel-cards] fuel_card_id already gone');
  }

  await conn.query('DROP TABLE IF EXISTS fuel_card');
  console.log('[drop-fuel-cards] dropped fuel_card table');

  await conn.end();
}

run().catch((err) => {
  console.error('[drop-fuel-cards] error:', err.message);
  process.exit(1);
});
