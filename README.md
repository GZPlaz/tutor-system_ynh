# MindAccel Tutoring — YunoHost package (v4.1)

MindAccel runs as its **own YunoHost app**: its own Node.js service (`mindaccel`), its own PostgreSQL database, its own nginx entry and its own address. It no longer lives inside My Webapp.

```
sudo yunohost app install /path/to/mindaccel_ynh
```

## What's new in v4.1 — everything is free

All paywall features are gone: Stripe checkout, pay-per-session, packages and credits, monthly plans, *Admin → Payments*, *Plan & payments*, service prices and payment emails. Every service is free to book, with or without an account.

- **Nothing financial is deleted.** Past payments, plans, subscriptions and credits stay in the database as read-only history.
- **Migration `0005`** turns requests that were waiting for payment into normal free requests and retires queued payment emails. It is additive: no table or column is dropped.
- **Stripe keeps charging active subscriptions until you cancel them in the Stripe dashboard.** The upgrade and `mindaccel doctor` warn while any remain.
- The old `/billing` and `/admin/payments` addresses redirect.

## What's new in v4

| | |
|---|---|
| **Standalone app** | Proper YunoHost package: install, upgrade, backup/restore, change-url and remove all work through YunoHost. One Node service serves both the website and the API; nginx only forwards. Node.js 22 is installed and managed by YunoHost. |
| **Settings** (Admin → Settings) | New accounts: open or invitation-only, approval on/off, allowed email domains, email admins. Booking: account required or not, plus the scheduling rules that used to live in `.env`. Maintenance mode. |
| **Booking without an account** | Optional. Visitors book with a name and email and manage the booking through a private emailed link. Free services only. Signing up later keeps their history. |
| **Data migration** | `mindaccel import-legacy` / install-time "import from My Webapp": copies database, uploads and email settings, verifies row counts, never touches the old site. Re-runnable for the final cut-over. |
| **Database migration 0004** | Adds the guest flag. Additive only; applied automatically. |
| **Tools** | `mindaccel doctor`, `verify`, `create-admin`, `migrate`, `status`. |

See `doc/MIGRATION.md` for the move from My Webapp and `doc/ADMIN.md` for day-to-day administration.

## Layout

```
manifest.toml          what to ask, what resources YunoHost provisions
scripts/               install · upgrade · remove · backup · restore · change_url · _common.sh
conf/                  nginx.conf · systemd.service · import-legacy.sh · doctor.sh
doc/                   admin guide, migration guide, install/upgrade messages
app/server, app/client the application itself (Express 5 + Prisma + React)
```

## Developing the app itself

`app/server` and `app/client` are the same project as before: `npm ci && npm test` in `app/server` (37 unit tests), `npm run typecheck` in both.
