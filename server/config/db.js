const mysql = require('mysql2/promise');

const configuredPort = process.env.DB_PORT;
const port = configuredPort === undefined ? undefined : Number(configuredPort);

if (configuredPort !== undefined && (!Number.isInteger(port) || port < 1 || port > 65535)) {
  throw new Error('DB_PORT must be an integer between 1 and 65535');
}

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});

async function testConnection() {
  let connection;

  try {
    connection = await pool.getConnection();
    await connection.ping();
    return true;
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

async function closePool() {
  await pool.end();
}

module.exports = {
  pool,
  testConnection,
  closePool,
};