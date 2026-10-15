#!/usr/bin/env bash
# =============================================================================
# MindAccel — health & configuration check (read-only, safe to run anytime).
#   sudo bash doctor.sh
# Prints ✔ / ⚠ / ✖ per check and exits non-zero if anything is broken.
# =============================================================================
set -uo pipefail
APP="${APP:-my_webapp__5}"
SERVICE="mindaccel-api"
APP_DIR="/var/www/${APP}"
ENV_FILE="${APP_DIR}/app/shared/.env"
FAIL=0
pass() { printf '  \033[32m✔\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m⚠\033[0m %s\n' "$*"; }
fail() { printf '  \033[31m✖\033[0m %s\n' "$*"; FAIL=1; }
hdr()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
envget() { grep -E "^$1=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | sed 's/^"//; s/"$//'; }

[[ $EUID -eq 0 ]] || { echo "Run with sudo."; exit 1; }

hdr "YunoHost instance"
if yunohost app info "$APP" >/dev/null 2>&1; then
  DOMAIN="$(yunohost app setting "$APP" domain)"; URL_PATH="$(yunohost app setting "$APP" path)"; [[ "$URL_PATH" == "/" ]] && URL_PATH=""
  DB_NAME="$(yunohost app setting "$APP" db_name 2>/dev/null || echo "$APP")"
  pass "$APP at https://${DOMAIN}${URL_PATH:-/}"
  if yunohost user permission info "${APP}.main" 2>/dev/null | grep -q visitors; then pass "public access (visitors) enabled"
  else fail "site is not public — run: yunohost user permission update ${APP}.main --add visitors"; fi
else
  fail "app $APP not found"; exit 1
fi

hdr "Runtime"
NODE_MAJOR="$(node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/')"
[[ "${NODE_MAJOR:-0}" -ge 22 ]] && pass "Node.js $(node -v)" || fail "Node.js >= 22 required (found: $(node -v 2>/dev/null || echo none))"
CUR="$(readlink -e "$APP_DIR/app/current" 2>/dev/null)"
[[ -n "$CUR" && -f "$CUR/server/dist/server.js" ]] && pass "live release: $(basename "$CUR")" || fail "no live release — run deploy.sh"
PREV="$(readlink -e "$APP_DIR/app/previous" 2>/dev/null)"; [[ -n "$PREV" ]] && pass "rollback target: $(basename "$PREV")" || warn "no previous release (rollback unavailable until the next deploy)"

hdr "Configuration (${ENV_FILE})"
if [[ -f "$ENV_FILE" ]]; then
  PERM="$(stat -c '%a %U' "$ENV_FILE")"; [[ "$PERM" == "600 $APP" ]] && pass ".env permissions 600, owner $APP" || warn ".env is '$PERM' — expected '600 $APP'"
  APP_URL="$(envget APP_URL)"
  [[ "$APP_URL" == "https://${DOMAIN}${URL_PATH}" ]] && pass "APP_URL matches ($APP_URL)" || fail "APP_URL is '$APP_URL' but the site is https://${DOMAIN}${URL_PATH} (cookies/links will break)"
  JWT="$(envget JWT_ACCESS_SECRET)"
  [[ ${#JWT} -ge 32 && "$JWT" != CHANGE_ME* ]] && pass "JWT secret set (${#JWT} chars)" || fail "JWT_ACCESS_SECRET missing or placeholder"
  if [[ "$(envget EMAIL_ENABLED)" == "true" ]]; then
    [[ -n "$(envget SMTP_USER)" && "$(envget SMTP_PASS)" != "xxxxxxxxxxxxxxxx" ]] && pass "email enabled via $(envget SMTP_HOST) as $(envget SMTP_USER)" || fail "EMAIL_ENABLED=true but SMTP_USER/SMTP_PASS not set"
  else
    warn "EMAIL_ENABLED=false — no emails are sent (approvals, bookings, reminders)"
  fi
  UP="$(envget UPLOAD_DIR)"; sudo -u "$APP" test -w "$UP" && pass "uploads writable ($UP)" || fail "uploads dir not writable by $APP: $UP"
else
  fail ".env missing — run install.sh"
fi

hdr "Database ($DB_NAME)"
q() { (cd / && sudo -u postgres psql -d "$DB_NAME" -tAc "$1" 2>/dev/null); }
if [[ "$(q 'select 1')" == "1" ]]; then
  pass "reachable"
  [[ "$(q "select count(*) from pg_extension where extname='btree_gist'")" == "1" ]] && pass "btree_gist extension present" || fail "btree_gist missing (double-booking guard) — redeploy or: CREATE EXTENSION btree_gist"
  MIG="$(q "select count(*) from _prisma_migrations where finished_at is not null")"; [[ -n "$MIG" ]] && pass "$MIG migration(s) applied" || fail "no migrations applied — run deploy.sh"
  ADMINS="$(q "select count(*) from users u join user_roles ur on ur.user_id=u.id join roles r on r.id=ur.role_id where r.key='admin' and u.status='ACTIVE'")"
  [[ "${ADMINS:-0}" -ge 1 ]] && pass "$ADMINS active administrator(s)" || warn "no active administrator — run create-admin.sh"
  PENDING="$(q "select count(*) from users where status='PENDING'")"; [[ "${PENDING:-0}" -gt 0 ]] && warn "$PENDING registration(s) awaiting approval"
  FAILED="$(q "select count(*) from email_outbox where status='FAILED'")"; STUCK="$(q "select count(*) from email_outbox where status='PENDING' and created_at < now() - interval '30 minutes'")"
  [[ "${FAILED:-0}" -eq 0 ]] && pass "no failed emails" || warn "$FAILED email(s) failed permanently — check SMTP (select to_email,last_error from email_outbox where status='FAILED')"
  [[ "${STUCK:-0}" -eq 0 ]] || warn "$STUCK email(s) pending > 30 min (EMAIL_ENABLED or SMTP problem?)"
else
  fail "cannot query database $DB_NAME"
fi

hdr "Service & web"
systemctl is-active --quiet "$SERVICE" && pass "$SERVICE is running" || fail "$SERVICE is not running — journalctl -u $SERVICE -n 100"
PORT="$(envget PORT)"
curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1 && pass "API healthy on 127.0.0.1:${PORT}" || fail "API health check failed on port ${PORT}"
SNIPPET="/etc/nginx/conf.d/${DOMAIN}.d/${APP}.d/mindaccel.conf"
[[ -f "$SNIPPET" ]] && pass "nginx snippet installed" || fail "nginx snippet missing ($SNIPPET) — re-run install.sh"
nginx -t >/dev/null 2>&1 && pass "nginx config valid" || fail "nginx -t reports errors"
[[ -f "$APP_DIR/www/index.html" ]] && grep -q 'id="root"' "$APP_DIR/www/index.html" && pass "SPA published in www/" || fail "SPA not published — run deploy.sh"
VIA="https://${DOMAIN}${URL_PATH}"
CODE="$(curl -sk -o /dev/null -w '%{http_code}' --resolve "${DOMAIN}:443:127.0.0.1" "${VIA}/api/health")"
[[ "$CODE" == "200" ]] && pass "public URL → API ok (${VIA}/api/health)" || fail "${VIA}/api/health returned $CODE through nginx (302 = SSO not public; 502 = API down)"
CODE="$(curl -sk -o /dev/null -w '%{http_code}' --resolve "${DOMAIN}:443:127.0.0.1" "${VIA}/sessions")"
[[ "$CODE" == "200" ]] && pass "deep links work (SPA fallback)" || fail "${VIA}/sessions returned $CODE — SPA fallback not active"

echo
[[ $FAIL -eq 0 ]] && printf '\033[1;32mAll critical checks passed.\033[0m\n' || printf '\033[1;31mSome checks failed — see ✖ above.\033[0m\n'
exit $FAIL
