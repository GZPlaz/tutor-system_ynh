#!/usr/bin/env bash
# =============================================================================
# MindAccel — health & configuration check (read-only, safe to run any time).
#   sudo mindaccel doctor
# Prints ✔ / ⚠ / ✖ per check and exits non-zero if something critical is broken.
# =============================================================================
set -uo pipefail
APP="${APP:-mindaccel}"
FAIL=0
pass() { printf '  \033[32m✔\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m⚠\033[0m %s\n' "$*"; }
fail() { printf '  \033[31m✖\033[0m %s\n' "$*"; FAIL=1; }
hdr()  { printf '\n\033[1m%s\033[0m\n' "$*"; }

[[ $EUID -eq 0 ]] || { echo "Run with sudo."; exit 1; }

hdr "YunoHost app"
yunohost app info "$APP" >/dev/null 2>&1 || { fail "app $APP not found"; exit 1; }
setting() { yunohost app setting "$APP" "$1" 2>/dev/null; }
DOMAIN="$(setting domain)"; URL_PATH="$(setting path)"; [[ "$URL_PATH" == "/" ]] && URL_PATH=""
DB_NAME="$(setting db_name)"; INSTALL_DIR="$(setting install_dir)"
ENV_FILE="$INSTALL_DIR/.env"
envget() { grep -E "^$1=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | sed 's/^"//; s/"$//'; }
pass "$APP at https://${DOMAIN}${URL_PATH:-/}"
if yunohost user permission info "${APP}.main" 2>/dev/null | grep -q visitors; then pass "public access (visitors) enabled"
else fail "the site is not public — run: yunohost user permission update ${APP}.main --add visitors"; fi

hdr "Files"
[[ -f "$INSTALL_DIR/server/dist/server.js" ]] && pass "server build present" || fail "server build missing — re-run the upgrade"
[[ -f "$INSTALL_DIR/client/dist/index.html" ]] && pass "web app build present" || fail "web app build missing — re-run the upgrade"

hdr "Configuration ($ENV_FILE)"
if [[ -f "$ENV_FILE" ]]; then
  PERM="$(stat -c '%a %U' "$ENV_FILE")"; [[ "$PERM" == "600 $APP" ]] && pass ".env permissions 600, owner $APP" || warn ".env is '$PERM' — expected '600 $APP'"
  APP_URL="$(envget APP_URL)"
  [[ "$APP_URL" == "https://${DOMAIN}${URL_PATH}" ]] && pass "APP_URL matches ($APP_URL)" || fail "APP_URL is '$APP_URL' but the site is https://${DOMAIN}${URL_PATH} (links and cookies will break)"
  JWT="$(envget JWT_ACCESS_SECRET)"
  [[ ${#JWT} -ge 32 && "$JWT" != CHANGE_ME* ]] && pass "JWT secret set" || fail "JWT_ACCESS_SECRET missing or a placeholder"
  if [[ "$(envget EMAIL_ENABLED)" == "true" ]]; then
    [[ -n "$(envget SMTP_USER)" && -n "$(envget SMTP_PASS)" ]] && pass "email enabled via $(envget SMTP_HOST) as $(envget SMTP_USER)" || fail "EMAIL_ENABLED=true but SMTP_USER/SMTP_PASS are empty"
  else
    warn "EMAIL_ENABLED=false — no emails are sent (approvals, bookings, reminders). Set the SMTP values in .env and restart."
  fi
  UP="$(envget UPLOAD_DIR)"; runuser -u "$APP" -- test -w "$UP" && pass "uploads writable ($UP)" || fail "uploads folder not writable by $APP: $UP"
else
  fail ".env missing"
fi

hdr "Database ($DB_NAME)"
q() { (cd / && runuser -u postgres -- psql -d "$DB_NAME" -tAc "$1" 2>/dev/null); }
if [[ "$(q 'select 1')" == "1" ]]; then
  pass "reachable"
  [[ "$(q "select count(*) from pg_extension where extname='btree_gist'")" == "1" ]] && pass "btree_gist extension present" || fail "btree_gist missing (the double-booking guard needs it)"
  MIG="$(q "select count(*) from _prisma_migrations where finished_at is not null and rolled_back_at is null")"
  [[ "${MIG:-0}" -ge 4 ]] && pass "$MIG migration(s) applied" || fail "only ${MIG:-0} migration(s) applied — run: sudo mindaccel migrate"
  ADMINS="$(q "select count(*) from users u join user_roles ur on ur.user_id=u.id join roles r on r.id=ur.role_id where r.key='admin' and u.status='ACTIVE'")"
  [[ "${ADMINS:-0}" -ge 1 ]] && pass "$ADMINS active administrator(s)" || warn "no active administrator — run: sudo mindaccel create-admin you@example.com"
  PENDING="$(q "select count(*) from users where status='PENDING' and not is_guest")"; [[ "${PENDING:-0}" -gt 0 ]] && warn "$PENDING sign-up(s) awaiting approval"
  FAILED="$(q "select count(*) from email_outbox where status='FAILED'")"; STUCK="$(q "select count(*) from email_outbox where status='PENDING' and created_at < now() - interval '30 minutes'")"
  [[ "${FAILED:-0}" -eq 0 ]] && pass "no failed emails" || warn "$FAILED email(s) failed permanently — check SMTP (select to_email,last_error from email_outbox where status='FAILED')"
  [[ "${STUCK:-0}" -eq 0 ]] || warn "$STUCK email(s) pending for over 30 minutes (EMAIL_ENABLED or SMTP problem?)"
  [[ "$(q "select value->'maintenance'->>'enabled' from app_settings where key='general'")" == "true" ]] && warn "MAINTENANCE MODE is ON — only administrators can use the site (Admin → Settings)"
  # Payments were removed in v4.1; anything still live in Stripe must be handled there.
  SUBS="$(q "select count(*) from subscriptions where status in ('ACTIVE','TRIALING','PAST_DUE') and not cancel_at_period_end")"
  [[ "${SUBS:-0}" -eq 0 ]] || warn "$SUBS old subscription(s) still active — Stripe keeps charging until you cancel them in the Stripe dashboard"
  REFUNDS="$(q "select count(*) from payments where refund_requested_at is not null")"
  [[ "${REFUNDS:-0}" -eq 0 ]] || warn "$REFUNDS old refund(s) were never completed — issue them in the Stripe dashboard"
else
  fail "cannot query database $DB_NAME"
fi

hdr "Service & web"
systemctl is-active --quiet "$APP" && pass "$APP is running" || fail "$APP is not running — journalctl -u $APP -n 100  (and /var/log/$APP/$APP.log)"
PORT="$(envget PORT)"
curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1 && pass "app healthy on 127.0.0.1:${PORT}" || fail "health check failed on port ${PORT}"
nginx -t >/dev/null 2>&1 && pass "nginx config valid" || fail "nginx -t reports errors"
VIA="https://${DOMAIN}${URL_PATH}"
CODE="$(curl -sk -o /dev/null -w '%{http_code}' --resolve "${DOMAIN}:443:127.0.0.1" "${VIA}/api/health")"
[[ "$CODE" == "200" ]] && pass "public URL → app ok (${VIA}/api/health)" || fail "${VIA}/api/health returned $CODE through nginx (302 = not public; 502 = app down)"
CODE="$(curl -sk -o /dev/null -w '%{http_code}' -H 'Accept: text/html' --resolve "${DOMAIN}:443:127.0.0.1" "${VIA}/sessions")"
[[ "$CODE" == "200" ]] && pass "deep links work" || fail "${VIA}/sessions returned $CODE"

echo
[[ $FAIL -eq 0 ]] && printf '\033[1;32mAll critical checks passed.\033[0m\n' || printf '\033[1;31mSome checks failed — see ✖ above.\033[0m\n'
exit $FAIL
