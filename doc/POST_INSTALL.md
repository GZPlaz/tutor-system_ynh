**MindAccel Tutoring is installed at https://__DOMAIN____PATH__**

First steps:

1. **Administrator** — if you gave an administrator email, the one-time "choose your password" link was printed at the end of the installation log. Otherwise run:
   `sudo mindaccel create-admin you@example.org`
2. **Check everything** — `sudo mindaccel doctor` lists what is working and what needs attention.
3. **Email** — if you didn't enter a Google address during install, set the `SMTP_*` values in `/var/www/__APP__/.env` and run `sudo systemctl restart __APP__`.
4. **Settings** — sign in as administrator and open **Admin → Settings** to choose whether new accounts need approval, whether an account is needed to book, and the scheduling rules.

Imported data from an old site? Run `sudo mindaccel verify` to compare counts and confirm every uploaded file arrived.
