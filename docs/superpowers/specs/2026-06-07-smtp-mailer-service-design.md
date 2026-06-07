# SMTP Mailer Service — Design Spec

**Date:** 2026-06-07
**Scope:** Create a shared `src/services/mailer.js` module that sends email via the cPanel server's own Exim SMTP, and wire `subscribers.js` to use it. `messages.js` is not touched.

---

## Context

The VPS is cPanel shared hosting on Simafri. Exim is already running as the MTA — no new system service needs to be installed. A cPanel email account (`newsletter@coeuracoeur.com`) is created manually in cPanel and used as the sending identity. The backend connects to Exim on `mail.coeuracoeur.com:587` (STARTTLS) using those credentials.

The existing `messages.js` contact-form route uses its own inline Gmail transporter and is not changed.

---

## Pre-Requisite (Manual Step)

Before deploying, create the email account in cPanel:

> **cPanel → Email Accounts → Create**
> Address: `newsletter@coeuracoeur.com`
> Set a strong password — this becomes `SMTP_PASS` in `.env`

---

## New File

| Action | Path |
|--------|------|
| Create | `src/services/mailer.js` |
| Modify | `src/routes/subscribers.js` |
| Modify | `.env.example` |

No new npm dependencies — nodemailer is already installed.

---

## `src/services/mailer.js`

Creates a single nodemailer transporter at module load time using SMTP env vars. Exports one function: `sendMail({ to, subject, html })`.

```js
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false,        // STARTTLS on port 587
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

**Design notes:**
- `secure: false` with port 587 uses STARTTLS (correct for cPanel/Exim submission port)
- Transporter is created once at require-time — connection is reused across calls
- `SMTP_FROM` carries the full `Name <email>` string so callers never deal with it

---

## Changes to `src/routes/subscribers.js`

Remove the inline nodemailer transporter (`createTransporter()`, `sendConfirmationEmail()`, `sendWelcomeEmail()` as currently written). Replace with imports from `../services/mailer`.

**Before:**
```js
const nodemailer = require('nodemailer');
// ...
function createTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
  });
}
async function sendConfirmationEmail(email, token) {
  const link = `${process.env.APP_URL}/api/subscribe/confirm?token=${token}`;
  await createTransporter().sendMail({
    from: `Site <${process.env.MAIL_USER}>`,
    to: email,
    subject: 'Confirmez votre inscription',
    html: `<p>Bonjour,<br>Cliquez sur le lien ci-dessous pour confirmer votre inscription :<br><a href="${link}">${link}</a></p>`,
  });
}
async function sendWelcomeEmail(email, token) {
  const link = `${process.env.APP_URL}/api/unsubscribe?token=${token}`;
  await createTransporter().sendMail({
    from: `Site <${process.env.MAIL_USER}>`,
    to: email,
    subject: 'Inscription confirmée — Bienvenue !',
    html: `<p>Votre inscription est confirmée. Merci !<br>Pour vous désinscrire à tout moment :<br><a href="${link}">${link}</a></p>`,
  });
}
```

**After:**
```js
const { sendMail } = require('../services/mailer');
// ...
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
```

The `nodemailer` require and `createTransporter()` function are removed entirely from `subscribers.js`.

---

## Environment Variables

Add to `.env.example` (new `# ─── SMTP (cPanel)` section):

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

The existing `MAIL_USER` / `MAIL_PASS` vars remain in `.env.example` — they are still conceptually used by `messages.js` (even though it currently has hardcoded values).

---

## What Does NOT Change

- `src/routes/messages.js` — untouched, keeps its inline Gmail transporter
- All other route files — untouched
- `src/routes/subscribers.js` route handlers — business logic unchanged, only email-sending calls are updated
- No new npm dependencies
