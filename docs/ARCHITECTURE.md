# MindAccel — Architecture

## 1. Stack recommendation (and why)

**Node.js 24 LTS + Express 5 + TypeScript + Prisma + PostgreSQL, with a React (Vite) SPA.**

YunoHost's My Webapp is, by design, an nginx site that serves static files from
`/var/www/my_webapp__5/www/` (optionally PHP) plus a database. It does not run
application servers. The cleanest fit is therefore a split architecture:

| Layer | Runs as | Why it suits My Webapp |
| --- | --- | --- |
| React SPA | static files in `www/` | My Webapp serves it natively — no changes to the app's own nginx config |
| Express API | systemd service on `127.0.0.1:3105` | proxied at `<path>/api/` by a snippet in `my_webapp__5.d/`, the extension point My Webapp documents |
| PostgreSQL | YunoHost's server | already provisioned; credentials come from `yunohost app setting` |

Alternatives considered:

- **Next.js** — needs its Node server for SSR anyway, so it gains nothing here while adding framework coupling; SSR/SEO isn't needed behind a login.
- **Django** — excellent, but this team gets one language end-to-end with TypeScript (shared types/validation habits between API and UI).
- **NestJS** — strong for large teams; for a single-operator platform the module convention used here gives the same separation with less ceremony. Migrating later is mechanical because services are framework-free.

Key choices: **Express 5** (async errors propagate natively), **Prisma** (typed queries, migrations), **zod** (one validation idiom everywhere), **Argon2id** (OWASP-recommended hashing), **Luxon** (correct IANA timezone/DST math).

## 2. Request flow

```
Browser ──HTTPS──▶ nginx (YunoHost, TLS)
                    ├── <path>/            → www/ (SPA files; unknown paths → index.html)
                    └── <path>/api/*       → 127.0.0.1:3105 (Express)
Express: trust proxy → logging → helmet → rate limit → [billing webhooks: raw body]
         → JSON/cookies → /api/<module> router
         → authenticate (JWT + live status check) → requirePermission(...) → validate(zod)
         → service (business rules, ownership checks, transactions) → Prisma → PostgreSQL
         → errorHandler (uniform { error: { code, message, details } })
```

Every module follows **routes → service → Prisma**. Routes are thin (HTTP, validation, permission gate); services hold business rules and are framework-free so they can be reused by jobs, CLIs or a future framework.

## 3. Data model (summary)

Full DDL: `server/prisma/migrations/0001_init/migration.sql` (23 tables, validated on PostgreSQL 16 as a non-superuser owner, as YunoHost provisions it).

| Area | Tables |
| --- | --- |
| Identity & RBAC | `users`, `roles`, `permissions`, `role_permissions`, `user_roles`, `refresh_tokens`, `password_reset_tokens`, `audit_logs` |
| Scheduling | `services`, `tutor_services`, `availability_rules`, `availability_exceptions`, `bookings`, `session_feed_posts` |
| Resources | `groups` (classes), `group_members`, `resources`, `resource_assignments` |
| Email | `email_outbox` |
| Billing groundwork | `plans`, `subscriptions`, `payments`, `billing_events` |

Integrity the ORM can't express lives in SQL:

- `bookings_no_tutor_overlap` / `bookings_no_student_overlap` — GiST **exclusion constraints** on `tstzrange(starts_at, blocked_until)` for active bookings. Two simultaneous requests for the same slot cannot both succeed; the loser gets HTTP 409 `SLOT_TAKEN`. Cancelling frees the slot automatically.
- CHECK constraints for availability minutes, booking ranges, "assignment targets exactly one student or class", and "files need a storage key, links need a URL".

> When you change `schema.prisma`, generate the SQL with `npm run db:new-migration`, review it, save it as `prisma/migrations/000N_name/migration.sql`, and never drop the EXTRA INTEGRITY constraints.

## 4. Authentication & sessions

- **Passwords:** Argon2id (19 MiB, t=2). Unknown-email logins still run a hash to keep timing constant.
- **Access token:** HS256 JWT, 15 min, held in JS memory only (not localStorage).
- **Refresh token:** 48 random bytes in an `HttpOnly; Secure; SameSite=Strict` cookie scoped to `<path>/api/auth`; only its SHA-256 is stored. Rotated on each use; re-use of a rotated token revokes the whole family (stolen-token detection).
- **Revocation:** `users.token_version` is embedded in access tokens; bumping it (password change/reset, suspension) kills every live token instantly. `authenticate` also re-checks `status` on every request.
- **Brute force:** per-IP rate limit on credential endpoints + per-account lockout (5 failures → 15 min).
- **CSRF:** bearer-token endpoints are immune; cookie endpoints (refresh/logout) are SameSite=Strict plus an Origin check.

## 5. RBAC engine

```
permissions (catalog, from code) ◀── role_permissions ──▶ roles ◀── user_roles ──▶ users
```

- The **catalog** is `server/src/modules/rbac/permissions.ts`. On every boot `syncRbac()` upserts it, so adding a permission in code makes it appear in the admin role editor.
- **System roles** `admin`, `tutor`, `student` are created with sensible defaults. Admins may edit tutor/student permissions; `admin` is always re-granted everything so new features can't lock you out.
- **Custom roles** (e.g. "Parent observer" = `sessions:view_feed` + `resources:read_assigned`, or "Scheduler" = `bookings:read_any` + `bookings:manage_any`) are created in the UI (`/admin/roles`) or via `POST /api/rbac/roles`.
- Users can hold several roles; effective permissions are the union (cached 60 s per user, invalidated on any role change).
- Routes check **permissions, never role names**: `requirePermission(P.USERS_APPROVE)`. Record-level rules (`_own` vs `_any`) are enforced in services.
- Safety rails: can't delete system roles, can't delete a role still assigned, can't remove the last active admin.

## 6. Onboarding & approval workflow

```
Student registers ──▶ users.status = PENDING, role = student
                     ├─ email: "registration received" (student)
                     └─ email: "new registration" (everyone with users:approve)
Admin: POST /api/users/:id/approve ──▶ ACTIVE  + email "approved" + audit
       POST /api/users/:id/reject  ──▶ REJECTED + email (optional reason) + audit
Login before approval ──▶ 403 ACCOUNT_PENDING (UI shows a friendly explanation)
Staff-created accounts (tutors, custom roles) ──▶ ACTIVE immediately + "set your password" invite link
Suspend ──▶ SUSPENDED + all sessions revoked immediately
```

## 7. Scheduling & timezones

- **Everything is stored in UTC** (`TIMESTAMPTZ`). Each user has an IANA timezone.
- Tutors define a **weekly template** in *their own* timezone as wall-clock minutes (e.g. Mon 09:00–12:00 America/Chicago), plus **exceptions** (blackouts or extra hours).
- The **slot engine** (`modules/scheduling/slots.ts`, pure + unit-tested) expands the template per calendar date with Luxon — so 09:00 stays 09:00 across DST changes — then subtracts blackouts, existing bookings (incl. the service's buffer) and the student's own bookings, and applies minimum lead time, booking horizon and step size from `.env`.
- The API returns UTC; the SPA renders in the viewer's profile timezone. Emails render each recipient's own local time.
- Booking = application check (requested start must be a computed slot) + database guarantee (exclusion constraint).
- Students cancel up to `STUDENT_CANCEL_CUTOFF_HOURS` ahead; tutors/staff any time. Tutors record `COMPLETED`/`NO_SHOW`.

## 8. Virtual Session Feed

- `GET /api/sessions/feed` returns the caller's sessions (as student or tutor) with feed posts and UI hints (`canPostLink`, `isLive`).
- The tutor posts the Google Meet link from `MEETING_LINK_WINDOW_MIN` before start until the end. Links must match `https://meet.google.com/xxx-xxxx-xxx` (stops the feed being used to phish). Re-posting replaces the link. The student is emailed immediately.
- If no link is posted `MEETING_LINK_NUDGE_MIN` before start, the tutor gets a nudge email.
- The SPA polls every 30 s; moving to SSE later touches only the route and the page.

## 9. Resource Hub

- Types: `FILE` (uploaded), `LINK`, `VIDEO` (https only). Organised by `folder` path and `tags`.
- Files go to `UPLOAD_DIR` (**outside** `www/`) under random names, MIME-whitelisted and size-limited, and are only served via `GET /api/resources/:id/download` after an authorisation check.
- Assign to students and/or classes (`groups`), optional due date. Students see resources assigned directly or through any class they belong to.
- Storage is isolated in `storage.ts`; swapping to S3/MinIO changes one file.

## 10. Email (Google SMTP)

- Business code calls `enqueueEmail()` which writes to `email_outbox` **inside the same transaction** as the business change. The worker (every 15 s) sends via Nodemailer with `FOR UPDATE SKIP LOCKED`, retries with exponential backoff (6 attempts), and records errors.
- Templates (`modules/email/templates.ts`) are pure functions with HTML escaping: registration received, admin new registration, approved, rejected, invite, password reset, booking confirmed, booking cancelled, reminders (24 h / 1 h), meeting link posted, tutor link nudge.
- `EMAIL_ENABLED=false` logs emails instead of sending (useful in dev/staging).

## 11. Billing groundwork

- Tables: `plans` (price, interval, `features` = entitlement keys), `subscriptions`, `payments`, `billing_events` (webhook idempotency).
- `PaymentProvider` interface (`createCheckout`, `parseWebhook`, optional portal). Today: `NullProvider`. Adding Stripe/PayPal = implement the interface + set `BILLING_PROVIDER`.
- `requireEntitlement('sessions.book')` is **already on** the booking route and is a no-op while `BILLING_ENABLED=false`. Flip it on and students need a plan granting `sessions.book`; staff bypass.
- Webhooks are mounted before the JSON parser so signatures can be verified against the raw body. `services.price_cents` and `payments.booking_id` allow pay-per-session later.

## 12. Security checklist

- [x] Argon2id hashing, lockout, rate limits, timing-safe login
- [x] Short-lived JWT + rotating hashed refresh tokens with reuse detection
- [x] Permission-gated routes + ownership checks in services; 404 (not 403) for unreadable resources
- [x] zod validation on every input; unknown fields stripped
- [x] Helmet headers; `trust proxy` set for nginx; API bound to 127.0.0.1
- [x] Uploads outside web root, random names, MIME whitelist, path-traversal guard
- [x] Secrets only in `app/shared/.env` (0600); logs redact auth headers/cookies/passwords
- [x] systemd sandboxing (read-only system, write access only to `uploads/`)
- [x] Audit log for approvals, role/permission changes, cancellations, link posts
- [ ] Optional next: TOTP 2FA for admins, CSP header for the SPA, Sentry/uptime monitoring

## 13. Extending the platform

| Task | Where |
| --- | --- |
| New permission | `rbac/permissions.ts` → guard route with `requirePermission(P.X)` → restart |
| New feature module | `src/modules/<name>/{name.routes.ts,name.service.ts}` → one line in `modules/index.ts` |
| New email | add renderer to `email/templates.ts` → `enqueueEmail(to, 'key', payload)` |
| New background job | add to `JOBS` in `jobs/scheduler.ts` (keep it idempotent) |
| Booking rules | `.env` (lead time, horizon, step, cutoff) or `scheduling.service.ts` |
| Payments | implement `PaymentProvider` in `billing/providers.ts` |

## 14. API surface

| Module | Endpoints |
| --- | --- |
| `/api/auth` | `POST register, login, refresh, logout, logout-all, forgot-password, reset-password` · `GET/PATCH me` · `POST me/password` |
| `/api/users` | `GET /`, `GET /:id`, `POST /` (invite), `POST /:id/approve|reject|suspend|reactivate`, `PUT /:id/roles` |
| `/api/rbac` | `GET permissions`, `GET/POST roles`, `PATCH/DELETE roles/:id` |
| `/api/scheduling` | `services` CRUD + `PUT services/:id/tutors` · `availability/:tutorId` (+ `/rules`, `/exceptions`) · `GET slots` · `bookings` list (`scope`, `from`/`to`, `status`, `order`)/get/create · `POST bookings/:id/cancel|outcome` |
| `/api/sessions` | `GET feed` · `POST /:bookingId/meeting-link` · `POST /:bookingId/notes` |
| `/api/resources` | list/create/update/delete · `GET /:id/download` · `POST /:id/assign` · `DELETE /:id/assignments/:aid` |
| `/api/groups` | list/create · `PUT /:id/members` · delete |
| `/api/billing` | `GET plans`, `GET me`, `POST checkout`, `POST plans`, `POST webhooks/:provider` |
| `/api/audit` | `GET /` |
| `/api/health` | DB ping |
| `/api/config` | public, non-secret settings the UI displays (lead time, cutoff, upload limit, billing on/off) |

## 15. Frontend

React 19 SPA (Vite), no UI framework — one stylesheet with design tokens (`client/src/styles.css`, light/dark, responsive down to phones).

| Screen | Route | Gated by |
| --- | --- | --- |
| Dashboard (next sessions, shortcuts, approval count) | `/` | signed in |
| Session Feed (join / post Meet link, auto-refresh) | `/sessions` | `sessions:view_feed` |
| Book (service → tutor slots in your timezone → note → confirm) | `/book` | `bookings:create` |
| Bookings (upcoming/past, cancel, tutor outcome; "Everyone" for staff) | `/bookings` | `bookings:read_own` / `_any` |
| Availability (weekly hours editor, time off / extra hours) | `/availability` | `availability:manage_own` / `_any` |
| Resources (assigned to me; library: upload, links, folders, tags, assign) | `/resources` | `resources:*` |
| Classes (groups of students) | `/classes` | `groups:manage` |
| Profile (name, timezone, password, sign out everywhere) | `/profile` | signed in |
| Billing (shown only when `BILLING_ENABLED=true`) | `/billing` | `billing:read_own` |
| Approvals · Users · Services · Roles · Audit | `/admin/*` | `users:approve` · `users:read` · `services:manage` · `roles:manage` · `audit:read` |

Pages share `components/ui.tsx` (`useApi`, `useAction`, `Modal`, `Tabs`, `Badge`…). Navigation and routes are generated from permissions, so custom roles get the right menu automatically.

## 16. Testing & verification

- `cd server && npm test` — 18 unit tests: slot engine (DST in both directions, spring-forward gap, midnight end, date-limited rules, extra hours, blackouts, buffers, lead time, horizon, a tutor across the date line), email templates (render all, HTML-escaping, no double-escaping), RBAC catalog consistency. `deploy.sh` runs them on every release and refuses to ship on failure.
- `npm run typecheck` in `server/` and `client/` — strict TypeScript; `npm run build` type-checks too, so a type error can never go live.
- The SQL migration has been applied to PostgreSQL 16 as a non-superuser owner; the exclusion constraints were exercised (overlap rejected, buffer enforced, cancelled slot re-bookable).
