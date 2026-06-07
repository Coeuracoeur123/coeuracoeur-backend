require('dotenv').config();

const required = ['JWT_SECRET', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'SSH_LOCAL_PORT'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing required env vars: ${missing.join(', ')}`);
  process.exit(1);
}

module.exports = {
  JWT_SECRET:     process.env.JWT_SECRET,
  PORT:           parseInt(process.env.PORT) || 5000,
  DB_USER:        process.env.DB_USER,
  DB_PASSWORD:    process.env.DB_PASSWORD,
  DB_NAME:        process.env.DB_NAME,
  DB_LOCAL_PORT:  parseInt(process.env.DB_LOCAL_PORT) || 3306,
  SSH_LOCAL_PORT: parseInt(process.env.SSH_LOCAL_PORT) || 3307,
};
