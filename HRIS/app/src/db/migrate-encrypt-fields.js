// One-time migration: encrypt existing plaintext values in the columns that platform/crypto.js
// now protects (person.national_id/next_of_kin_phone, payline.bank_account/tax_number,
// app_user.totp_secret). Safe to re-run — decrypt() treats already-encrypted values as
// non-plaintext (fails the round-trip check) and skips them, so this only touches rows that are
// still genuinely plaintext. Not part of the normal migrate.js run since it's a one-time data
// migration, not a schema change.
const db = require('../platform/db');
const enc = require('../platform/crypto');

function looksAlreadyEncrypted(value) {
  if (!value) return false;
  // decrypt() returns the input unchanged when it can't parse it as our ciphertext format —
  // so "decrypt(x) !== x" is a reliable signal that x really was one of our ciphertexts already.
  return enc.decrypt(value) !== value;
}

async function migrateColumn(table, column, keyColumn) {
  const rows = await db.query(`SELECT ${keyColumn} AS id, ${column} AS val FROM ${table} WHERE ${column} IS NOT NULL AND ${column} != ''`);
  let migrated = 0;
  for (const row of rows) {
    if (looksAlreadyEncrypted(row.val)) continue;
    await db.query(`UPDATE ${table} SET ${column} = ? WHERE ${keyColumn} = ?`, [enc.encrypt(row.val), row.id]);
    migrated++;
  }
  console.log(`${table}.${column}: ${migrated} row(s) encrypted (${rows.length - migrated} already done or empty)`);
}

(async () => {
  await migrateColumn('person', 'national_id', 'employee_no');
  await migrateColumn('person', 'next_of_kin_phone', 'employee_no');
  await migrateColumn('payline', 'bank_account', 'id');
  await migrateColumn('payline', 'tax_number', 'id');
  await migrateColumn('app_user', 'totp_secret', 'id');
  console.log('Done.');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
