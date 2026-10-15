# MindAccel Tutoring Platform

Scheduling, virtual-session and resource platform for MindAccel Tutoring — runs on a YunoHost **My Webapp** instance (`my_webapp__5`) with its PostgreSQL database.

**Deploying?** → [docs/DEPLOY_YUNOHOST.md](docs/DEPLOY_YUNOHOST.md) (install → configure SMTP → deploy → create admin → doctor).

| Doc | What's in it |
| --- | --- |
| [docs/DEPLOY_YUNOHOST.md](docs/DEPLOY_YUNOHOST.md) | Step-by-step deployment, releases & rollback, backups, troubleshooting |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Stack rationale, data model, RBAC, approvals, scheduling/timezones, email, billing, security, screens, tests |
| [server/prisma/schema.prisma](server/prisma/schema.prisma) | Data model (source of truth for the app) |
| [server/prisma/migrations/0001_init/migration.sql](server/prisma/migrations/0001_init/migration.sql) | Full PostgreSQL schema incl. anti-double-booking constraints |

## Features

- **Accounts & access:** student self-registration with admin approval; invited staff accounts; dynamic roles with selectable permissions; audit log.
- **Scheduling:** services, tutor weekly availability + time off, timezone/DST-correct slot finder, booking with database-enforced no-double-booking, cancellation cutoff, session outcomes.
- **Session Feed:** tutors post Google Meet links shortly before each session; students get a Join button and an email.
- **Resource Hub:** files (PDF, Office, media), links and videos in folders/tags, assigned to students or classes, with due dates.
- **Email (Google SMTP):** registration, approval/rejection, invites, password reset, booking confirmed/cancelled, 24 h + 1 h reminders, link posted, tutor nudge — via a retrying outbox.
- **Billing groundwork:** plans, subscriptions, payments, webhook idempotency, provider interface and entitlement checks (off until enabled).

## Stack

Node.js 24 LTS · Express 5 · TypeScript · Prisma · PostgreSQL · zod · Argon2id · Luxon · React 19 + Vite · nginx (YunoHost) · systemd

## Repository layout

```
mindaccel/
├── server/                    Express API
│   ├── prisma/                schema + SQL migrations
│   ├── .env.example           every setting, documented
│   └── src/
│       ├── config/ lib/ middleware/
│       ├── modules/           auth · users · rbac · scheduling · sessions · resources · email · billing · audit
│       ├── jobs/              email outbox, reminders, cleanup
│       └── cli/create-admin.ts
├── client/                    React SPA
│   └── src/{auth,components,lib,pages,pages/admin}
├── deploy/
│   ├── install.sh             one-time server setup
│   ├── deploy.sh              build → test → backup → migrate → switch → health check → auto-rollback
│   ├── create-admin.sh        bootstrap an administrator
│   ├── doctor.sh              end-to-end health & config check
│   ├── nginx/mindaccel.conf   API proxy + SPA deep links (My Webapp extension point)
│   └── systemd/mindaccel-api.service
└── docs/
```

## Local development

```bash
# API (needs a local PostgreSQL 13+)
cd server
cp .env.example .env     # NODE_ENV=development, APP_URL=http://localhost:5173, local DATABASE_URL, EMAIL_ENABLED=false
npm install
npx prisma migrate deploy
npm run dev              # http://127.0.0.1:3105/api/health
npm test                 # 18 unit tests
npm run build && node --env-file=.env dist/cli/create-admin.js you@example.com

# Web
cd ../client
npm install
npm run dev              # http://localhost:5173 (proxies /api → :3105)
```
