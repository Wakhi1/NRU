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

module.exports = { pool, query, tx };
