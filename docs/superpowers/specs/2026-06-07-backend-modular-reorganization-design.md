# Backend Modular Reorganization — Design Spec

**Date:** 2026-06-07  
**Scope:** Consolidate duplicate server files, restructure backend into a modular `src/` layout, rename entry point to `main.js`.

---

## Problem

The backend currently has two server files with overlapping route definitions:

- `page.js` — the active entry point (`npm start` runs this). Uses `mysql2/promise`, async/await, multer for file uploads, and an SSH tunnel probe. This is the canonical version.
- `server.js` — an older duplicate. Uses callback-based `mysql2`, no multer, missing `isAdmin` guard on `PUT /api/users/:id`, and has a stale `/api/test-users` debug endpoint. `package.json`'s `"main"` field points here, conflicting with the `start` script.

All features live in a single 400-line `page.js` with no separation of concerns.

---

## Goals

1. Delete `server.js` — no features will be lost.
2. Distribute `page.js` content into focused modules under `src/`.
3. Create `main.js` as the sole entry point (startup orchestration only).
4. Fix `package.json` to point to `main.js`.
5. Move `tunnel.js` → `src/infrastructure/tunnel.js`.
6. Move `seed.js` → `scripts/seed.js`.

---

## Final Directory Structure

```
backend/
├── main.js                          # Entry point — startup orchestration only
├── scripts/
│   └── seed.js                      # One-off DB seed script (moved from root)
├── src/
│   ├── app.js                       # Express app: middleware + route mounting
│   ├── config/
│   │   └── env.js                   # Env validation + typed exports
│   ├── db/
│   │   └── index.js                 # mysql2/promise pool creation, exports `db`
│   ├── infrastructure/
│   │   └── tunnel.js                # SSH tunnel (moved from root, logic unchanged)
│   ├── middleware/
│   │   ├── auth.js                  # `auth` and `isAdmin` middleware
│   │   └── upload.js                # multer disk storage config, exports `upload`
│   └── routes/
│       ├── index.js                 # Mounts all routers, exports combined router
│       ├── auth.js                  # POST /api/register, POST /api/login
│       ├── users.js                 # GET/POST/PUT/DELETE /api/users
│       ├── projects.js              # /api/projects CRUD + GET /api/admin/projects
│       ├── donations.js             # GET/POST /api/dons
│       ├── messages.js              # POST /api/messages (DB save + email)
│       └── admin.js                 # GET /api/admin/stats
├── uploads/                         # Static file storage (unchanged)
├── .env
├── .env.example
└── package.json                     # main: "main.js", start: "node main.js"
```

---

## Module Responsibilities

### `main.js`
Startup orchestration only — no Express, no routes, no business logic.

Sequence:
1. Import `src/config/env.js` (validates env vars, crashes early if missing)
2. Call `probeLocalMySQL()` to check if local MySQL port is open
3. If not reachable → call `startTunnel()` to open SSH tunnel
4. Dynamically require `src/db/index.js` (after tunnel is up, so pool connects to the right port)
5. Call `db.getConnection()` + release to confirm DB is reachable
6. Import `src/app.js` and call `app.listen(PORT)`

### `src/app.js`
Creates and exports the Express app. Applies middleware in order:
1. `express.json()`
2. CORS (wildcard config)
3. `/uploads` static file serving
4. Request logger
5. Mount all routers from `src/routes/index.js`
6. Health check: `GET /health`

### `src/config/env.js`
Validates required env vars on import. Exports:
- `JWT_SECRET`, `PORT`
- `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- `DB_LOCAL_PORT`, `SSH_LOCAL_PORT`

Crashes with a descriptive error if any required var is missing.

### `src/db/index.js`
Creates a `mysql2/promise` connection pool using env config. Exports `db`.  
**Must be required after the tunnel is established** (called from inside `main.js`'s async function, not at top-level import time).

### `src/infrastructure/tunnel.js`
Moved from root. No logic changes. Exports `startTunnel` and `probeLocalMySQL`.

### `src/middleware/auth.js`
Exports two Express middleware functions:
- `auth` — verifies JWT from `Authorization: Bearer <token>`, attaches `req.user`
- `isAdmin` — checks `req.user.role === "admin"`, returns 403 otherwise

### `src/middleware/upload.js`
Configures multer disk storage (`uploads/` directory, timestamp filename). Exports `upload` (the multer instance).

### `src/routes/index.js`
Creates an Express Router. Mounts all domain routers:
- `/` → auth routes
- `/` → user routes
- `/` → project routes
- `/` → donation routes
- `/` → message routes
- `/api/admin` → admin routes

Exports the combined router.

### `src/routes/auth.js`
- `POST /api/register` — hash password, insert user
- `POST /api/login` — verify password, return JWT + user info

### `src/routes/users.js`
- `GET /api/users` — auth + isAdmin, list users
- `POST /api/users` — auth + isAdmin, create user
- `PUT /api/users/:id` — auth + isAdmin, update user (optional password rehash)
- `DELETE /api/users/:id` — auth + isAdmin, delete user

### `src/routes/projects.js`
- `POST /api/projects` — auth + upload, create project (status auto-set by role)
- `GET /api/projects` — public, approved projects only
- `GET /api/admin/projects` — auth + isAdmin, all projects
- `PUT /api/projects/:id` — auth + upload, update project
- `DELETE /api/projects/:id` — auth + isAdmin, delete project

### `src/routes/donations.js`
- `POST /api/dons` — public, insert donation
- `GET /api/dons` — auth + isAdmin, list donations

### `src/routes/messages.js`
- `POST /api/messages` — saves to DB, sends email via nodemailer (Gmail)

### `src/routes/admin.js`
- `GET /api/admin/stats` — auth + isAdmin, aggregate counts (users, donations total, projects)

### `scripts/seed.js`
Moved from root. Standalone script, does not use the app's module system. Uses `.env` directly.

---

## Dependency Flow (no circular imports)

```
main.js
  └── src/config/env.js
  └── src/infrastructure/tunnel.js
  └── src/db/index.js          ← src/config/env.js
  └── src/app.js
        └── src/middleware/auth.js    ← src/config/env.js (JWT_SECRET)
        └── src/middleware/upload.js
        └── src/routes/index.js
              └── src/routes/auth.js       ← src/db/index.js
              └── src/routes/users.js      ← src/db/index.js
              └── src/routes/projects.js   ← src/db/index.js
              └── src/routes/donations.js  ← src/db/index.js
              └── src/routes/messages.js   ← src/db/index.js
              └── src/routes/admin.js      ← src/db/index.js
```

---

## What Does NOT Change

- All API routes and their HTTP methods/paths stay identical
- All business logic (bcrypt hashing, JWT signing, multer upload handling) stays identical
- `tunnel.js` logic is unchanged — only moved to `src/infrastructure/`
- `uploads/` directory and static file serving behavior unchanged
- No new dependencies added

---

## Files to Delete

- `server.js` — duplicate, strictly worse than `page.js`
- `page.js` — content fully redistributed into modules

---

## `package.json` Changes

```json
{
  "main": "main.js",
  "scripts": {
    "start": "node main.js"
  }
}
```
