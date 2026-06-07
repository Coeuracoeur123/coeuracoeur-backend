# Subscribers Feature — Design Spec

**Date:** 2026-06-07
**Scope:** Add a double opt-in email subscription system with token-based confirmation and unsubscribe, plus admin management endpoints.

---

## Table Schema

Already created in the database:

```sql
subscribers (
  id             INT PRIMARY KEY AUTO_INCREMENT,
  email          VARCHAR(100),
  subscribed_at  DATE,
  unsubscribed_at DATE,
  is_subscribed  BOOLEAN,
  token          VARCHAR(64)   -- added via ALTER TABLE
)
```

The `token` column serves two phases (see Token Lifecycle below).

---

## New File

One new file, following the existing `projects.js` pattern of co-locating public and admin routes for the same domain:

| Action | Path |
|--------|------|
| Create | `src/routes/subscribers.js` |
| Modify | `src/routes/index.js` — add `router.use(require('./subscribers'))` |
| Modify | `.env.example` — add `APP_URL=` |

---

## Token Lifecycle

The `token` column in `subscribers` serves two sequential phases:

### Phase 1 — Pending confirmation

`POST /api/subscribe` generates a 32-byte random hex token, stores it in `token`, and sends a confirmation email. The row has `is_subscribed = false`, `subscribed_at = NULL`.

### Phase 2 — Active subscription

`GET /api/subscribe/confirm?token=X` finds the row, sets `is_subscribed = true`, `subscribed_at = NOW()`, then **replaces** the token with a new random 32-byte hex token. This second token is the permanent unsubscribe token, included in the welcome email.

### Unsubscribed

`GET /api/unsubscribe?token=X` finds the row by the active unsubscribe token, sets `is_subscribed = false`, `unsubscribed_at = NOW()`, clears `token = NULL`.

---

## Endpoints

### Public

#### `POST /api/subscribe`
- Body: `{ email: string }`
- Validates email is present; returns 400 if missing.
- If email already exists with `is_subscribed = true`: return 200 silently (do not reveal subscription status).
- If email exists with `is_subscribed = false`: overwrite token with a fresh one and resend confirmation email.
- If email does not exist: insert row (`is_subscribed = false`, `subscribed_at = NULL`, `token = <random>`), send confirmation email.
- Success response: `{ message: "Confirmation email sent" }` (same response in all non-error cases).

#### `GET /api/subscribe/confirm?token=<token>`
- Looks up subscriber by `token` where `is_subscribed = false`.
- Not found or already confirmed: 400 `{ message: "Invalid or expired token" }`.
- Found: set `is_subscribed = true`, `subscribed_at = NOW()`, generate and store new token.
- Send welcome email containing the unsubscribe link.
- Response: `{ message: "Subscription confirmed" }`.

#### `GET /api/unsubscribe?token=<token>`
- Looks up subscriber by `token` where `is_subscribed = true`.
- Not found: 400 `{ message: "Invalid unsubscribe link" }`.
- Found: set `is_subscribed = false`, `unsubscribed_at = NOW()`, set `token = NULL`.
- Response: `{ message: "Unsubscribed successfully" }`.

### Admin (auth + isAdmin)

#### `GET /api/admin/subscribers`
- Returns all rows: `id, email, is_subscribed, subscribed_at, unsubscribed_at`.
- Ordered by `id DESC`.
- Does **not** return the `token` column.

#### `DELETE /api/admin/subscribers/:id`
- Hard-deletes the row (GDPR erasure).
- Response: `{ message: "Deleted" }`.

---

## Email Content

Both emails use nodemailer with Gmail, matching the pattern in `src/routes/messages.js`. The base URL for links is `process.env.APP_URL`.

### Confirmation email
- **To:** subscriber's email
- **Subject:** `"Confirmez votre inscription"`
- **Body:**
  ```
  Bonjour,
  Cliquez sur le lien ci-dessous pour confirmer votre inscription :
  <APP_URL>/api/subscribe/confirm?token=<token>
  ```

### Welcome + unsubscribe email
- **To:** subscriber's email
- **Subject:** `"Inscription confirmée — Bienvenue !"`
- **Body:**
  ```
  Votre inscription est confirmée. Merci !
  Pour vous désinscrire à tout moment :
  <APP_URL>/api/unsubscribe?token=<token>
  ```

---

## Token Generation

```js
const crypto = require('crypto');
const token = crypto.randomBytes(32).toString('hex'); // 64-char hex string
```

Uses Node.js built-in `crypto` — no new dependency.

---

## Environment Variables

One new variable added to `.env.example`:

```
APP_URL=https://api.coeuracoeur.com
```

Used to build confirmation and unsubscribe links in emails. Must be set in `.env` before the feature is used.

---

## What Does NOT Change

- No changes to any existing route files other than `src/routes/index.js` (adding one `router.use` line).
- No new npm dependencies.
- No changes to middleware, db module, or app.js.
- `token` column already added to the DB — no migration needed.
