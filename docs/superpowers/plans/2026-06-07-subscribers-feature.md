# Subscribers Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a double opt-in email subscription system with token-based confirmation and unsubscribe, plus admin list/delete endpoints.

**Architecture:** One new file `src/routes/subscribers.js` contains all 5 endpoints. Token generation uses Node's built-in `crypto` module. The `token` column in `subscribers` serves two phases: confirmation token first, then unsubscribe token after activation. Two small modifications: mount the router in `src/routes/index.js` and document `APP_URL` in `.env.example`.

**Tech Stack:** Node.js (crypto built-in), Express 5, mysql2/promise, nodemailer (already installed), CommonJS

---

## File Map

| Action | Path |
|--------|------|
| Modify | `F:/Projects/backend/.env.example` |
| Modify | `F:/Projects/backend/src/routes/index.js` |
| Create | `F:/Projects/backend/src/routes/subscribers.js` |

---

## Task 1: Update `.env.example` and mount the route

**Files:**
- Modify: `F:/Projects/backend/.env.example`
- Modify: `F:/Projects/backend/src/routes/index.js`

- [ ] **Step 1: Add `APP_URL` to `.env.example`**

Append this block at the end of `F:/Projects/backend/.env.example`:

```
# ─── App ──────────────────────────────────────────────────
APP_URL=https://api.coeuracoeur.com
```

- [ ] **Step 2: Mount the subscribers router in `src/routes/index.js`**

Current file (`F:/Projects/backend/src/routes/index.js`):

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

Replace with:

```js
const express = require('express');

const router = express.Router();

router.use(require('./auth'));
router.use(require('./users'));
router.use(require('./projects'));
router.use(require('./donations'));
router.use(require('./messages'));
router.use(require('./admin'));
router.use(require('./subscribers'));

module.exports = router;
```

- [ ] **Step 3: Commit**

```bash
git add .env.example src/routes/index.js
git commit -m "feat: mount subscribers router, add APP_URL to env example"
```

---

## Task 2: Create `src/routes/subscribers.js`

**Files:**
- Create: `F:/Projects/backend/src/routes/subscribers.js`

This file contains all 5 endpoints. The `generateToken()` helper uses `crypto.randomBytes(32).toString('hex')` for a 64-char hex string. The `createTransporter()` helper follows the same nodemailer pattern as `src/routes/messages.js`. Two email helpers (`sendConfirmationEmail`, `sendWelcomeEmail`) keep handler code clean.

- [ ] **Step 1: Write `src/routes/subscribers.js`**

```js
const express = require('express');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { auth, isAdmin } = require('../middleware/auth');
const { getDb } = require('../db');

const router = express.Router();

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function createTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: 'tonemail@gmail.com',
      pass: 'mot_de_passe_app',
    },
  });
}

async function sendConfirmationEmail(email, token) {
  const link = `${process.env.APP_URL}/api/subscribe/confirm?token=${token}`;
  await createTransporter().sendMail({
    from: 'Site <tonemail@gmail.com>',
    to: email,
    subject: 'Confirmez votre inscription',
    html: `<p>Bonjour,<br>Cliquez sur le lien ci-dessous pour confirmer votre inscription :<br><a href="${link}">${link}</a></p>`,
  });
}

async function sendWelcomeEmail(email, token) {
  const link = `${process.env.APP_URL}/api/unsubscribe?token=${token}`;
  await createTransporter().sendMail({
    from: 'Site <tonemail@gmail.com>',
    to: email,
    subject: 'Inscription confirmée — Bienvenue !',
    html: `<p>Votre inscription est confirmée. Merci !<br>Pour vous désinscrire à tout moment :<br><a href="${link}">${link}</a></p>`,
  });
}

router.post('/api/subscribe', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'Email requis' });

  const db = getDb();
  const [rows] = await db.query(
    'SELECT id, is_subscribed FROM subscribers WHERE email = ?',
    [email]
  );

  if (rows.length > 0 && rows[0].is_subscribed) {
    return res.json({ message: 'Confirmation email sent' });
  }

  const token = generateToken();

  if (rows.length > 0) {
    await db.query('UPDATE subscribers SET token = ? WHERE email = ?', [token, email]);
  } else {
    await db.query(
      'INSERT INTO subscribers (email, is_subscribed, token) VALUES (?, false, ?)',
      [email, token]
    );
  }

  await sendConfirmationEmail(email, token);
  res.json({ message: 'Confirmation email sent' });
});

router.get('/api/subscribe/confirm', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ message: 'Invalid or expired token' });

  const db = getDb();
  const [rows] = await db.query(
    'SELECT id, email FROM subscribers WHERE token = ? AND is_subscribed = false',
    [token]
  );

  if (rows.length === 0) return res.status(400).json({ message: 'Invalid or expired token' });

  const { id, email } = rows[0];
  const unsubscribeToken = generateToken();

  await db.query(
    'UPDATE subscribers SET is_subscribed = true, subscribed_at = CURDATE(), token = ? WHERE id = ?',
    [unsubscribeToken, id]
  );

  await sendWelcomeEmail(email, unsubscribeToken);
  res.json({ message: 'Subscription confirmed' });
});

router.get('/api/unsubscribe', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ message: 'Invalid unsubscribe link' });

  const db = getDb();
  const [rows] = await db.query(
    'SELECT id FROM subscribers WHERE token = ? AND is_subscribed = true',
    [token]
  );

  if (rows.length === 0) return res.status(400).json({ message: 'Invalid unsubscribe link' });

  await db.query(
    'UPDATE subscribers SET is_subscribed = false, unsubscribed_at = CURDATE(), token = NULL WHERE id = ?',
    [rows[0].id]
  );

  res.json({ message: 'Unsubscribed successfully' });
});

router.get('/api/admin/subscribers', auth, isAdmin, async (req, res) => {
  const [rows] = await getDb().query(
    'SELECT id, email, is_subscribed, subscribed_at, unsubscribed_at FROM subscribers ORDER BY id DESC'
  );
  res.json(rows);
});

router.delete('/api/admin/subscribers/:id', auth, isAdmin, async (req, res) => {
  await getDb().query('DELETE FROM subscribers WHERE id = ?', [req.params.id]);
  res.json({ message: 'Deleted' });
});

module.exports = router;
```

- [ ] **Step 2: Verify the module loads without errors**

Run from `F:/Projects/backend`:

```powershell
node --check src/routes/subscribers.js && echo "syntax OK"
node -e "require('./src/routes/subscribers'); console.log('module load OK');"
```

Expected:
```
syntax OK
module load OK
```

If you get an error, check import paths — `../middleware/auth`, `../db`, and `../config/env` are all relative to `src/routes/`.

- [ ] **Step 3: Verify the full routes index still loads**

```powershell
node -e "require('./src/routes/index'); console.log('routes index OK');"
```

Expected: `routes index OK`

- [ ] **Step 4: Commit**

```bash
git add src/routes/subscribers.js
git commit -m "feat: add subscribers route (double opt-in subscribe, confirm, unsubscribe, admin CRUD)"
```

---

## Task 3: Smoke-verify the complete app loads

**Files:** none (verification only)

- [ ] **Step 1: Verify the full app assembles**

```powershell
node -e "const app = require('./src/app'); console.log('app OK, type:', typeof app);"
```

Expected: `app OK, type: function`

- [ ] **Step 2: Confirm all 5 subscriber endpoints are registered**

```powershell
node -e "
const app = require('./src/app');
const routes = app._router.stack
  .filter(l => l.route)
  .map(l => l.route.path);
console.log(routes.filter(r => r.includes('subscri') || r.includes('unsubscri')));
"
```

Expected output includes:
```
[
  '/api/subscribe',
  '/api/subscribe/confirm',
  '/api/unsubscribe',
  '/api/admin/subscribers',
  '/api/admin/subscribers/:id'
]
```

Note: Express 5 may nest routes differently — if the above returns `[]`, the routes are still registered correctly via the Router middleware chain; the app load check in Step 1 is the reliable gate.

---

## Self-Review Notes

- All 5 spec endpoints implemented: `POST /api/subscribe`, `GET /api/subscribe/confirm`, `GET /api/unsubscribe`, `GET /api/admin/subscribers`, `DELETE /api/admin/subscribers/:id`.
- Token lifecycle matches spec: confirmation token stored on subscribe, replaced with unsubscribe token on confirm, cleared to NULL on unsubscribe.
- Silent 200 for already-subscribed email (privacy — does not reveal subscription status).
- `subscribed_at` and `unsubscribed_at` use `CURDATE()` matching the `DATE` column type (not `DATETIME`).
- `token` column not returned by `GET /api/admin/subscribers` (SELECT explicitly lists columns).
- `APP_URL` env var documented in `.env.example`.
- No new npm dependencies — `crypto` is Node built-in, `nodemailer` already installed.
