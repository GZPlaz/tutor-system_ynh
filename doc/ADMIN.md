# Administering MindAccel on YunoHost

## Where things are

| What | Where |
|---|---|
| Program files | `/var/www/mindaccel/` (`server/`, `client/`, `docs/`, `bin/`) |
| Configuration (email, secrets) | `/var/www/mindaccel/.env` — owner `mindaccel`, mode 600 |
| Uploaded files (Resource Hub, study packets, logo) | `/home/yunohost.app/mindaccel/uploads/` |
| Database | PostgreSQL database `mindaccel`, created and owned by YunoHost |
| Service | `mindaccel` — `systemctl status mindaccel` |
| Logs | `/var/log/mindaccel/mindaccel.log` (rotated automatically) |

## Day-to-day, in the app (Admin → Settings)

No restart needed; changes apply within seconds.

- **New accounts** — let people sign up or make it invitation-only; require administrator approval or not; limit sign-up to certain email domains; email administrators about new sign-ups.
- **Booking** — require an account to book, or let visitors book with just a name and email; earliest/furthest booking time, slot spacing, student cancellation cut-off, "post your Meet link" reminder.
- **Maintenance mode** — locks everyone except administrators out (sign-ups and bookings pause) while you work.

Branding, people, roles and services have their own pages in the Admin menu. There are no payment features: every session is free.

### Messages

Students and tutors have private conversations under **Messages** in the menu.

- **Who can message whom:** a student can message any tutor who teaches an active service, or who they have booked. A tutor can message students who have booked them. People who booked without an account can't sign in, so they can't be messaged.
- **Questions before a session:** on an upcoming session, a tutor can click **Ask a question**. The student is emailed, and the question is highlighted on their home page, on the session and in the conversation until they answer it.
- **Emails:** people get one email when a new message arrives, then no more about that conversation until they've read it. Questions always send an email.
- **Safeguarding:** administrators (permission `messages:read_any`) can open **Messages → All conversations** to read any conversation. It is read-only, and every conversation opened is recorded in the activity log. The start of every conversation tells users that administrators can review conversations.
- **Limits:** messages are up to 4,000 characters, and each person can send up to 40 messages per 5 minutes.
- **Permissions:** students and tutors get `messages:send` automatically, including on existing sites when you upgrade. Remove it from a role in Admin → Roles to turn messaging off for that role.

### Support references

If something unexpected goes wrong, the error message shows a short reference, like `(Reference: a8703517)`. Search the log for it to find the exact request:

```
sudo grep a8703517 /var/log/mindaccel/mindaccel.log
```

### Free study packets (`/packets`)

Anyone can open `/packets` and download the free practice packets without an account; the page is linked from the sign-in page and the menu. Manage them in **Admin → Study packets**:

- **Upload packet**: a PDF or Word file, a title and a subject (packets are grouped under their subject; your service names are suggested). Optional: description, page count, order.
- **Hide / Show** takes a packet off the public page without deleting it. **Edit** changes the details or replaces the file. The list shows how many times each packet was downloaded.
- Two packets ship with the app (*ACT Math* and *ACT English*, 7 pages each) and are added on first start. Deleting one is permanent; it does not come back after a restart or upgrade. Their source is `tools/packets/build_act_packets.py`.
- Access is the `packets:manage` permission (Admins have it; grant it to other roles in Admin → Roles).

### Booking without an account

When *An account is needed to book* is switched **off**, visitors at `/book` choose a subject and time and enter a name and email. They get an email with a private link to see the session, find the Google Meet link and cancel. Things to know:

- A guest cannot sign in. If they later sign up with the same email, their booking history is kept.
- If the email already belongs to an account, they're asked to sign in.
- Emails are not verified before the request is sent, so the tutor still confirms each request. Requests are rate limited per network address.

## Command line

```
sudo mindaccel create-admin you@example.org   # create/promote an admin, prints a password link
sudo mindaccel doctor                         # health check
sudo mindaccel verify                         # data + uploaded-files consistency report
sudo mindaccel status                         # which database migrations are applied
sudo mindaccel migrate                        # apply pending migrations (done automatically on upgrade)
sudo mindaccel import-legacy --from my_webapp__5 --help
```

## Backups

`yunohost backup create --apps mindaccel` saves the program files, uploads and a database dump. Restore with `yunohost backup restore`.

## Changing the address

`yunohost app change-url mindaccel -d new.example.org -p /` updates nginx, `APP_URL` and rebuilds the web app for the new path.

## Payments were removed (v4.1)

Everything is free. If the site used to take payments:

- **Past records are kept**, untouched, in the database (payments, plans, subscriptions, credits), so nothing financial is lost. The app no longer shows or changes them.
- **Cancel any subscription that is still active in Stripe.** Removing payments from MindAccel does not stop Stripe from charging. `sudo mindaccel doctor` warns while any remain, and so does the upgrade.
- **Refunds that were still being retried** are no longer retried automatically; `doctor` lists them so you can issue them in the Stripe dashboard.
- The `STRIPE_*` lines in `.env` (if any) are ignored and can be deleted.
