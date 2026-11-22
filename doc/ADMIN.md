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

### First sign-in, tour and setup checklist

- **Welcome tour:** after someone's first sign-in, a short tour points at the menu items that matter for them. Students learn to book, join and message. Tutors learn to set hours, run sessions and ask questions. Admins see where the controls are. It can be skipped, and restarted from **Profile → Take the tour again**. People who had already signed in before this update don't see it.
- **Setup checklist:** administrators see "Get your site ready" on the home page until subjects, tutors and assignments exist. **Hide** removes it on that browser.
- **Tutors without hours** see a reminder on their home page until they set their weekly availability.

### Managing a person (Admin → People → Manage)

- **Edit** their name, email and time zone. Changing the email signs them out everywhere.
- **Send a password reset link.** Their current password keeps working until they use the link.
- **Sign them out everywhere**, for example after a lost device.
- Each of these is recorded in the activity log. Pause, roles and delete are on the same row as before.

People can also, from their own **Profile**:
- turn message emails and session reminders on or off (booking and account emails always send)
- email themselves a reset link if they've forgotten their current password

### Menu layout

The menu only shows what each person can use:

| Who | Menu |
|---|---|
| Students | Home, Sessions, Book a session, Messages, Resources, Free packets |
| Tutors | the above, plus **Teaching**: My hours, Students, Classes |
| Admins | **Admin**: People, Reports, Subjects, Study packets, Insights, Settings |

**Settings** holds General, Branding, Roles & permissions and the Activity log as tabs. On session cards, less common actions (add to calendar, cancel, report, change the Meet link) are under **More**.

### Calendar

**Calendar** in the menu shows sessions by month, or as a list (the default on phones), in each person's time zone. Students and tutors see their own sessions. Admins can switch between **Mine** and **Everyone** and filter by tutor. Clicking a session shows the details and the Join button. Requested, confirmed, completed and cancelled sessions each look different (a key is under the calendar).

### Emailing people and setting passwords

- **Email from the portal:** on a person's page, **Send an email**; or on **People → Everyone**, tick several people and choose **Email**. Each person gets their own copy, sent from the site's address with your name at the bottom. Permission: `email:send` (admins). Every send is recorded in the activity log.
- **Set a new password:** on a person's page, **Set a new password** sets it directly (with an optional **Generate**). Use it when someone can't receive the reset email. They are signed out everywhere, and you can choose to email them that it changed; the password itself is never emailed.

### Archiving and deleting conversations

- **Archive:** anyone can **Archive** a conversation to move it out of their inbox (Messages → Archived). It only affects them, and a new message brings it back for both people.
- **Delete:** admins with `messages:delete` can permanently **Delete** a conversation and all its messages for both people. Deletions are recorded in the activity log.

### Reports about tutors (Admin → Reports)

- **Filing a report:** anyone signed in can report a tutor, from a session's **More → Report a problem** or from a conversation with a tutor. They choose a category (safety, behaviour, no-show, teaching quality, other) and describe what happened.
- **Notification:** admins with `safety:manage` are emailed about each new report.
- **Privacy:** reporters' names are visible to admins only. The tutor is never told who reported them.
- **Reviewing:** each report has a status (open, reviewing, resolved, dismissed) and an internal admin note, and links to the tutor's account page. There you can pause them or cancel their upcoming sessions.
- **Abuse limit:** each person can file up to 5 reports per hour.

### Notes on students (Teaching → Students)

- **Writing notes:** tutors can write notes about students they have taught (admins can write about anyone). Each note is either **Tutors only** or **Also visible to the student**.
- **Reading notes:** every tutor can open any student's profile and read all notes, so whoever teaches them next knows the background.
- **What students see:** only the shared notes, under "Notes from your tutors" on their home page.
- **Editing:** authors can edit or delete their own notes; admins can delete any. Changes are recorded in the activity log.

### A person's account page (Admin → People → Open)

- **What it shows:** account details, roles, sessions as a student and as a tutor, upcoming sessions, reports about them, and their recent activity.
- **Actions:** edit details, reset password, change roles, sign out everywhere, show the tour again, unlock after too many wrong passwords, cancel all upcoming sessions (everyone is emailed), pause or reactivate, and delete.
- **Bulk actions:** on **People → Everyone**, tick several people (or "select all on this page") to send reset links, sign them out, unlock, pause, reactivate, or add or remove a role in one go. Each person succeeds or is skipped on their own, with the reason shown.

### Insights and exports (Admin → Insights)

- **What it shows:** sessions completed, upcoming, no-show and cancellation rates, average rating, students taught, new accounts, messages, a weekly chart, and breakdowns by subject and tutor, plus the latest written feedback. You can pick 4 weeks, 12 weeks or 6 months.
- **Exports:** **Sessions CSV** (the selected period) and **People CSV** open in Excel or Google Sheets. They contain names and emails, so every export is recorded in the activity log.
- **Permission:** `reports:read` (administrators only by default).

### After a session: recaps and ratings

- **Recaps:** when a session ends, the tutor can write a recap (what was covered, homework). The student is emailed the first time; later edits are silent. Recaps stay on the session for both people.
- **Ratings:** students can rate a finished session from 1 to 5 stars with an optional comment, and change it for 14 days. Tutors see their own ratings; admins see everything on the Insights page.

### Calendars

- **Single session:** each upcoming session has **Add to calendar**, which downloads a file for Google, Apple or Outlook calendar.
- **Calendar sync:** **Profile → Calendar sync** gives each person a private link. Subscribing to it in their calendar app keeps every session, change and cancellation in sync. If the link is shared by mistake, **Create a new link** stops the old one working.

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
