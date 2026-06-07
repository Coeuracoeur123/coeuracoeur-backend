const mysql = require('mysql2/promise');

let pool = null;

function init(port) {
  const { DB_USER, DB_PASSWORD, DB_NAME } = require('../config/env');
  pool = mysql.createPool({
    host: '127.0.0.1',
    port,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
  });
}

function getDb() {
  if (!pool) throw new Error('Database not initialized. Call init(port) first.');
  return pool;
}

module.exports = { init, getDb };
