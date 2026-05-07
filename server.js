// =========================
// BACKEND NODE.JS PRO UPGRADED
// =========================
require("dotenv").config();

for (const key of ["DB_USER", "DB_PASSWORD", "DB_NAME", "SSH_LOCAL_PORT"]) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
}

const express = require("express");
const mysql = require("mysql2");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const cors = require("cors");
const { startTunnel } = require("./tunnel");

const app = express();
app.use(express.json());
app.use(cors());

// =========================
// CONFIG
// =========================
const JWT_SECRET = process.env.JWT_SECRET;

// =========================
// MYSQL CONNECTION
// =========================
const db = mysql.createConnection({
  host: "127.0.0.1",
  port: parseInt(process.env.SSH_LOCAL_PORT) || 3307,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

// =========================
// AUTH MIDDLEWARE
// =========================
const auth = (req, res, next) => {
  const header = req.headers["authorization"];
  if (!header) return res.status(401).send("No token");

  const token = header.split(" ")[1]; // Bearer TOKEN

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(401).send("Invalid token");
  }
};
app.use((req, res, next) => {
  console.log("➡️ REQUEST:", req.method, req.url);
  next();
});

// =========================
// ADMIN MIDDLEWARE
// =========================
const isAdmin = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).send("Admin only");
  }
  next();
};

// =========================
// REGISTER (ADMIN CREATION ONLY)
// =========================
app.post("/api/register", async (req, res) => {
  const { name, email, password, role } = req.body;

  const hash = await bcrypt.hash(password, 10);

  db.query(
    "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)",
    [name, email, hash, role || "user"],
    (err) => {
      if (err) return res.status(500).send(err);
      res.send("User created");
    }
  );
});

// =========================
// LOGIN (JWT + ROLE)
// =========================
app.post("/api/login", (req, res) => {
  const { email, password } = req.body;

  db.query("SELECT * FROM users WHERE email = ?", [email], async (err, results) => {
    if (err) return res.status(500).send(err);
    if (results.length === 0) return res.status(400).send("User not found");

    const user = results[0];

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).send("Wrong password");

    const token = jwt.sign(
      { id: user.id, role: user.role },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.send({
      token,
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
      },
    });
  });
});
// =========================
// CONTACT (FORMULAIRE SITE)
// =========================
const nodemailer = require("nodemailer");

app.post("/api/messages", (req, res) => {
  const { name, email, subject, message } = req.body;

  // 🔹 Validation simple
  if (!name || !email || !subject || !message) {
    return res.status(400).send("Tous les champs sont requis");
  }

  // 🔹 1. SAUVEGARDE EN BASE
  db.query(
    "INSERT INTO messages (name, email, subject, message, created_at) VALUES (?, ?, ?, ?, NOW())",
    [name, email, subject, message],
    (err) => {
      if (err) return res.status(500).send(err);

      // 🔹 2. CONFIG EMAIL
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: "tonemail@gmail.com",
          pass: "mot_de_passe_app", // ⚠️ important
        },
      });

      // 🔹 3. EMAIL HTML PRO
      const mailOptions = {
        from: `"Site Coeur à Coeur" <tonemail@gmail.com>`,
        to: "contact@coeuracoeur.com",
        subject: `📩 Nouveau message : ${subject}`,
        html: `
          <div style="font-family: Arial; padding:20px">
            <h2 style="color:#7d0b26;">Nouveau message reçu</h2>
            
            <p><strong>Nom :</strong> ${name}</p>
            <p><strong>Email :</strong> ${email}</p>
            <p><strong>Sujet :</strong> ${subject}</p>

            <hr/>

            <p><strong>Message :</strong></p>
            <p>${message}</p>

            <br/>
            <small>Envoyé depuis le site web</small>
          </div>
        `,
      };

      // 🔹 4. ENVOI EMAIL
      transporter.sendMail(mailOptions, (error) => {
        if (error) {
          console.error(error);
          return res.status(500).send("Email non envoyé");
        }

        res.send("Message envoyé + sauvegardé");
      });
    }
  );
});
// =========================
// DASHBOARD STATS (ADMIN)
// =========================
app.get("/api/admin/stats", auth, isAdmin, (req, res) => {
  const stats = {};

  db.query("SELECT COUNT(*) AS totalUsers FROM users", (err, users) => {
    if (err) return res.status(500).send(err);

    db.query("SELECT SUM(amount) AS totalDons FROM dons", (err, dons) => {
      if (err) return res.status(500).send(err);

      db.query("SELECT COUNT(*) AS totalProjects FROM projects", (err, projects) => {
        if (err) return res.status(500).send(err);

        stats.users = users[0].totalUsers;
        stats.dons = dons[0].totalDons || 0;
        stats.projects = projects[0].totalProjects;

        res.send(stats);
      });
    });
  });
});

// =========================
// USERS (ADMIN ONLY)
// =========================
app.get("/api/test-users", (req, res) => {
  db.query("SELECT * FROM users", (err, results) => {
    if (err) return res.status(500).send(err);
    res.send(results);
  });
});
app.post("/api/users", async (req, res) => {
  try {
    const { name, email, role, password } = req.body;

    if (!password) {
      return res.status(400).json("Mot de passe requis");
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    db.query(
      "INSERT INTO users (name, email, role, password) VALUES (?, ?, ?, ?)",
      [name, email, role, hashedPassword],
      (err, result) => {
        if (err) {
          console.log("SQL ERROR:", err);
          return res.status(500).json(err);
        }

        res.json("Utilisateur créé");
      }
    );

  } catch (err) {
    console.log("SERVER ERROR:", err);
    res.status(500).json("Erreur serveur");
  }
});
app.get("/api/users", auth, isAdmin, (req, res) => {
  db.query("SELECT id, name, email, role FROM users", (err, results) => {
    if (err) return res.status(500).send(err);
    res.send(results);
  });
});
app.put("/api/users/:id", async (req, res) => {
  try {
    const { name, email, role, password } = req.body;
    const { id } = req.params;

    let query = "UPDATE users SET name=?, email=?, role=?";
    let values = [name, email, role];

    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      query += ", password=?";
      values.push(hashedPassword);
    }

    query += " WHERE id=?";
    values.push(id);

    db.query(query, values, (err) => {
      if (err) {
        console.log("SQL ERROR:", err);
        return res.status(500).json(err);
      }

      res.json("Utilisateur mis à jour");
    });

  } catch (err) {
    console.log("SERVER ERROR:", err);
    res.status(500).json("Erreur serveur");
  }
});
app.delete("/api/users/:id", auth, isAdmin, (req, res) => {
  db.query("DELETE FROM users WHERE id = ?", [req.params.id], (err) => {
    if (err) return res.status(500).send(err);
    res.send("Deleted");
  });
});

// =========================
// DONATIONS
// =========================
app.post("/api/dons", (req, res) => {
  const { name, amount } = req.body;

  db.query(
    "INSERT INTO dons (name, amount, date) VALUES (?, ?, NOW())",
    [name, amount],
    (err) => {
      if (err) return res.status(500).send(err);
      res.send("Don ajouté");
    }
  );
});

app.get("/api/dons", auth, isAdmin, (req, res) => {
  db.query("SELECT * FROM dons ORDER BY date DESC", (err, results) => {
    if (err) return res.status(500).send(err);
    res.send(results);
  });
});

// =========================
// PROJECTS
// =========================

// CREATE PROJECT
app.post("/api/projects", auth, async (req, res) => {
  const { title, description, image } = req.body;

  const status = req.user.role === "admin" ? "approved" : "pending";

  await db.query(
    "INSERT INTO projects (title, description, image, author_id, status) VALUES (?, ?, ?, ?, ?)",
    [title, description, image, req.user.id, status]
  );

  res.json({ message: "Projet envoyé" });
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
  await db.query("DELETE FROM projects WHERE id=?", [req.params.id]);
  res.json({ message: "Deleted" });
});

// APPROVE PROJECT
app.put("/api/projects/:id/approve", auth, isAdmin, async (req, res) => {
  await db.query(
    "UPDATE projects SET status='approved' WHERE id=?",
    [req.params.id]
  );

  res.json({ message: "Projet validé" });
});
// =========================
// START SERVER
// =========================
async function main() {
  await startTunnel();

  await new Promise((resolve, reject) => {
    db.connect((err) => {
      if (err) return reject(err);
      console.log("✅ MySQL Connected...");
      resolve();
    });
  });

  const port = parseInt(process.env.PORT) || 5000;
  await new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      console.log(`🚀 Server PRO running on port ${port}`);
      resolve();
    });
    server.on("error", reject);
  });
}

main().catch((err) => {
  console.error("Startup failed:", err.message);
  process.exit(1);
});