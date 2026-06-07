const config = require('./src/config/env');
const { startTunnel, probeLocalMySQL } = require('./src/infrastructure/tunnel');

async function main() {
  const reachable = await probeLocalMySQL('127.0.0.1', config.DB_LOCAL_PORT, 500);

  let dbPort;
  if (reachable) {
    console.log('✅ Local MySQL reachable — skipping tunnel');
    dbPort = config.DB_LOCAL_PORT;
  } else {
    console.log('🔌 Local MySQL not reachable — starting SSH tunnel');
    await startTunnel();
    dbPort = config.SSH_LOCAL_PORT;
  }

  // Require db AFTER the tunnel is up so the pool connects to the correct port.
  // app.js (and its route modules) are required afterward — they get the
  // already-initialized pool from the CommonJS module cache.
  const { init: initDb, getDb } = require('./src/db');
  initDb(dbPort);
  const conn = await getDb().getConnection();
  conn.release();
  console.log('✅ MySQL Connected...');

  const app = require('./src/app');

  await new Promise((resolve, reject) => {
    const server = app.listen(config.PORT, '0.0.0.0', () => {
      console.log(`🚀 Backend running on http://0.0.0.0:${config.PORT}`);
      resolve();
    });
    server.on('error', reject);
  });
}

main().catch((err) => {
  console.error('Startup failed:', err.message);
  process.exit(1);
});
