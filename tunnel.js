const { Client } = require("ssh2");
const net = require("net");
const fs = require("fs");

// TCP-only probe — confirms the port is open, not that MySQL is running.
// A non-MySQL process bound to the port will also return true.
function probeLocalMySQL(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false; // guard: error and close can both fire in sequence

    const done = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.on("connect", () => done(true));
    socket.on("error", () => done(false));
    socket.on("timeout", () => done(false));
    socket.connect(port, host);
  });
}

async function startTunnel() {
  const missing = ["SSH_HOST", "SSH_USER"].filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }

  if (!process.env.SSH_PRIVATE_KEY_PATH && !process.env.SSH_PASSWORD) {
    throw new Error("SSH auth requires either SSH_PRIVATE_KEY_PATH or SSH_PASSWORD");
  }

  const localPort = parseInt(process.env.SSH_LOCAL_PORT) || 3307;
  const remoteHost = process.env.DB_REMOTE_HOST || "127.0.0.1";
  const remotePort = parseInt(process.env.DB_PORT) || 3306;

  const connectOptions = {
    host: process.env.SSH_HOST,
    port: parseInt(process.env.SSH_PORT) || 22,
    username: process.env.SSH_USER,
    tryKeyboard: true,
    ...(process.env.SSH_PRIVATE_KEY_PATH
      ? {
          privateKey: (() => {
            try {
              return fs.readFileSync(process.env.SSH_PRIVATE_KEY_PATH);
            } catch (err) {
              throw new Error(
                `Could not read SSH private key at ${process.env.SSH_PRIVATE_KEY_PATH}: ${err.message}`
              );
            }
          })(),
        }
      : { password: process.env.SSH_PASSWORD }),
  };

  const sshClient = new Client();

  const server = net.createServer((localSocket) => {
    sshClient.forwardOut(
      "127.0.0.1", localPort,
      remoteHost, remotePort,
      (err, stream) => {
        if (err) { localSocket.destroy(); return; }
        localSocket.pipe(stream).pipe(localSocket);
        localSocket.on("error", () => stream.destroy());
        stream.on("error", () => localSocket.destroy());
      }
    );
  });

  await new Promise((resolve, reject) => {
    sshClient
      .on("ready", () => {
        server.listen(localPort, "127.0.0.1", () => {
          console.log(`✅ SSH tunnel open → 127.0.0.1:${localPort}`);
          resolve();
        });
      })
      .on("error", reject)
      .on("keyboard-interactive", (_name, _instructions, _lang, _prompts, finish) => {
        finish([process.env.SSH_PASSWORD]);
      })
      .connect(connectOptions);
  });

  server.on("error", (err) => {
    console.error("SSH tunnel error:", err.message);
    process.exit(1);
  });

  const cleanup = () => server.close(() => { sshClient.end(); process.exit(0); });
  process.once("SIGINT", cleanup);
  process.once("SIGTERM", cleanup);

  return server;
}

module.exports = { startTunnel, probeLocalMySQL };
