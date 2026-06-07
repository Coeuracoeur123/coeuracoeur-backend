require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');

const db = mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'coeur_db',
});

async function run() {
  const hash = await bcrypt.hash('123456', 10);
  db.query(
    'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
    ['Admin', 'juliana', hash, 'admin'],
    (err) => {
      if (err) console.log(err);
      else console.log('✅ Admin created');
      process.exit();
    }
  );
}

run();
