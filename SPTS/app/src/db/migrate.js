// Runs schema.sql against the configured MySQL database. Safe to re-run: CREATE TABLE statements
// use IF NOT EXISTS; CREATE INDEX failures because the index already exists (1061) are swallowed.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const ER_DUP_KEYNAME = 1061;
const cfg = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD || '',
};

async function ensureDatabase() {
  const conn = await mysql.createConnection(cfg);
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.end();
}

function splitStatements(sql) {
  const withoutComments = sql.split('\n').filter((line) => !/^\s*--/.test(line)).join('\n');
  return withoutComments.split(/;\s*(?:\n|$)/).map((s) => s.trim()).filter((s) => s.length > 0);
}

async function migrate() {
  await ensureDatabase();
  const conn = await mysql.createConnection({ ...cfg, database: process.env.DB_NAME });
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  const statements = splitStatements(sql);
  console.log(`[migrate] applying ${statements.length} statements to database "${process.env.DB_NAME}"`);

  for (const statement of statements) {
    try {
      await conn.query(statement);
    } catch (err) {
      if (err.errno === ER_DUP_KEYNAME) continue;
      console.error('[migrate] failed statement:\n', statement);
      await conn.end();
      throw err;
    }
  }
  console.log('[migrate] done');
  await conn.end();
}

migrate().catch((err) => {
  console.error('[migrate] error:', err.message);
  process.exit(1);
});
