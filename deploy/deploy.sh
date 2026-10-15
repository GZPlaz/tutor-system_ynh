#!/usr/bin/env bash
# =============================================================================
# MindAccel — build, test & release with automatic rollback (run as root).
#
#   sudo bash deploy.sh                                   # newest upload in app/incoming/
#   sudo bash deploy.sh /path/to/mindaccel-tutoring.zip   # a specific zip / .tar.gz
#   sudo bash deploy.sh /path/to/checkout                 # a git checkout / folder
#   sudo bash deploy.sh --rollback                        # switch back to the previous release
#   sudo bash deploy.sh --status                          # show releases
#
# Pipeline (nothing user-visible changes until step 6):
#   1. unpack source into app/releases/<timestamp>/
#   2. install deps (reusing saved lockfiles) → prisma generate → typecheck/build → unit tests
#   3. build the SPA for this instance's URL path
#   4. back up the database (pg_dump → app/shared/backups/)
#   5. apply database migrations
#   6. switch app/current → new release, publish SPA to www/, restart API
#   7. health check; on failure roll code + SPA back to the previous release
# =============================================================================
set -euo pipefail

APP="${APP:-my_webapp__5}"
SERVICE="mindaccel-api"
APP_DIR="/var/www/${APP}"
BASE="${APP_DIR}/app"
RELEASES="${BASE}/releases"
SHARED="${BASE}/shared"
ENV_FILE="${SHARED}/.env"
KEEP_RELEASES="${KEEP_RELEASES:-3}"
KEEP_BACKUPS="${KEEP_BACKUPS:-10}"

say()  { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m✔ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m⚠ %s\033[0m\n' "$*"; }
die()  { printf '\n\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Run as root (sudo)."
[[ -f "$ENV_FILE" ]] || die "Missing ${ENV_FILE}. Run deploy/install.sh first."

PORT="$(grep -E '^PORT=' "$ENV_FILE" | cut -d= -f2 | tr -d '"' )"
URL_PATH="$(yunohost app setting "$APP" path)"
BASE_PATH="${URL_PATH%/}/"            # "/" or "/tutoring/"
DB_NAME="$(yunohost app setting "$APP" db_name 2>/dev/null || echo "$APP")"

# Run as the unprivileged app user, with a writable HOME and npm cache.
as_app() { sudo -u "$APP" -H env HOME="$BASE" npm_config_cache="$BASE/.npm" npm_config_update_notifier=false bash -c "$*"; }

# readlink -e: empty unless the link AND its target exist (readlink -f would invent a path).
current_release()  { readlink -e "$BASE/current" 2>/dev/null || true; }
previous_release() { readlink -e "$BASE/previous" 2>/dev/null || true; }

health() {
  for _ in $(seq 1 30); do
    curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1 && return 0
    sleep 1
  done
  return 1
}

# Copy a release's SPA into www/: new hashed assets first, index.html last,
# then remove stale files — so visitors never load a half-published app.
publish_spa() {
  local dist="$1/client/dist"
  [[ -f "$dist/index.html" ]] || die "No SPA build in $1"
  rsync -a --exclude 'index.html' "$dist/" "$APP_DIR/www/"
  install -o "$APP" -g www-data -m 0640 "$dist/index.html" "$APP_DIR/www/index.html"
  rsync -a --delete --exclude '.well-known' "$dist/" "$APP_DIR/www/"
  chown -R "$APP:www-data" "$APP_DIR/www"
  find "$APP_DIR/www" -type d -exec chmod 0750 {} + ; find "$APP_DIR/www" -type f -exec chmod 0640 {} +
}

switch_to() {  # atomic symlink swap
  ln -sfn "$1" "$BASE/current.tmp" && mv -Tf "$BASE/current.tmp" "$BASE/current"
}

# ---------------------------------------------------------------- sub-commands
if [[ "${1:-}" == "--status" ]]; then
  echo "current:  $(current_release)"; echo "previous: $(previous_release)"
  ls -1dt "$RELEASES"/*/ 2>/dev/null | sed 's#/$##' ; systemctl --no-pager --lines=0 status "$SERVICE" || true
  exit 0
fi

if [[ "${1:-}" == "--rollback" ]]; then
  PREV="$(previous_release)"; CUR="$(current_release)"
  [[ -n "$PREV" && -d "$PREV" ]] || die "No previous release to roll back to."
  say "Rolling back: $(basename "$CUR") → $(basename "$PREV")"
  switch_to "$PREV"; ln -sfn "$CUR" "$BASE/previous"
  publish_spa "$PREV"
  systemctl restart "$SERVICE"
  health && ok "Rolled back to $(basename "$PREV")" || die "Previous release is not healthy either — check: journalctl -u $SERVICE -n 100"
  warn "Database migrations are NOT reversed. Restore a backup from ${SHARED}/backups if a migration caused the problem."
  exit 0
fi

# ---------------------------------------------------------------- 1. unpack
SRC="${1:-}"
if [[ -z "$SRC" ]]; then
  SRC="$(ls -1t "$BASE"/incoming/*.zip "$BASE"/incoming/*.tar.gz 2>/dev/null | head -1 || true)"
  [[ -n "$SRC" ]] || die "Nothing in ${BASE}/incoming/. Upload the project zip there (SFTP: /app/incoming/) or pass a path."
fi
[[ -e "$SRC" ]] || die "Source not found: $SRC"

REL="$RELEASES/$(date +%Y%m%d-%H%M%S)"
say "Preparing release $(basename "$REL") from $SRC"
STAGE="$(mktemp -d)"; trap 'rm -rf "$STAGE"' EXIT
case "$SRC" in
  *.zip)    unzip -q "$SRC" -d "$STAGE" ;;
  *.tar.gz|*.tgz) tar -xzf "$SRC" -C "$STAGE" ;;
  *)        [[ -d "$SRC" ]] || die "Unsupported source: $SRC"; rsync -a --exclude node_modules --exclude .git "$SRC/" "$STAGE/" ;;
esac
# Accept archives with or without a top-level folder.
FOUND="$(find "$STAGE" -maxdepth 3 -type f -path '*/server/package.json' | head -1)"
[[ -n "$FOUND" ]] || die "Source does not look like the MindAccel project (server/ + client/ expected)."
ROOT="$(dirname "$(dirname "$FOUND")")"
[[ -f "$ROOT/client/package.json" ]] || die "Source does not look like the MindAccel project (client/ missing)."
install -d -o "$APP" -g "$APP" -m 0750 "$RELEASES"
mkdir -p "$REL"
rsync -a --exclude node_modules --exclude .git "$ROOT/" "$REL/"
chown -R "$APP:$APP" "$REL"

# A failed build must leave no half-made release behind.
fail_build() { rm -rf "$REL"; die "$1 — nothing was changed. Fix and re-run; the live site is untouched."; }

# ---------------------------------------------------------------- 2. API build
install -d -o "$APP" -g "$APP" -m 0750 "$SHARED/locks"
for part in server client; do
  if [[ ! -f "$REL/$part/package-lock.json" && -f "$SHARED/locks/$part-package-lock.json" ]]; then
    cp "$SHARED/locks/$part-package-lock.json" "$REL/$part/package-lock.json"; chown "$APP:$APP" "$REL/$part/package-lock.json"
  fi
done
# npm ci when a matching lockfile exists (reproducible); npm install otherwise.
NPM_INSTALL='if [ -f package-lock.json ] && npm ci --no-audit --no-fund; then :; else npm install --no-audit --no-fund; fi'

ln -sfn "$ENV_FILE" "$REL/server/.env"     # Prisma CLI + admin CLI read server/.env
say "API: install dependencies"
as_app "cd '$REL/server' && $NPM_INSTALL" || fail_build "npm install failed (server)"
say "API: generate Prisma client, type-check & compile"
as_app "cd '$REL/server' && npx prisma generate && npm run build" || fail_build "API build failed"
say "API: unit tests"
as_app "cd '$REL/server' && npm test" || fail_build "Unit tests failed"

# ---------------------------------------------------------------- 3. SPA build
say "SPA: install & build for base path ${BASE_PATH}"
as_app "cd '$REL/client' && $NPM_INSTALL && VITE_BASE_PATH='${BASE_PATH}' npm run build" || fail_build "SPA build failed"

# ---------------------------------------------------------------- 4. DB backup
say "Database: backup before migrating"
install -d -o root -g root -m 0700 "$SHARED/backups"
BACKUP="$SHARED/backups/${DB_NAME}-$(basename "$REL").sql.gz"
(cd / && sudo -u postgres pg_dump --no-owner "$DB_NAME") | gzip > "$BACKUP" || fail_build "pg_dump failed"
ls -1t "$SHARED"/backups/*.sql.gz | tail -n +$((KEEP_BACKUPS + 1)) | xargs -r rm -f
ok "Backup: $BACKUP"

# ---------------------------------------------------------------- 5. migrate
say "Database: apply migrations"
as_app "cd '$REL/server' && npx prisma migrate deploy" || fail_build "Migration failed (DB backup: $BACKUP)"

# ---------------------------------------------------------------- 6. switch
OLD="$(current_release)"
OLD_PREV="$(previous_release)"
say "Switching to $(basename "$REL")"
switch_to "$REL"
[[ -n "$OLD" && "$OLD" != "$REL" ]] && ln -sfn "$OLD" "$BASE/previous"
publish_spa "$REL"
systemctl restart "$SERVICE"

# ---------------------------------------------------------------- 7. verify
if health; then
  for part in server client; do
    [[ -f "$REL/$part/package-lock.json" ]] && install -o "$APP" -g "$APP" -m 0640 "$REL/$part/package-lock.json" "$SHARED/locks/$part-package-lock.json"
  done
  # Keep the newest releases (never delete current/previous).
  ls -1dt "$RELEASES"/*/ | sed 's#/$##' | tail -n +$((KEEP_RELEASES + 1)) | while read -r d; do
    [[ "$d" == "$(current_release)" || "$d" == "$(previous_release)" ]] || rm -rf "$d"
  done
  ok "Release $(basename "$REL") is live."
  exit 0
fi

journalctl -u "$SERVICE" -n 60 --no-pager || true
if [[ -n "$OLD" && -d "$OLD" ]]; then
  warn "New release failed its health check — rolling back to $(basename "$OLD")"
  switch_to "$OLD"; publish_spa "$OLD"; systemctl restart "$SERVICE"
  if [[ -n "$OLD_PREV" ]]; then ln -sfn "$OLD_PREV" "$BASE/previous"; else rm -f "$BASE/previous"; fi
  rm -rf "$REL"
  health && warn "Rolled back; the previous version is serving. DB backup from before this deploy: $BACKUP" \
         || warn "Rollback also unhealthy — investigate: journalctl -u $SERVICE -n 200"
fi
die "Deploy failed (logs above)."
