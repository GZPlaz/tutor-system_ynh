#!/usr/bin/env bash
# =============================================================================
# MindAccel — copy the data of an OLD "My Webapp" MindAccel instance into this app.
#
#   sudo bash /var/www/mindaccel/bin/import-legacy.sh --from my_webapp__5 [options]
#   (or:  sudo mindaccel import-legacy --from my_webapp__5 [options])
#
# What is copied (the old instance is only ever READ — it keeps working untouched):
#   1. the whole PostgreSQL database (people, roles, bookings, resources, payments,
#      branding, email outbox, audit log, migration history…)
#   2. the Resource Hub's uploaded files and the logo
#   3. with --copy-env: SMTP and scheduling values from the old .env
#      (never the secrets that must be unique per install: JWT secret, DB password, URL)
#
# Why a copy and not a live link to the old database?  YunoHost creates and owns one
# database per app and deletes it when that app is removed. A copy gives this app its
# own database that survives removing My Webapp later, and the old site keeps working
# for as long as you want to compare or roll back. Run this again at cut-over time
# (--replace) to take a fresh copy of the latest data.
#
# Options
#   --from <app>      the old instance, e.g. my_webapp__5            (required)
#   --app <app>       this app's id                                  (default: mindaccel)
#   --replace         allow overwriting a database that already has data (a safety
#                     dump is written first)
#   --copy-env        also copy SMTP / scheduling values from the old .env
#   --no-service      don't stop/start the service (used by the installer)
#   --skip-migrate    don't run database migrations afterwards (used by the installer)
#   --yes             don't ask for confirmation
# =============================================================================
set -euo pipefail

APP="mindaccel"; FROM=""; REPLACE=0; COPY_ENV=0; MANAGE_SERVICE=1; MIGRATE=1; ASSUME_YES=0

say()  { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m✔ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m⚠ %s\033[0m\n' "$*" >&2; }
die()  { printf '\n\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --from) FROM="${2:?--from needs a value}"; shift 2 ;;
    --app) APP="${2:?--app needs a value}"; shift 2 ;;
    --replace) REPLACE=1; shift ;;
    --copy-env) COPY_ENV=1; shift ;;
    --no-service) MANAGE_SERVICE=0; shift ;;
    --skip-migrate) MIGRATE=0; shift ;;
    --yes|-y) ASSUME_YES=1; shift ;;
    -h|--help) sed -n '2,32p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "Unknown option: $1 (try --help)" ;;
  esac
done

[[ $EUID -eq 0 ]] || die "Run as root (sudo)."
[[ -n "$FROM" ]] || die "Say which old instance to copy from, e.g.  --from my_webapp__5   (see: yunohost app list)"
[[ "$FROM" != "$APP" ]] || die "The source and this app can't be the same."
command -v yunohost >/dev/null || die "This script is meant for a YunoHost server."

setting() { yunohost app setting "$1" "$2" 2>/dev/null || true; }
psql_root() { runuser -u postgres -- psql -X -q -v ON_ERROR_STOP=1 "$@"; }
sql_value() { runuser -u postgres -- psql -X -qtA -d "$1" -c "$2"; }

# ---- this app ---------------------------------------------------------------
NEW_DB="$(setting "$APP" db_name)"; NEW_USER="$(setting "$APP" db_user)"
INSTALL_DIR="$(setting "$APP" install_dir)"; DATA_DIR="$(setting "$APP" data_dir)"
NEW_DB="${NEW_DB:-$APP}"; NEW_USER="${NEW_USER:-$NEW_DB}"
[[ -n "$INSTALL_DIR" && -n "$DATA_DIR" ]] || die "App '$APP' is not installed (no install_dir/data_dir setting)."
ENV_FILE="$INSTALL_DIR/.env"
sql_value postgres "SELECT 1 FROM pg_database WHERE datname='${NEW_DB}'" | grep -q 1 || die "Database ${NEW_DB} of ${APP} does not exist."

# ---- the old instance --------------------------------------------------------
OLD_DB="$(setting "$FROM" db_name)"; OLD_DB="${OLD_DB:-$FROM}"
OLD_ENV="/var/www/${FROM}/app/shared/.env"
sql_value postgres "SELECT 1 FROM pg_database WHERE datname='${OLD_DB}'" | grep -q 1 \
  || die "No database '${OLD_DB}' found for '${FROM}'. Check the name with: yunohost app list"
[[ "$(sql_value "$OLD_DB" "SELECT to_regclass('public.users') IS NOT NULL AND to_regclass('public._prisma_migrations') IS NOT NULL")" == "t" ]] \
  || die "Database '${OLD_DB}' does not look like a MindAccel database (no users / _prisma_migrations table)."

OLD_UPLOADS=""
[[ -f "$OLD_ENV" ]] && OLD_UPLOADS="$(grep -E '^UPLOAD_DIR=' "$OLD_ENV" | tail -1 | cut -d= -f2- | tr -d '"' || true)"
OLD_UPLOADS="${OLD_UPLOADS:-/var/www/${FROM}/uploads}"

# ---- target must be empty unless --replace ------------------------------------
TABLES="$(sql_value "$NEW_DB" "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")"
HAS_DATA=0
if [[ "$TABLES" -gt 0 ]]; then
  HAS_DATA="$(sql_value "$NEW_DB" "SELECT CASE WHEN to_regclass('public.users') IS NULL THEN 0 ELSE (SELECT count(*) FROM public.users) END")"
fi
if [[ "$TABLES" -gt 0 && "$REPLACE" -ne 1 ]]; then
  die "The database of ${APP} is not empty (${TABLES} tables, ${HAS_DATA} users). Add --replace to overwrite it (a safety dump is made first)."
fi

OLD_COUNT="$(sql_value "$OLD_DB" "SELECT count(*) FROM public.users")"
echo "  from:   ${FROM}  (database ${OLD_DB}, ${OLD_COUNT} users, uploads ${OLD_UPLOADS})"
if [[ "$TABLES" -gt 0 ]]; then
  echo "  to:     ${APP}  (database ${NEW_DB}, currently ${HAS_DATA} users — will be REPLACED)"
else
  echo "  to:     ${APP}  (database ${NEW_DB}, empty)"
fi
if [[ "$ASSUME_YES" -ne 1 ]]; then
  read -r -p "Continue? [y/N] " answer; [[ "$answer" =~ ^[Yy]$ ]] || die "Cancelled — nothing was changed."
fi

# ---- 1. stop the app, safety dump ---------------------------------------------
if [[ "$MANAGE_SERVICE" -eq 1 ]]; then say "Stopping ${APP}"; systemctl stop "$APP" || true; fi

if [[ "$TABLES" -gt 0 ]]; then
  say "Safety dump of the current ${APP} database"
  install -d -m 0700 -o root -g root "$DATA_DIR/backups"
  SAFETY="$DATA_DIR/backups/before-import-$(date +%Y%m%d-%H%M%S).sql.gz"
  runuser -u postgres -- pg_dump --no-owner --no-privileges "$NEW_DB" | gzip > "$SAFETY"
  ok "Saved ${SAFETY}"
fi

# ---- 1b. keep this app's study packets ------------------------------------------
# The old My Webapp site has no study packets, so replacing the database would drop the
# packets that exist here (bundled ones and any uploaded while testing the new site).
# Save them now and put them back after the migrations recreate their table. Their files
# live in uploads/ and are not touched by the import.
PACKETS_SAVE=""; PACKETS_SEEDED=""
if [[ "$TABLES" -gt 0 && "$(sql_value "$NEW_DB" "SELECT to_regclass('public.study_packets') IS NOT NULL")" == "t" ]]; then
  PACKET_COUNT="$(sql_value "$NEW_DB" "SELECT count(*) FROM public.study_packets")"
  if [[ "$PACKET_COUNT" -gt 0 ]]; then
    say "Saving ${PACKET_COUNT} study packet(s)"
    PACKETS_SAVE="$(mktemp)"
    # Uploader links are dropped (set to NULL): that account may not exist in the old database.
    runuser -u postgres -- psql -X -q -v ON_ERROR_STOP=1 -d "$NEW_DB" \
      -c "\\copy (SELECT id, title, description, subject, page_count, storage_key, original_name, mime_type, size_bytes, is_published, sort_order, download_count, seed_key, NULL::uuid, created_at, updated_at FROM public.study_packets) TO pstdout" > "$PACKETS_SAVE"
    PACKETS_SEEDED="$(sql_value "$NEW_DB" "SELECT value::text FROM public.app_settings WHERE key = 'packets.seeded'" || true)"
  fi
fi

# ---- 2. copy the database -----------------------------------------------------
say "Copying the database ${OLD_DB} → ${NEW_DB}"
psql_root -d "$NEW_DB" <<SQL
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public AUTHORIZATION "${NEW_USER}";
GRANT ALL ON SCHEMA public TO "${NEW_USER}";
SQL
# btree_gist powers the "no double booking" guarantee. It is created as the app's own database
# user (allowed on PostgreSQL 13+, same as a fresh install); a superuser creates it only if that fails.
if ! runuser -u postgres -- env PGOPTIONS="-c role=${NEW_USER}" psql -X -q -v ON_ERROR_STOP=1 -d "$NEW_DB" \
      -c "CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public" 2>/dev/null; then
  warn "The database user may not create extensions on this PostgreSQL version — creating btree_gist as administrator."
  psql_root -d "$NEW_DB" -c "CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public"
fi

# The dump is replayed with the new app's database user as the session role, so every
# table, type and index ends up owned by it (the old owner never needs to exist here).
runuser -u postgres -- pg_dump --no-owner --no-privileges --no-comments "$OLD_DB" \
  | runuser -u postgres -- env PGOPTIONS="-c role=${NEW_USER}" \
      psql -X -q -v ON_ERROR_STOP=1 --single-transaction -d "$NEW_DB" >/dev/null

# Compare row counts table by table.
MISMATCH=0
for t in users roles user_roles services bookings availability_rules resources resource_assignments groups payments session_credits audit_logs app_settings; do
  a="$(sql_value "$OLD_DB" "SELECT count(*) FROM public.${t}" 2>/dev/null || echo "?")"
  b="$(sql_value "$NEW_DB" "SELECT count(*) FROM public.${t}" 2>/dev/null || echo "?")"
  if [[ "$a" == "$b" ]]; then printf '   %-22s %s\n' "$t" "$b"; else printf '   %-22s old=%s new=%s   ✖\n' "$t" "$a" "$b"; MISMATCH=1; fi
done
[[ "$MISMATCH" -eq 0 ]] || die "Row counts differ between the old and the new database — see above. The old instance is untouched."
ok "Database copied and verified"

# ---- 3. uploaded files ----------------------------------------------------------
say "Copying uploaded files"
install -d -o "$APP" -g "$APP" -m 0750 "$DATA_DIR/uploads"
if [[ -d "$OLD_UPLOADS" ]]; then
  rsync -a "$OLD_UPLOADS/" "$DATA_DIR/uploads/"
  chown -R "$APP:$APP" "$DATA_DIR/uploads"
  ok "Copied $(find "$DATA_DIR/uploads" -type f | wc -l) file(s) from ${OLD_UPLOADS}"
else
  warn "No uploads folder at ${OLD_UPLOADS} — skipped. If the Resource Hub has files, copy them into ${DATA_DIR}/uploads/ yourself."
fi

# ---- 4. settings from the old .env ------------------------------------------------
env_set() {  # env_set KEY VALUE — replace the line or append it (no sed: values may hold any character)
  local tmp; tmp="$(mktemp)"
  KEY="$1" VAL="$2" awk 'BEGIN { FS = OFS = "="; k = ENVIRON["KEY"]; v = ENVIRON["VAL"] }
       $1 == k { print k "=" v; done = 1; next } { print } END { if (!done) print k "=" v }' "$ENV_FILE" > "$tmp"
  cat "$tmp" > "$ENV_FILE"; rm -f "$tmp"
}
if [[ "$COPY_ENV" -eq 1 ]]; then
  say "Copying settings from the old .env"
  if [[ -f "$OLD_ENV" && -f "$ENV_FILE" ]]; then
    for key in SMTP_HOST SMTP_PORT SMTP_SECURE SMTP_USER SMTP_PASS MAIL_FROM EMAIL_ENABLED \
               BOOKING_MIN_LEAD_HOURS BOOKING_MAX_HORIZON_DAYS BOOKING_SLOT_STEP_MIN STUDENT_CANCEL_CUTOFF_HOURS MEETING_LINK_NUDGE_MIN \
               UPLOAD_MAX_MB ACCESS_TOKEN_TTL_MIN REFRESH_TOKEN_TTL_DAYS PASSWORD_RESET_TTL_MIN INVITE_TTL_HOURS MAX_FAILED_LOGINS LOCKOUT_MINUTES; do
      value="$(grep -E "^${key}=" "$OLD_ENV" | tail -1 | cut -d= -f2- || true)"
      if [[ -n "$value" ]]; then env_set "$key" "$value"; echo "   ${key}"; fi
    done
    ok "Settings copied (JWT secret, database password, URL and port are NOT copied — they are specific to this install)"
  else
    warn "Could not read ${OLD_ENV} or ${ENV_FILE} — set the SMTP values in ${ENV_FILE} yourself."
  fi
fi

# ---- 5. bring the schema up to date, start, verify ------------------------------
if [[ "$MIGRATE" -eq 1 ]]; then
  say "Applying new database migrations"
  "$INSTALL_DIR/bin/mindaccel" migrate
fi
# ---- 5b. put the study packets back ---------------------------------------------------
if [[ -n "$PACKETS_SAVE" ]]; then
  if [[ "$MIGRATE" -eq 1 ]]; then
    say "Restoring the study packets"
    runuser -u postgres -- psql -X -q -v ON_ERROR_STOP=1 -d "$NEW_DB" \
      -c "\\copy public.study_packets (id, title, description, subject, page_count, storage_key, original_name, mime_type, size_bytes, is_published, sort_order, download_count, seed_key, created_by_id, created_at, updated_at) FROM pstdin" < "$PACKETS_SAVE"
    if [[ -n "$PACKETS_SEEDED" ]]; then
      runuser -u postgres -- psql -X -q -v ON_ERROR_STOP=1 -d "$NEW_DB" -v seeded="$PACKETS_SEEDED" <<'SQL'
INSERT INTO public.app_settings (key, value, updated_at) VALUES ('packets.seeded', :'seeded'::jsonb, now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
SQL
    fi
    ok "Restored $(sql_value "$NEW_DB" "SELECT count(*) FROM public.study_packets") study packet(s)"
  else
    warn "Study packets were not restored (--skip-migrate). Their files are still in ${DATA_DIR}/uploads; upload them again in Admin → Study packets."
  fi
  rm -f "$PACKETS_SAVE"
fi
if [[ "$MANAGE_SERVICE" -eq 1 ]]; then
  say "Starting ${APP}"; systemctl start "$APP"
  [[ -x "$INSTALL_DIR/bin/mindaccel" ]] && "$INSTALL_DIR/bin/mindaccel" verify || true
fi

ok "Import finished. ${FROM} was not changed."
echo "   People will need to sign in again once (new sessions); their passwords and bookings are unchanged."
