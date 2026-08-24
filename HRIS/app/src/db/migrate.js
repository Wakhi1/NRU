// Runs schema.sql against the configured MySQL database. Safe to re-run:
// CREATE TABLE statements use IF NOT EXISTS; CREATE INDEX failures because the
// index already exists (error 1061) are swallowed so the whole file can be replayed.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const env = require('../config/env');

const ER_DUP_KEYNAME = 1061;

async function ensureDatabase() {
  const conn = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    multipleStatements: false,
  });
  await conn.query(
    `CREATE DATABASE IF NOT EXISTS \`${env.db.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await conn.end();
}

function splitStatements(sql) {
  // Strip full-line SQL comments first — otherwise a statement immediately preceded by a
  // section-header comment (no blank statement between them) has the comment glued to its
  // front, fails the "not a comment" check below, and gets silently dropped.
  const withoutComments = sql
    .split('\n')
    .filter((line) => !/^\s*--/.test(line))
    .join('\n');

  return withoutComments
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function migrate() {
  await ensureDatabase();

  const conn = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.database,
  });

  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  const statements = splitStatements(sql);

  console.log(`[migrate] applying ${statements.length} statements to database "${env.db.database}"`);

  for (const statement of statements) {
    try {
      await conn.query(statement);
    } catch (err) {
      if (err.errno === ER_DUP_KEYNAME) {
        continue; // index already exists — fine on re-run
      }
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
