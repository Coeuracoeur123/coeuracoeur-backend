# Backend Modular Reorganization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redistribute the monolithic `page.js` into focused modules under `src/`, delete the duplicate `server.js`, and establish `main.js` as the sole entry point.

**Architecture:** `main.js` handles startup orchestration only (tunnel probe → DB init → server start). All Express logic lives in `src/app.js`. Each domain (auth, users, projects, donations, messages, admin) has its own route file. The DB pool is initialized in `main.js` after the tunnel is confirmed up, then accessed by route handlers via `getDb()` from `src/db/index.js`.

**Tech Stack:** Node.js, Express 5, mysql2/promise, bcryptjs, jsonwebtoken, multer, nodemailer, ssh2 (via tunnel.js), dotenv

---

## File Map

| Action | Path |
|--------|------|
| Create | `src/config/env.js` |
| Move (no changes) | `tunnel.js` → `src/infrastructure/tunnel.js` |
| Create | `src/db/index.js` |
| Create | `src/middleware/auth.js` |
| Create | `src/middleware/upload.js` |
| Create | `src/routes/auth.js` |
| Create | `src/routes/users.js` |
| Create | `src/routes/projects.js` |
| Create | `src/routes/donations.js` |
| Create | `src/routes/messages.js` |
| Create | `src/routes/admin.js` |
| Create | `src/routes/index.js` |
| Create | `src/app.js` |
| Create | `main.js` |
| Move + update | `seed.js` → `scripts/seed.js` |
| Modify | `package.json` |
| Delete | `server.js` |
| Delete | `page.js` |

---

## Task 1: Create directories and `src/config/env.js`

**Files:**
- Create: `src/config/env.js`

- [ ] **Step 1: Create the directory structure**

```powershell
New-Item -ItemType Directory -Force src/config, src/db, src/infrastructure, src/middleware, src/routes, scripts
```

Expected: directories created (no error if already exist)

- [ ] **Step 2: Write `src/config/env.js`**

```js
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
```

- [ ] **Step 3: Verify the module loads without crashing (env must be set)**

```powershell
node -e "const c = require('./src/config/env'); console.log('PORT:', c.PORT);"
```

Expected: prints `PORT: 5000` (or your configured port). If it crashes with "Missing required env vars", check your `.env` file.

- [ ] **Step 4: Commit**

```bash
git add src/config/env.js
git commit -m "refactor: add src/config/env.js for env validation and exports"
```

---

## Task 2: Move `tunnel.js` → `src/infrastructure/tunnel.js`

**Files:**
- Create: `src/infrastructure/tunnel.js` (copy of `tunnel.js` — zero logic changes)

- [ ] **Step 1: Copy tunnel.js to new location**

```powershell
Copy-Item tunnel.js src/infrastructure/tunnel.js
```

- [ ] **Step 2: Verify the copy is identical**

```powershell
(Get-FileHash tunnel.js).Hash -eq (Get-FileHash src/infrastructure/tunnel.js).Hash
```

Expected: `True`

- [ ] **Step 3: Commit the new file (do NOT delete the original yet — page.js still imports it)**

```bash
git add src/infrastructure/tunnel.js
git commit -m "refactor: copy tunnel.js to src/infrastructure/tunnel.js"
```

---

## Task 3: Create `src/db/index.js`

**Files:**
- Create: `src/db/index.js`

The pool is NOT created at require time. `init(port)` creates it once `main.js` has determined the correct port. Route handlers call `getDb()` to access the pool.

- [ ] **Step 1: Write `src/db/index.js`**

```js
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
```

- [ ] **Step 2: Verify the module loads without errors**

```powershell
node -e "const db = require('./src/db'); console.log('db exports:', Object.keys(db));"
```

Expected: `db exports: [ 'init', 'getDb' ]`

- [ ] **Step 3: Commit**

```bash
git add src/db/index.js
git commit -m "refactor: add src/db/index.js with lazy pool init"
```

---

## Task 4: Create `src/middleware/auth.js` and `src/middleware/upload.js`

**Files:**
- Create: `src/middleware/auth.js`
- Create: `src/middleware/upload.js`

- [ ] **Step 1: Write `src/middleware/auth.js`**

```js
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/env');

const auth = (req, res, next) => {
  const header = req.headers['authorization'];
  if (!header) return res.status(401).send('No token');
  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(401).send('Invalid token');
  }
};

const isAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') return res.status(403).send('Admin only');
  next();
};

module.exports = { auth, isAdmin };
```

- [ ] **Step 2: Write `src/middleware/upload.js`**

```js
const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)),
});

const upload = multer({ storage });

module.exports = upload;
```

- [ ] **Step 3: Verify both load**

```powershell
node -e "const {auth,isAdmin}=require('./src/middleware/auth'); console.log('auth ok');"
node -e "const u=require('./src/middleware/upload'); console.log('upload ok');"
```

Expected: both print `ok` with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/middleware/auth.js src/middleware/upload.js
git commit -m "refactor: add auth and upload middleware modules"
```

---

## Task 5: Create `src/routes/auth.js`

**Files:**
- Create: `src/routes/auth.js`

- [ ] **Step 1: Write `src/routes/auth.js`**

```js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/env');
const { getDb } = require('../db');

const router = express.Router();

router.post('/api/register', async (req, res) => {
  const { name, email, password, role } = req.body;
  const hash = await bcrypt.hash(password, 10);
  try {
    await getDb().query(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      [name, email, hash, role || 'user']
    );
    res.json({ message: 'User created' });
  } catch (err) {
    res.status(500).json(err);
  }
});

router.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const [users] = await getDb().query('SELECT * FROM users WHERE email=?', [email]);
    if (users.length === 0) return res.status(400).send('User not found');
    const user = users[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).send('Wrong password');
    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, name: user.name, role: user.role } });
  } catch (err) {
    res.status(500).json(err);
  }
});

module.exports = router;
```

- [ ] **Step 2: Verify it loads**

```powershell
node -e "require('./src/routes/auth'); console.log('auth routes ok');"
```

Expected: `auth routes ok` (no crash — getDb is not called at load time)

- [ ] **Step 3: Commit**

```bash
git add src/routes/auth.js
git commit -m "refactor: add src/routes/auth.js (register + login)"
```

---

## Task 6: Create `src/routes/users.js`

**Files:**
- Create: `src/routes/users.js`

- [ ] **Step 1: Write `src/routes/users.js`**

```js
const express = require('express');
const bcrypt = require('bcryptjs');
const { auth, isAdmin } = require('../middleware/auth');
const { getDb } = require('../db');

const router = express.Router();

router.get('/api/users', auth, isAdmin, async (req, res) => {
  const [rows] = await getDb().query('SELECT id, name, email, role FROM users');
  res.json(rows);
});

router.post('/api/users', auth, isAdmin, async (req, res) => {
  const { name, email, role, password } = req.body;
  const hash = await bcrypt.hash(password, 10);
  await getDb().query(
    'INSERT INTO users (name, email, role, password) VALUES (?, ?, ?, ?)',
    [name, email, role, hash]
  );
  res.json({ message: 'User created' });
});

router.put('/api/users/:id', auth, isAdmin, async (req, res) => {
  const { name, email, role, password } = req.body;
  let query = 'UPDATE users SET name=?, email=?, role=?';
  let values = [name, email, role];
  if (password) {
    const hash = await bcrypt.hash(password, 10);
    query += ', password=?';
    values.push(hash);
  }
  query += ' WHERE id=?';
  values.push(req.params.id);
  await getDb().query(query, values);
  res.json({ message: 'User updated' });
});

router.delete('/api/users/:id', auth, isAdmin, async (req, res) => {
  await getDb().query('DELETE FROM users WHERE id=?', [req.params.id]);
  res.json({ message: 'Deleted' });
});

module.exports = router;
```

- [ ] **Step 2: Verify it loads**

```powershell
node -e "require('./src/routes/users'); console.log('users routes ok');"
```

Expected: `users routes ok`

- [ ] **Step 3: Commit**

```bash
git add src/routes/users.js
git commit -m "refactor: add src/routes/users.js (admin user CRUD)"
```

---

## Task 7: Create `src/routes/projects.js`

**Files:**
- Create: `src/routes/projects.js`

- [ ] **Step 1: Write `src/routes/projects.js`**

```js
const express = require('express');
const { auth, isAdmin } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { getDb } = require('../db');

const router = express.Router();

router.post('/api/projects', auth, upload.single('image'), async (req, res) => {
  try {
    const { title, description } = req.body;
    const image = req.file ? `/uploads/${req.file.filename}` : null;
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const status = req.user.role === 'admin' ? 'approved' : 'pending';
    await getDb().query(
      'INSERT INTO projects (title, description, image, author_id, status) VALUES (?, ?, ?, ?, ?)',
      [title, description, image, req.user.id, status]
    );
    res.json({ message: 'Projet envoyé' });
  } catch (err) {
    console.error('ERROR CREATE PROJECT:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/projects', async (req, res) => {
  const [rows] = await getDb().query(
    "SELECT * FROM projects WHERE status='approved' ORDER BY created_at DESC"
  );
  res.json(rows);
});

router.get('/api/admin/projects', auth, isAdmin, async (req, res) => {
  const [rows] = await getDb().query('SELECT * FROM projects ORDER BY created_at DESC');
  res.json(rows);
});

router.put('/api/projects/:id', auth, upload.single('image'), async (req, res) => {
  try {
    const { title, description } = req.body;
    const image = req.file ? `/uploads/${req.file.filename}` : undefined;
    let query = 'UPDATE projects SET title=?, description=?';
    let params = [title, description];
    if (image) {
      query += ', image=?';
      params.push(image);
    }
    query += ' WHERE id=?';
    params.push(req.params.id);
    await getDb().query(query, params);
    res.json({ message: 'Projet modifié' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/api/projects/:id', auth, isAdmin, async (req, res) => {
  try {
    await getDb().query('DELETE FROM projects WHERE id=?', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
```

- [ ] **Step 2: Verify it loads**

```powershell
node -e "require('./src/routes/projects'); console.log('projects routes ok');"
```

Expected: `projects routes ok`

- [ ] **Step 3: Commit**

```bash
git add src/routes/projects.js
git commit -m "refactor: add src/routes/projects.js (project CRUD + admin list)"
```

---

## Task 8: Create `src/routes/donations.js`

**Files:**
- Create: `src/routes/donations.js`

- [ ] **Step 1: Write `src/routes/donations.js`**

```js
const express = require('express');
const { auth, isAdmin } = require('../middleware/auth');
const { getDb } = require('../db');

const router = express.Router();

router.post('/api/dons', async (req, res) => {
  const { name, amount } = req.body;
  await getDb().query(
    'INSERT INTO dons (name, amount, date) VALUES (?, ?, NOW())',
    [name, amount]
  );
  res.json({ message: 'Don ajouté' });
});

router.get('/api/dons', auth, isAdmin, async (req, res) => {
  const [rows] = await getDb().query('SELECT * FROM dons ORDER BY date DESC');
  res.json(rows);
});

module.exports = router;
```

- [ ] **Step 2: Verify it loads**

```powershell
node -e "require('./src/routes/donations'); console.log('donations routes ok');"
```

Expected: `donations routes ok`

- [ ] **Step 3: Commit**

```bash
git add src/routes/donations.js
git commit -m "refactor: add src/routes/donations.js"
```

---

## Task 9: Create `src/routes/messages.js`

**Files:**
- Create: `src/routes/messages.js`

- [ ] **Step 1: Write `src/routes/messages.js`**

```js
const express = require('express');
const nodemailer = require('nodemailer');
const { getDb } = require('../db');

const router = express.Router();

router.post('/api/messages', async (req, res) => {
  const { name, email, subject, message } = req.body;
  await getDb().query(
    'INSERT INTO messages (name,email,subject,message,created_at) VALUES (?,?,?,?,NOW())',
    [name, email, subject, message]
  );
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: 'tonemail@gmail.com',
      pass: 'mot_de_passe_app',
    },
  });
  await transporter.sendMail({
    from: 'Site <tonemail@gmail.com>',
    to: 'contact@coeuracoeur.com',
    subject,
    html: `<p>${message}</p>`,
  });
  res.json({ message: 'Message envoyé' });
});

module.exports = router;
```

- [ ] **Step 2: Verify it loads**

```powershell
node -e "require('./src/routes/messages'); console.log('messages routes ok');"
```

Expected: `messages routes ok`

- [ ] **Step 3: Commit**

```bash
git add src/routes/messages.js
git commit -m "refactor: add src/routes/messages.js (contact form + email)"
```

---

## Task 10: Create `src/routes/admin.js` and `src/routes/index.js`

**Files:**
- Create: `src/routes/admin.js`
- Create: `src/routes/index.js`

- [ ] **Step 1: Write `src/routes/admin.js`**

```js
const express = require('express');
const { auth, isAdmin } = require('../middleware/auth');
const { getDb } = require('../db');

const router = express.Router();

router.get('/api/admin/stats', auth, isAdmin, async (req, res) => {
  const [users]    = await getDb().query('SELECT COUNT(*) AS total FROM users');
  const [dons]     = await getDb().query('SELECT SUM(amount) AS total FROM dons');
  const [projects] = await getDb().query('SELECT COUNT(*) AS total FROM projects');
  res.json({
    users:    users[0].total,
    dons:     dons[0].total || 0,
    projects: projects[0].total,
  });
});

module.exports = router;
```

- [ ] **Step 2: Write `src/routes/index.js`**

```js
const express = require('express');

const router = express.Router();

router.use(require('./auth'));
router.use(require('./users'));
router.use(require('./projects'));
router.use(require('./donations'));
router.use(require('./messages'));
router.use(require('./admin'));

module.exports = router;
```

- [ ] **Step 3: Verify both load**

```powershell
node -e "require('./src/routes/admin'); console.log('admin routes ok');"
node -e "require('./src/routes/index'); console.log('routes index ok');"
```

Expected: both print `ok`

- [ ] **Step 4: Commit**

```bash
git add src/routes/admin.js src/routes/index.js
git commit -m "refactor: add src/routes/admin.js and routes/index.js"
```

---

## Task 11: Create `src/app.js`

**Files:**
- Create: `src/app.js`

- [ ] **Step 1: Write `src/app.js`**

```js
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(express.json());
app.use(cors({
  origin: '*',
  methods: '*',
  allowedHeaders: '*',
  exposedHeaders: '*',
  optionsSuccessStatus: 204,
}));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

app.use((req, res, next) => {
  console.log('➡️', req.method, req.url);
  next();
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use(require('./routes'));

module.exports = app;
```

- [ ] **Step 2: Verify it loads**

```powershell
node -e "const app = require('./src/app'); console.log('app ok, type:', typeof app);"
```

Expected: `app ok, type: function`

- [ ] **Step 3: Commit**

```bash
git add src/app.js
git commit -m "refactor: add src/app.js (Express setup and route mounting)"
```

---

## Task 12: Create `main.js`

**Files:**
- Create: `main.js`

`main.js` requires `src/db` dynamically (inside the async function, after the tunnel is established) so the pool is created with the correct port. Then it requires `src/app` — at that point, all route files that `require('../db')` will receive the already-initialized pool from the CommonJS module cache.

- [ ] **Step 1: Write `main.js`**

```js
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
```

- [ ] **Step 2: Commit**

```bash
git add main.js
git commit -m "refactor: add main.js as entry point (startup orchestration)"
```

---

## Task 13: Move `seed.js` → `scripts/seed.js` and fix `package.json`

**Files:**
- Create: `scripts/seed.js`
- Modify: `package.json`

- [ ] **Step 1: Write `scripts/seed.js`** (updated to load `.env` from repo root)

```js
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
```

- [ ] **Step 2: Update `package.json`**

Change `"main"` and the `"start"` script to point to `main.js`:

```json
{
  "name": "backend",
  "version": "1.0.0",
  "description": "",
  "main": "main.js",
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1",
    "start": "node main.js",
    "seed": "node scripts/seed.js"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "type": "commonjs",
  "dependencies": {
    "bcrypt": "^6.0.0",
    "bcryptjs": "^3.0.3",
    "cors": "^2.8.6",
    "dotenv": "^17.4.2",
    "express": "^5.2.1",
    "jsonwebtoken": "^9.0.3",
    "multer": "^2.1.1",
    "mysql2": "^3.22.0",
    "nodemailer": "^8.0.5",
    "tunnel-ssh": "^5.2.0"
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add scripts/seed.js package.json
git commit -m "refactor: move seed.js to scripts/, fix package.json entry point to main.js"
```

---

## Task 14: Smoke test — verify the new entry point starts correctly

No commit in this task — it is verification only.

- [ ] **Step 1: Start the server with the new entry point**

```powershell
node main.js
```

Expected console output (in order):
```
✅ Local MySQL reachable — skipping tunnel
```
or
```
🔌 Local MySQL not reachable — starting SSH tunnel
✅ SSH tunnel open → 127.0.0.1:3307
```
then:
```
✅ MySQL Connected...
🚀 Backend running on http://0.0.0.0:5000
```

If startup fails, check the error message — most likely causes:
- Missing env var → check `.env` file
- DB connection refused → check tunnel or MySQL service
- Port already in use → stop the old server first

- [ ] **Step 2: Hit the health endpoint**

```powershell
Invoke-RestMethod http://localhost:5000/health
```

Expected: `{ "status": "ok" }`

- [ ] **Step 3: Hit the public projects endpoint**

```powershell
Invoke-RestMethod http://localhost:5000/api/projects
```

Expected: a JSON array (empty or populated — no 500 error)

- [ ] **Step 4: Hit a protected endpoint without a token (should 401)**

```powershell
Invoke-RestMethod http://localhost:5000/api/users
```

Expected: HTTP 401 response

- [ ] **Step 5: Stop the server (Ctrl+C) before proceeding**

---

## Task 15: Delete `server.js` and `page.js`

Do this only after Task 14's smoke test passes.

**Files:**
- Delete: `server.js`
- Delete: `page.js`
- Delete: `tunnel.js` (original, now at `src/infrastructure/tunnel.js`)

- [ ] **Step 1: Delete the old files**

```powershell
Remove-Item server.js, page.js, tunnel.js
```

- [ ] **Step 2: Verify the server still starts**

```powershell
node main.js
```

Expected: same output as Task 14, Step 1. If it crashes, `page.js` or `server.js` had an import you missed — check the error message.

- [ ] **Step 3: Stop the server (Ctrl+C)**

- [ ] **Step 4: Commit**

```bash
git add -u
git commit -m "refactor: delete server.js, page.js, tunnel.js (superseded by src/ modules)"
```

---

## Self-Review Notes

- All 7 API domains from `page.js` are covered: auth, users, projects, donations, messages, admin stats, admin projects.
- `PUT /api/users/:id` now has the `isAdmin` guard (it was missing in `server.js` but present in `page.js` — preserved correctly).
- The `/api/test-users` debug endpoint from `server.js` is intentionally dropped.
- The commented-out `PUT /api/projects/:id/approve` from `page.js` remains not implemented (same as source).
- `ssh2` dependency was in `tunnel.js` (via `require('ssh2')`). It's still used in `src/infrastructure/tunnel.js` — no package.json change needed.
- `tunnel-ssh` is listed in `package.json` dependencies but is not used in `tunnel.js` (which uses `ssh2` directly). This was already the case before — leave it unchanged.
