const mysql = require('mysql2/promise');
const env = require('../config/env');

const pool = mysql.createPool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,
});

async function query(sql, params) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

async function tx(work) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await work({
      query: async (sql, params) => {
        const [rows] = await conn.query(sql, params);
        return rows;
      },
    });
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// Real MySQL auto-parses native JSON-typed columns into JS objects/arrays, but MariaDB (e.g.
// XAMPP's default) stores JSON as plain TEXT under the hood and mysql2 returns it as a raw
// string — so code that does JSON.parse(row.some_json_col) works in dev (MariaDB) and throws
// `"[object Object]" is not valid JSON` in production (real MySQL) the moment a value is already
// an object. Always read a JSON column through this instead of calling JSON.parse directly.
function parseJsonColumn(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (e) {
    return fallback;
  }
}

module.exports = { pool, query, tx, parseJsonColumn };
