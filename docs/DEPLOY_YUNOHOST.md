# Deploying on YunoHost "My Webapp" (instance 5)

Assumes `my_webapp__5` exists **with a PostgreSQL database**. All commands run over SSH as a YunoHost admin with `sudo`.

**The short version**

```bash
# once
sudo bash /var/www/my_webapp__5/app/incoming/mindaccel/deploy/install.sh
sudo nano /var/www/my_webapp__5/app/shared/.env            # Google SMTP settings
# every release
sudo bash <deploy-dir>/deploy.sh                            # newest zip in app/incoming/
sudo bash <deploy-dir>/create-admin.sh gabez@mindaccel.org  # first time only
sudo bash <deploy-dir>/doctor.sh                            # verify everything
```

## Where things live

```
/var/www/my_webapp__5/                  (created by My Webapp)
├── www/                                SPA — served by My Webapp's nginx
├── uploads/                            Resource Hub files (NOT web-accessible)
└── app/
    ├── incoming/                       drop release zips here (SFTP: /app/incoming/)
    ├── releases/20261015-090000/       one folder per deploy (last 3 kept)
    ├── current  → releases/…           what's live (the API runs from here)
    ├── previous → releases/…           instant rollback target
    └── shared/
        ├── .env                        secrets (0600, owner my_webapp__5)
        ├── locks/                      saved package-lock.json files (reproducible builds)
        └── backups/                    automatic pg_dump before every migration (last 10)

/etc/systemd/system/mindaccel-api.service
/etc/nginx/conf.d/<domain>.d/my_webapp__5.d/mindaccel.conf    API proxy + SPA deep links
```

The API runs as the instance's own user `my_webapp__5`, listens only on `127.0.0.1:3105`, and is reached at `<your-url>/api/`.

## 0. Check the instance (2 min)

```bash
sudo yunohost app info my_webapp__5
sudo yunohost app setting my_webapp__5 domain     # e.g. app.mindaccel.org
sudo yunohost app setting my_webapp__5 path       # "/" recommended
sudo yunohost app setting my_webapp__5 db_name    # should print my_webapp__5
```

Recommendations:

- Install at the **root of a dedicated subdomain** (e.g. `app.mindaccel.org`, path `/`). Sub-paths work, but a root install is simplest. To move it: `sudo yunohost app change-url my_webapp__5 -d app.mindaccel.org -p /`, then re-run `install.sh` and update `APP_URL` in `.env`.
- Choose **PHP "none"** for this instance if you can.
- The site must be **public** (students don't have YunoHost accounts); `install.sh` sets this.

## 1. Upload the release zip

With any SFTP client (FileZilla, WinSCP, Cyberduck) — host = your server, user `my_webapp__5`, the instance's SFTP password — upload `mindaccel-tutoring.zip` into **`/app/incoming/`**.

> Before `install.sh` has run, `/app/incoming` doesn't exist yet. For the very first time, upload the zip anywhere you can reach over SSH (e.g. your admin home folder) and unzip it there to get the `deploy/` scripts:
> `unzip mindaccel-tutoring.zip -d ~/mindaccel-release`

Using Git instead? Clone anywhere and pass the folder to `deploy.sh`.

## 2. One-time setup

```bash
sudo bash ~/mindaccel-release/mindaccel/deploy/install.sh
# custom port if 3105 is taken:  sudo PORT=3205 bash .../install.sh
```

Installs Node.js 24 LTS (NodeSource) if needed plus `unzip`/`rsync`/build tools, creates the folders above, writes `app/shared/.env` (DB credentials from YunoHost, random 64-char JWT secret, email **off**), installs the systemd unit and nginx snippet, reloads nginx, registers `mindaccel-api` in YunoHost's Services panel, and makes the site public. Safe to re-run; it never overwrites `.env`.

## 3. Configure Google SMTP

1. In the sending Google account (ideally a Workspace mailbox like `notifications@mindaccel.org`): enable **2-Step Verification**, then create an **App password**.
2. `sudo nano /var/www/my_webapp__5/app/shared/.env`:

```ini
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=notifications@mindaccel.org
SMTP_PASS=abcdefghijklmnop          # 16-char app password, no spaces
MAIL_FROM="MindAccel Tutoring <notifications@mindaccel.org>"
EMAIL_ENABLED=true
```

`MAIL_FROM` must be that account (or a verified "Send mail as" alias). Review the scheduling rules in the same file too (`BOOKING_MIN_LEAD_HOURS`, `STUDENT_CANCEL_CUTOFF_HOURS`, `MEETING_LINK_WINDOW_MIN`, …). Restart after edits: `sudo systemctl restart mindaccel-api`.

## 4. Deploy

```bash
sudo bash ~/mindaccel-release/mindaccel/deploy/deploy.sh ~/mindaccel-tutoring.zip      # first time: path to the zip you uploaded
# later releases: upload the new zip to /app/incoming/ then simply
sudo bash /var/www/my_webapp__5/app/current/deploy/deploy.sh
```

What happens — and what protects you:

| Step | If it fails |
| --- | --- |
| Unpack into a new `releases/<timestamp>/` | Refuses anything that isn't this project |
| Install deps, generate Prisma client, **full TypeScript type-check & build** | Aborts; release folder deleted; live site untouched |
| **Unit tests** (slot engine/timezones, email templates, RBAC catalog) | Same — aborts, nothing changed |
| Build the SPA for your URL path | Same |
| **`pg_dump` backup** → `shared/backups/` | Aborts before touching the DB |
| `prisma migrate deploy` | Aborts; backup path printed |
| Switch `current`, publish SPA (new assets first, `index.html` last), restart API | — |
| Health check (30 s) | **Automatic rollback** to the previous release (code + SPA) |

The first deploy takes a few minutes (dependency download, including Prisma's engine binaries). Lockfiles from each successful build are saved and reused, so later builds install exactly the same versions.

## 5. First administrator

```bash
sudo bash /var/www/my_webapp__5/app/current/deploy/create-admin.sh gabez@mindaccel.org
```

Prints a one-time **set-password link** (valid 24 h). Open it, choose a password, sign in.

## 6. Verify

```bash
sudo bash /var/www/my_webapp__5/app/current/deploy/doctor.sh
```

Checks public access, Node version, live/rollback releases, `.env` (permissions, `APP_URL` matches the real URL, JWT secret, SMTP), database (reachable, migrations, anti-double-booking extension, admins, pending approvals, failed/stuck emails), the service, nginx, the SPA, and requests through nginx exactly as a visitor would (API + deep links).

## 7. Go-live checklist (in the app)

1. **Services** → create your offerings (length, buffer). 
2. **Users** → *Invite user* for each tutor (role *Tutor*); they get a set-password email.
3. **Services** → *Tutors* → assign tutors to services.
4. Each tutor: **Availability** → weekly hours (+ time off).
5. **Roles** → adjust tutor/student permissions or add custom roles (e.g. *Parent observer*).
6. Test as a student in a private window: register → "pending" → approve in **Approvals** → **Book** → tutor posts the Meet link in **Sessions** → student sees *Join Google Meet*.

## Day-to-day operations

| Task | Command |
| --- | --- |
| Deploy a new version | upload zip to `/app/incoming/` → `sudo bash …/app/current/deploy/deploy.sh` |
| Undo the last deploy | `sudo bash …/app/current/deploy/deploy.sh --rollback` (code + SPA; the DB is not reverted) |
| Releases & service state | `sudo bash …/deploy.sh --status` |
| Live logs | `sudo journalctl -u mindaccel-api -f` |
| Restart | `sudo systemctl restart mindaccel-api` |
| Restore DB from a deploy backup | `gunzip -c …/shared/backups/<file>.sql.gz \| sudo -u postgres psql my_webapp__5` (stop the service first; restore into an emptied DB) |
| Full YunoHost backup | `sudo yunohost backup create --apps my_webapp__5` (includes `/var/www/my_webapp__5` — releases, `.env`, uploads — and the DB) |
| After a YunoHost restore or domain change | re-run `install.sh`, update `APP_URL`, then `deploy.sh` |

## Troubleshooting

`doctor.sh` points at most problems directly. Common ones:

| Symptom | Fix |
| --- | --- |
| Deploy stops at "API build failed" | Read the TypeScript error above it; nothing went live. Send it over and fix, then redeploy. |
| `502 Bad Gateway` on `/api/*` | Service down → `journalctl -u mindaccel-api -n 100` (an invalid `.env` value is reported by name). |
| Reloading a page like `/sessions` gives 404 | nginx snippet missing → re-run `install.sh`. |
| Redirected to the YunoHost login | Not public → `sudo yunohost user permission update my_webapp__5.main --add visitors`. |
| `permission denied to create extension "btree_gist"` | `sudo -u postgres psql my_webapp__5 -c 'CREATE EXTENSION IF NOT EXISTS btree_gist'`, then redeploy. |
| Emails stay pending | `EMAIL_ENABLED=false`, or wrong app password (look for "SMTP verification failed" in the logs). |
| `argon2` build error | Prebuilt binary unavailable for this CPU; `install.sh` installs build tools — re-run it, then redeploy. |
| Signed out after every page reload | `APP_URL` doesn't match the real URL (cookie path/origin are derived from it). |
