#!/usr/bin/env bash
# =============================================================================
# MindAccel — ONE-TIME server setup on YunoHost (run as root).
#
#   sudo bash deploy/install.sh                # defaults: my_webapp__5, port 3105
#   sudo APP=my_webapp__5 PORT=3105 bash deploy/install.sh
#
# Idempotent: safe to re-run (e.g. after a YunoHost restore or domain change).
# It never overwrites an existing .env.
#
# What it does
#   1. Checks the My Webapp instance exists and has a PostgreSQL database
#   2. Installs Node.js LTS (NodeSource) if missing/too old
#   3. Creates app/{incoming,releases,shared}, uploads/ with tight ownership
#   4. Generates app/shared/.env (DB password from YunoHost, random JWT secret)
#   5. Installs + enables the systemd service
#   6. Installs the nginx snippet (API proxy + SPA fallback) and reloads nginx
#   7. Registers the service with YunoHost (shows in the admin panel/diagnosis)
# =============================================================================
set -euo pipefail

APP="${APP:-my_webapp__5}"
PORT="${PORT:-3105}"
NODE_MAJOR="${NODE_MAJOR:-24}"   # Node 24 = Active LTS (Oct 2026)
SERVICE="mindaccel-api"
APP_DIR="/var/www/${APP}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

say()  { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }
die()  { printf '\n\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Run as root (sudo)."
command -v yunohost >/dev/null || die "This script is meant for a YunoHost server."

# --- 1. Inspect the My Webapp instance --------------------------------------
say "Reading YunoHost settings for ${APP}"
yunohost app info "$APP" >/dev/null 2>&1 || die "App ${APP} not found. Check: yunohost app list"
DOMAIN="$(yunohost app setting "$APP" domain)"
URL_PATH="$(yunohost app setting "$APP" path)"
[[ "$URL_PATH" == "/" ]] && URL_PATH=""
DB_NAME="$(yunohost app setting "$APP" db_name || true)"
DB_USER="$(yunohost app setting "$APP" db_user || true)"
DB_PWD="$(yunohost app setting "$APP" db_pwd || true)"
DB_NAME="${DB_NAME:-$APP}"; DB_USER="${DB_USER:-$DB_NAME}"
[[ -n "$DB_PWD" ]] || die "No database password found. Was ${APP} installed with database=postgresql?"
[[ -d "$APP_DIR/www" ]] || die "${APP_DIR}/www does not exist."
echo "   domain=${DOMAIN} path=${URL_PATH:-/} db=${DB_NAME}"

if ss -ltn "( sport = :${PORT} )" | grep -q LISTEN && ! systemctl is-active --quiet "$SERVICE"; then
  die "Port ${PORT} is already in use by another program. Re-run with PORT=<free port>."
fi

# --- 2. Node.js ---------------------------------------------------------------
current_major="$(node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/' || echo 0)"
if [[ "${current_major:-0}" -lt "$NODE_MAJOR" ]]; then
  say "Installing Node.js ${NODE_MAJOR}.x (NodeSource)"
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl gnupg
  install -d -m 0755 /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" \
    > /etc/apt/sources.list.d/nodesource.list
  apt-get update -qq
  apt-get install -y -qq nodejs
fi
# Toolchain in case argon2 has no prebuilt binary for this CPU (e.g. armv7).
apt-get install -y -qq build-essential python3 rsync unzip >/dev/null
echo "   node $(node -v), npm $(npm -v)"

# --- 3. Directories -----------------------------------------------------------
say "Creating directories"
install -d -o "$APP" -g "$APP" -m 0750 "$APP_DIR/app" "$APP_DIR/app/shared" "$APP_DIR/app/shared/locks" \
  "$APP_DIR/app/releases" "$APP_DIR/app/incoming" "$APP_DIR/uploads"
install -d -o root -g root -m 0700 "$APP_DIR/app/shared/backups"
# The SPA is served by nginx (www-data) from www/
chown -R "$APP:www-data" "$APP_DIR/www"

# --- 4. Environment file -----------------------------------------------------
ENV_FILE="$APP_DIR/app/shared/.env"
if [[ -f "$ENV_FILE" ]]; then
  say ".env already exists — leaving it untouched"
else
  say "Generating ${ENV_FILE}"
  JWT_SECRET="$(openssl rand -base64 48 | tr -d '\n')"
  sed \
    -e "s#^APP_URL=.*#APP_URL=https://${DOMAIN}${URL_PATH}#" \
    -e "s#^PORT=.*#PORT=${PORT}#" \
    -e "s#^DATABASE_URL=.*#DATABASE_URL=postgresql://${DB_USER}:${DB_PWD}@localhost:5432/${DB_NAME}?schema=public#" \
    -e "s#^JWT_ACCESS_SECRET=.*#JWT_ACCESS_SECRET=${JWT_SECRET}#" \
    -e "s#^UPLOAD_DIR=.*#UPLOAD_DIR=${APP_DIR}/uploads#" \
    -e "s#^EMAIL_ENABLED=.*#EMAIL_ENABLED=false#" \
    "$HERE/../server/.env.example" > "$ENV_FILE"
  chown "$APP:$APP" "$ENV_FILE"
  chmod 0600 "$ENV_FILE"
  echo "   ⚠  Edit SMTP_* and MAIL_FROM, then set EMAIL_ENABLED=true:  nano ${ENV_FILE}"
fi

# --- 5. systemd ---------------------------------------------------------------
say "Installing systemd unit ${SERVICE}"
sed -e "s#__APP__#${APP}#g" -e "s#__APP_DIR__#${APP_DIR}#g" \
  "$HERE/systemd/mindaccel-api.service" > "/etc/systemd/system/${SERVICE}.service"
systemctl daemon-reload
systemctl enable "$SERVICE" >/dev/null

# --- 6. nginx ---------------------------------------------------------------
NGINX_DIR="/etc/nginx/conf.d/${DOMAIN}.d/${APP}.d"
say "Installing nginx snippet in ${NGINX_DIR}"
install -d "$NGINX_DIR"
sed -e "s#__PATH__#${URL_PATH}#g" -e "s#__PORT__#${PORT}#g" "$HERE/nginx/mindaccel.conf" > "$NGINX_DIR/mindaccel.conf"
nginx -t
systemctl reload nginx

# --- 7. YunoHost integration --------------------------------------------------
say "Registering service with YunoHost"
yunohost service add "$SERVICE" --description "MindAccel Tutoring API" >/dev/null 2>&1 || true
# Students must reach the login page without a YunoHost account → public.
yunohost user permission update "${APP}.main" --add visitors >/dev/null 2>&1 || true

say "Done."
cat <<EOF

Next steps
  1. Configure email:        sudo nano ${ENV_FILE}     (SMTP_* + EMAIL_ENABLED=true)
  2. Upload the project zip:  SFTP as ${APP} → /app/incoming/   (or keep it where it is)
  3. Deploy:                  sudo bash ${HERE}/deploy.sh [path-to-zip]
  4. First admin:             sudo bash ${HERE}/create-admin.sh you@example.com
  5. Health check anytime:    sudo bash ${HERE}/doctor.sh
EOF
