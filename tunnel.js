require("dotenv").config();
const { createTunnel } = require("tunnel-ssh");
const fs = require("fs");

async function startTunnel() {
  const localPort = parseInt(process.env.SSH_LOCAL_PORT) || 3307;

  const sshOptions = {
    host: process.env.SSH_HOST,
    port: parseInt(process.env.SSH_PORT) || 22,
    username: process.env.SSH_USER,
    ...(process.env.SSH_PRIVATE_KEY_PATH
      ? { privateKey: fs.readFileSync(process.env.SSH_PRIVATE_KEY_PATH) }
      : { password: process.env.SSH_PASSWORD }),
  };

  const forwardOptions = {
    srcAddr: "127.0.0.1",
    srcPort: localPort,
    dstAddr: process.env.DB_REMOTE_HOST || "127.0.0.1",
    dstPort: parseInt(process.env.DB_PORT) || 3306,
  };

  const [server] = await createTunnel(
    { autoClose: false },
    { host: "127.0.0.1", port: localPort },
    sshOptions,
    forwardOptions
  );

  server.on("error", (err) => {
    console.error("SSH tunnel error:", err.message);
    process.exit(1);
  });

  console.log(`✅ SSH tunnel open → 127.0.0.1:${localPort}`);
  return server;
}

module.exports = { startTunnel };
