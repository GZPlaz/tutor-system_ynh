# Moving from My Webapp to the standalone app

The new app is a separate YunoHost app with its own service, its own database and its own address. Moving is a **copy**: the old `my_webapp__5` site is only read, never changed, so you can test the new one side by side and keep the old one as a fallback.

## What is copied

| Copied | Notes |
|---|---|
| The whole database | People, passwords, roles, bookings, resources, classes, branding, email queue, activity log (and past payment records, kept as history) |
| Uploaded files | The Resource Hub's files and the logo |
| Email and scheduling settings | From the old `.env` (SMTP, booking rules, upload limit…) |

**Not copied (on purpose):** the login-signing secret, the database password, the web address and the port. Those are unique to each install, so **everyone signs in again once**; their passwords and bookings are unchanged.

## Why a copy, not a live link to the old database?

YunoHost creates one database per app and deletes it when that app is removed. If the new app pointed at `my_webapp__5`'s database, removing My Webapp later (or restoring a backup of it) would silently destroy the new app's data. A copy gives the new app a database of its own and lets you roll back for as long as you like. The installer then brings the copied database up to date (migrations `0004`–`0006`: site settings and guest bookings, removal of payment features, study packets). Payment records are kept as history; no people, bookings or resources are removed.

## Step by step

**1. Back up the old site (once, before anything else)**

```
sudo yunohost backup create --apps my_webapp__5
```

**2. Copy this package to the server and install it on a test address**

```
scp -r mindaccel_ynh  admin@your-server:/tmp/
sudo yunohost app install /tmp/mindaccel_ynh
```

Answer the questions: pick a *different* domain/path from the old site (for example `new.example.org`), keep "visitors" for access, and enter `my_webapp__5` for **Import data from an existing My Webapp instance**. (Non-interactive: add `--args "domain=new.example.org&path=/&init_main_permission=visitors&import_from=my_webapp__5"`.)

**3. Check the copy**

```
sudo mindaccel verify      # people / bookings / resources counts, migrations, uploaded files present
sudo mindaccel doctor      # service, web, email, leftover Stripe subscriptions
```

Sign in with an existing administrator account and click around: People, Sessions, Resources, **Admin → Settings**.

**4. Cut over when you're happy** — new bookings made on the old site after step 2 are not in the copy yet, so take a fresh copy at the moment you switch:

```
sudo systemctl stop mindaccel-api                                    # old site's service: no more changes
sudo mindaccel import-legacy --from my_webapp__5 --replace --copy-env
```

`--replace` makes a safety dump of the new app's current database first (`/home/yunohost.app/mindaccel/backups/`). The free study packets on the new app (the bundled ones and any you uploaded while testing) are kept: the import saves them before replacing the database and puts them back afterwards. Then give the new app the public address:

```
sudo yunohost app change-url my_webapp__5 -d old.example.org -p /   # move the old site out of the way
sudo yunohost app change-url mindaccel    -d app.example.org -p /   # the real address
```

**Payments are gone in this version — everything is free.** If the old site took payments, cancel every active subscription in the Stripe dashboard (Billing → Subscriptions) and delete the webhook endpoint there; `sudo mindaccel doctor` warns while any subscription is still active. Requests that were waiting for payment become normal free requests.

**5. Rollback** (if something is wrong): swap the two `change-url` commands and `sudo systemctl start mindaccel-api`. The old site and its data were never modified.

**6. Clean up** (after a few weeks, once you're sure): `sudo yunohost backup create --apps my_webapp__5`, then `sudo yunohost app remove my_webapp__5` and `sudo systemctl disable --now mindaccel-api`.

## If the import stops with an error

The installer stops before creating anything half-finished and YunoHost removes the partial install. Common causes: the old app id is mistyped (`yunohost app list`), or the old database isn't a MindAccel database. The error message says which; nothing on the old site is touched either way.

## Settings default to the old behaviour

After importing, **new accounts still need approval and an account is still needed to book** — exactly as before. Change either in **Admin → Settings** whenever you like.
