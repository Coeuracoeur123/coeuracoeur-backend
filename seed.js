const mysql = require("mysql2");
const bcrypt = require("bcryptjs");

const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  database: "coeur_db",
});

async function run() {
  const hash = await bcrypt.hash("123456", 10);

  db.query(
    "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)",
    ["Admin", "juliana", hash, "admin"],
    (err) => {
      if (err) console.log(err);
      else console.log("✅ Admin created");
      process.exit();
    }
  );
}

run();