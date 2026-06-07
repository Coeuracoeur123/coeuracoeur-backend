# SMTP Mailer Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the inline Gmail transporter in `subscribers.js` with a shared `src/services/mailer.js` module that sends via the cPanel server's own Exim SMTP.

**Architecture:** A single `src/services/mailer.js` creates a nodemailer transporter at module load time using `SMTP_*` env vars, and exports `sendMail({ to, subject, html })`. `subscribers.js` drops its inline nodemailer code and imports `sendMail` instead. `messages.js` is not touched.

**Tech Stack:** Node.js, nodemailer (already installed), cPanel/Exim SMTP on port 587 (STARTTLS)

---

## File Map

| Action | Path |
|--------|------|
| Create | `F:/Projects/backend/src/services/mailer.js` |
| Modify | `F:/Projects/backend/src/routes/subscribers.js` |
| Modify | `F:/Projects/backend/.env.example` |

---

## Task 1: Create `src/services/mailer.js` and document SMTP env vars

**Files:**
- Create: `F:/Projects/backend/src/services/mailer.js`
- Modify: `F:/Projects/backend/.env.example`

- [ ] **Step 1: Create the services directory and write `src/services/mailer.js`**

```powershell
New-Item -ItemType Directory -Force F:/Projects/backend/src/services
```

Then write `F:/Projects/backend/src/services/mailer.js`:

```js
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function sendMail({ to, subject, html }) {
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject,
    html,
  });
}

module.exports = { sendMail };
```

- [ ] **Step 2: Append SMTP vars to `.env.example`**

Append this block at the end of `F:/Projects/backend/.env.example`:

```
# ─── SMTP (cPanel) ────────────────────────────────────────
# Use the cPanel mail server for newsletter / subscription emails.
# Create the email account in cPanel → Email Accounts first.
SMTP_HOST=mail.coeuracoeur.com
SMTP_PORT=587
SMTP_USER=newsletter@coeuracoeur.com
SMTP_PASS=your_cpanel_email_password
SMTP_FROM=Newsletter Cœur à Cœur <newsletter@coeuracoeur.com>
```

- [ ] **Step 3: Verify the module loads**

Run from `F:/Projects/backend`:

```powershell
node --check src/services/mailer.js && echo "syntax OK"
node -e "const m = require('./src/services/mailer'); console.log('exports:', Object.keys(m));"
```

Expected:
```
syntax OK
exports: [ 'sendMail' ]
```

- [ ] **Step 4: Commit**

```bash
git add src/services/mailer.js .env.example
git commit -m "feat: add src/services/mailer.js for cPanel SMTP, document SMTP env vars"
```

---

## Task 2: Update `src/routes/subscribers.js` to use the mailer service

**Files:**
- Modify: `F:/Projects/backend/src/routes/subscribers.js`

Replace the entire file content with the version below. The only changes are:
- Remove `const nodemailer = require('nodemailer')`
- Remove `createTransporter()` function
- Add `const { sendMail } = require('../services/mailer')`
- Rewrite `sendConfirmationEmail` and `sendWelcomeEmail` to call `sendMail()` directly
- All route handlers and DB logic are **identical** to the current file

- [ ] **Step 1: Write the updated `src/routes/subscribers.js`**

```js
const express = require('express');
const crypto = require('crypto');
const { auth, isAdmin } = require('../middleware/auth');
const { getDb } = require('../db');
const { sendMail } = require('../services/mailer');

const router = express.Router();

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function sendConfirmationEmail(email, token) {
  const link = `${process.env.APP_URL}/api/subscribe/confirm?token=${token}`;
  await sendMail({
    to: email,
    subject: 'Confirmez votre inscription',
    html: `<p>Bonjour,<br>Cliquez sur le lien ci-dessous pour confirmer votre inscription :<br><a href="${link}">${link}</a></p>`,
  });
}

async function sendWelcomeEmail(email, token) {
  const link = `${process.env.APP_URL}/api/unsubscribe?token=${token}`;
  await sendMail({
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

- [ ] **Step 2: Verify the module loads**

```powershell
node --check src/routes/subscribers.js && echo "syntax OK"
node -e "require('./src/routes/subscribers'); console.log('load OK');"
```

Expected:
```
syntax OK
load OK
```

- [ ] **Step 3: Verify nodemailer is no longer imported directly in subscribers.js**

```powershell
Select-String -Path src/routes/subscribers.js -Pattern "nodemailer"
```

Expected: **no output** (zero matches — nodemailer must not appear in the file)

- [ ] **Step 4: Verify messages.js is untouched**

```powershell
Select-String -Path src/routes/messages.js -Pattern "nodemailer"
```

Expected: **at least one match** (messages.js must still use nodemailer directly)

- [ ] **Step 5: Commit**

```bash
git add src/routes/subscribers.js
git commit -m "refactor: use shared mailer service in subscribers.js, remove inline Gmail transporter"
```

---

## Self-Review Notes

- All spec requirements covered:
  - `src/services/mailer.js` created with `sendMail({ to, subject, html })` ✅
  - Transporter uses `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` ✅
  - `secure: false` + port 587 = STARTTLS for cPanel/Exim ✅
  - `subscribers.js` uses `sendMail`, removes inline nodemailer ✅
  - `messages.js` not modified ✅
  - SMTP vars documented in `.env.example` ✅
- `MAIL_USER` / `MAIL_PASS` remain in `.env.example` — not removed (messages.js conceptually uses them)
- No new npm dependencies
