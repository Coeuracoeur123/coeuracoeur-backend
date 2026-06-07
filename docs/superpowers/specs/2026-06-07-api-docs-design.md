# API Documentation — Design Spec

**Date:** 2026-06-07
**Scope:** Create a self-contained bilingual HTML API reference served at `GET /api-docs`, readable by both humans and AI scrapers without JavaScript.

---

## Files

| Action | Path |
|--------|------|
| Create | `public/api-docs.html` |
| Modify | `src/app.js` — add one static-serve line |

---

## Serving

In `src/app.js`, add before route mounting:

```js
app.use('/api-docs', express.static(path.join(__dirname, '..', 'public')));
```

`public/api-docs.html` is served at `GET /api-docs`. No new dependencies.

---

## Machine-Readability: 4 Layers

### Layer 1 — JSON-LD block (highest priority for AI scrapers)

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "WebAPI",
  "name": "Cœur à Cœur API",
  "url": "https://api.coeuracoeur.com",
  "endpoint": [ ...one object per endpoint... ]
}
</script>
```

Each endpoint object:
```json
{
  "method": "POST",
  "path": "/api/login",
  "auth": "none",
  "contentType": "application/json",
  "description": "Authenticate and receive a JWT token",
  "requestBody": { "email": "string", "password": "string" },
  "responses": {
    "200": { "token": "string", "user": { "id": "number", "name": "string", "role": "string" } },
    "400": "User not found | Wrong password"
  }
}
```

### Layer 2 — `data-*` attributes on `<article>` elements

```html
<article
  data-method="POST"
  data-path="/api/login"
  data-auth="none"
  data-content-type="application/json"
>
```

Values for `data-auth`: `"none"` | `"bearer"` | `"admin"`

### Layer 3 — Semantic HTML5

```
<html lang="fr-en">
  <head>
    <meta name="description" content="Cœur à Cœur REST API — 21 endpoints">
    <script type="application/ld+json">...</script>  ← Layer 1
  </head>
  <body>
    <nav aria-label="API sections">  ← anchor links per domain
    <main>
      <section id="{domain}" aria-labelledby="{domain}-heading">
        <h2 id="{domain}-heading">{Domain}</h2>
        <article data-method="..." data-path="..." data-auth="...">  ← Layer 2
          <h3><span class="badge method-{verb}">{VERB}</span> {path}</h3>
          <p class="description">{EN} / <small>{FR}</small></p>
          <table class="fields">...</table>
          <pre><code class="response-example">...</code></pre>
        </article>
      </section>
    </main>
  </body>
```

### Layer 4 — Visual design (inline CSS only)

- Dark sidebar (`#1a1a2e`) with domain anchor links
- White main area, card-style `<article>` per endpoint with subtle border
- Method badges: `GET`=#2ecc71, `POST`=#3498db, `PUT`=#e67e22, `DELETE`=#e74c3c
- Auth badges: `🌐 Public`, `🔑 Auth`, `🔒 Admin`
- Monospace `<pre><code>` blocks for JSON examples

---

## Language Pattern

- **Section headings, table headers, badge labels:** English
- **Endpoint description line:** `"English description / <small>Description française</small>"`
- **Field names and types:** English (they are code)
- **Page title and intro paragraph:** Bilingual

---

## Endpoint Inventory (21 endpoints)

### Health (1)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /health | none | Server health check |

### Authentication (2)
| Method | Path | Auth |
|--------|------|------|
| POST | /api/register | none |
| POST | /api/login | none |

**POST /api/register**
- Body: `{ name: string, email: string, password: string, role?: "user"|"admin" }`
- 200: `{ message: "User created" }`
- 500: error object

**POST /api/login**
- Body: `{ email: string, password: string }`
- 200: `{ token: string, user: { id: number, name: string, role: string } }`
- 400: `"User not found"` | `"Wrong password"`

### Users (4) — Admin only
| Method | Path | Auth |
|--------|------|------|
| GET | /api/users | admin |
| POST | /api/users | admin |
| PUT | /api/users/:id | admin |
| DELETE | /api/users/:id | admin |

**GET /api/users** → `[{ id, name, email, role }]`

**POST /api/users** → Body: `{ name, email, role, password }` → `{ message: "User created" }`

**PUT /api/users/:id** → Body: `{ name, email, role, password? }` → `{ message: "User updated" }`

**DELETE /api/users/:id** → `{ message: "Deleted" }`

### Projects (5) — Mixed auth
| Method | Path | Auth | Content-Type |
|--------|------|------|------|
| POST | /api/projects | bearer | multipart/form-data |
| GET | /api/projects | none | — |
| PUT | /api/projects/:id | bearer | multipart/form-data |
| DELETE | /api/projects/:id | admin | application/json |
| GET | /api/admin/projects | admin | — |

**POST /api/projects** → Form fields: `title`, `description`, `image` (file, optional) → `{ message: "Projet envoyé" }`. Status auto-set: `approved` if admin, `pending` if user.

**GET /api/projects** → `[{ id, title, description, image, author_id, status, created_at }]` (approved only)

**GET /api/admin/projects** → all projects regardless of status

**PUT /api/projects/:id** → Form fields: `title`, `description`, `image` (optional) → `{ message: "Projet modifié" }`

**DELETE /api/projects/:id** → `{ message: "Deleted" }`

### Donations (2) — Mixed auth
| Method | Path | Auth |
|--------|------|------|
| POST | /api/dons | none |
| GET | /api/dons | admin |

**POST /api/dons** → Body: `{ name: string, amount: number }` → `{ message: "Don ajouté" }`

**GET /api/dons** → `[{ id, name, amount, date }]`

### Messages (1) — Public
**POST /api/messages** → Body: `{ name, email, subject, message }` → `{ message: "Message envoyé" }`

### Subscribers (5) — Mixed auth
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | /api/subscribe | none | Triggers confirmation email |
| GET | /api/subscribe/confirm | none | Query: `?token=` |
| GET | /api/unsubscribe | none | Query: `?token=` |
| GET | /api/admin/subscribers | admin | — |
| DELETE | /api/admin/subscribers/:id | admin | GDPR erasure |

**POST /api/subscribe** → Body: `{ email: string }` → `{ message: "Confirmation email sent" }`

**GET /api/subscribe/confirm?token=X** → `{ message: "Subscription confirmed" }` | 400 `{ message: "Invalid or expired token" }`

**GET /api/unsubscribe?token=X** → `{ message: "Unsubscribed successfully" }` | 400 `{ message: "Invalid unsubscribe link" }`

**GET /api/admin/subscribers** → `[{ id, email, is_subscribed, subscribed_at, unsubscribed_at }]`

**DELETE /api/admin/subscribers/:id** → `{ message: "Deleted" }`

### Admin Stats (1)
**GET /api/admin/stats** (admin) → `{ users: number, dons: number, projects: number }`

---

## Authentication Header

For all `bearer` and `admin` endpoints:
```
Authorization: Bearer <token>
```

Token obtained from `POST /api/login`. Expires in 7 days.

---

## Base URL

```
https://api.coeuracoeur.com
```

---

## What Does NOT Change

- No new npm dependencies
- No changes to any route files
- `src/app.js` gets one new line
