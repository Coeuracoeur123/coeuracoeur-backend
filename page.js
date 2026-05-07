require("dotenv").config();

for (const key of ["JWT_SECRET", "DB_USER", "DB_PASSWORD", "DB_NAME", "SSH_LOCAL_PORT"]) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
}

const express = require("express");
const mysql = require("mysql2/promise");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const cors = require("cors");
const nodemailer = require("nodemailer");
const { startTunnel } = require("./tunnel");

const app = express();
app.use(express.json());
app.use(cors({
  origin: "*",
  methods: "*",
  allowedHeaders: "*",
  exposedHeaders: "*",
  optionsSuccessStatus: 204,
}));
app.use("/uploads", express.static("uploads"));
const multer = require("multer");
const path = require("path");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({ storage });
// =========================
// CONFIG
// =========================
const JWT_SECRET = process.env.JWT_SECRET;

// =========================
// MYSQL CONNECTION (via SSH tunnel)
// =========================
let db;

// =========================
// MIDDLEWARE AUTH
// =========================
const auth = (req, res, next) => {
  const header = req.headers["authorization"];
  if (!header) return res.status(401).send("No token");

  const token = header.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(401).send("Invalid token");
  }
};

const isAdmin = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).send("Admin only");
  }
  next();
};

// =========================
// LOG REQUESTS
// =========================
app.use((req, res, next) => {
  console.log("➡️", req.method, req.url);
  next();
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// =========================
// AUTH
// =========================

// REGISTER
app.post("/api/register", async (req, res) => {
  const { name, email, password, role } = req.body;

  const hash = await bcrypt.hash(password, 10);

  try {
    await db.query(
      "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)",
      [name, email, hash, role || "user"]
    );

    res.json({ message: "User created" });
  } catch (err) {
    res.status(500).json(err);
  }
});

// LOGIN
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const [users] = await db.query(
      "SELECT * FROM users WHERE email=?",
      [email]
    );

    if (users.length === 0)
      return res.status(400).send("User not found");

    const user = users[0];

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).send("Wrong password");

    const token = jwt.sign(
      { id: user.id, role: user.role },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      user: { id: user.id, name: user.name, role: user.role },
    });
  } catch (err) {
    res.status(500).json(err);
  }
});

// =========================
// USERS (ADMIN)
// =========================

// GET USERS
app.get("/api/users", auth, isAdmin, async (req, res) => {
  const [rows] = await db.query(
    "SELECT id, name, email, role FROM users"
  );
  res.json(rows);
});

// CREATE USER
app.post("/api/users", auth, isAdmin, async (req, res) => {
  const { name, email, role, password } = req.body;

  const hash = await bcrypt.hash(password, 10);

  await db.query(
    "INSERT INTO users (name, email, role, password) VALUES (?, ?, ?, ?)",
    [name, email, role, hash]
  );

  res.json({ message: "User created" });
});

// UPDATE USER
app.put("/api/users/:id", auth, isAdmin, async (req, res) => {
  const { name, email, role, password } = req.body;

  let query = "UPDATE users SET name=?, email=?, role=?";
  let values = [name, email, role];

  if (password) {
    const hash = await bcrypt.hash(password, 10);
    query += ", password=?";
    values.push(hash);
  }

  query += " WHERE id=?";
  values.push(req.params.id);

  await db.query(query, values);

  res.json({ message: "User updated" });
});

// DELETE USER
app.delete("/api/users/:id", auth, isAdmin, async (req, res) => {
  await db.query("DELETE FROM users WHERE id=?", [req.params.id]);
  res.json({ message: "Deleted" });
});

// =========================
// PROJECTS
// =========================

// CREATE PROJECT
app.post("/api/projects", auth, upload.single("image"), async (req, res) => {
  try {
    const { title, description } = req.body;

    // récupérer le fichier
    const image = req.file ? `/uploads/${req.file.filename}` : null;

    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const status = req.user.role === "admin" ? "approved" : "pending";

    await db.query(
      "INSERT INTO projects (title, description, image, author_id, status) VALUES (?, ?, ?, ?, ?)",
      [title, description, image, req.user.id, status]
    );

    res.json({ message: "Projet envoyé" });
  } catch (err) {
    console.error("ERROR CREATE PROJECT:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET PUBLIC PROJECTS
app.get("/api/projects", async (req, res) => {
  const [rows] = await db.query(
    "SELECT * FROM projects WHERE status='approved' ORDER BY created_at DESC"
  );

  res.json(rows);
});

// ADMIN ALL PROJECTS
app.get("/api/admin/projects", auth, isAdmin, async (req, res) => {
  const [rows] = await db.query(
    "SELECT * FROM projects ORDER BY created_at DESC"
  );

  res.json(rows);
});

// DELETE PROJECT
app.delete("/api/projects/:id", auth, isAdmin, async (req, res) => {
  try {
    await db.query("DELETE FROM projects WHERE id=?", [req.params.id]);
    res.json({ message: "Deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/projects/:id", auth, upload.single("image"), async (req, res) => {
  try {
    const { title, description } = req.body;

    const image = req.file ? `/uploads/${req.file.filename}` : undefined;

    let query = "UPDATE projects SET title=?, description=?";
    let params = [title, description];

    if (image) {
      query += ", image=?";
      params.push(image);
    }

    query += " WHERE id=?";
    params.push(req.params.id);

    await db.query(query, params);

    res.json({ message: "Projet modifié" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});
/* APPROVE PROJECT
app.put("/api/projects/:id/approve", auth, isAdmin, async (req, res) => {
  await db.query(
    "UPDATE projects SET status='approved' WHERE id=?",
    [req.params.id]
  );

  res.json({ message: "Projet validé" });
}); */

// =========================
// DONATIONS
// =========================

app.post("/api/dons", async (req, res) => {
  const { name, amount } = req.body;

  await db.query(
    "INSERT INTO dons (name, amount, date) VALUES (?, ?, NOW())",
    [name, amount]
  );

  res.json({ message: "Don ajouté" });
});

app.get("/api/dons", auth, isAdmin, async (req, res) => {
  const [rows] = await db.query(
    "SELECT * FROM dons ORDER BY date DESC"
  );

  res.json(rows);
});

// =========================
// CONTACT FORM + EMAIL
// =========================

app.post("/api/messages", async (req, res) => {
  const { name, email, subject, message } = req.body;

  await db.query(
    "INSERT INTO messages (name,email,subject,message,created_at) VALUES (?,?,?,?,NOW())",
    [name, email, subject, message]
  );

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: "tonemail@gmail.com",
      pass: "mot_de_passe_app",
    },
  });

  await transporter.sendMail({
    from: "Site <tonemail@gmail.com>",
    to: "contact@coeuracoeur.com",
    subject: subject,
    html: `<p>${message}</p>`,
  });

  res.json({ message: "Message envoyé" });
});

// =========================
// ADMIN STATS
// =========================

app.get("/api/admin/stats", auth, isAdmin, async (req, res) => {
  const [users] = await db.query("SELECT COUNT(*) AS total FROM users");
  const [dons] = await db.query("SELECT SUM(amount) AS total FROM dons");
  const [projects] = await db.query("SELECT COUNT(*) AS total FROM projects");

  res.json({
    users: users[0].total,
    dons: dons[0].total || 0,
    projects: projects[0].total,
  });
});

// =========================
// START SERVER
// =========================
async function main() {
  await startTunnel();

  db = await mysql.createConnection({
    host: "127.0.0.1",
    port: parseInt(process.env.SSH_LOCAL_PORT) || 3307,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  console.log("✅ MySQL Connected...");

  const port = parseInt(process.env.PORT) || 5000;
  await new Promise((resolve, reject) => {
    const server = app.listen(port, "0.0.0.0", () => {
      console.log(`🚀 Backend PRO running on http://0.0.0.0:${port}`);
      resolve();
    });
    server.on("error", reject);
  });
}

main().catch((err) => {
  console.error("Startup failed:", err.message);
  process.exit(1);
});