#!/bin/bash
# =============================================================================
# Shared helpers for the MindAccel package scripts (install / upgrade / restore …).
# Sourced BEFORE /usr/share/yunohost/helpers; the functions below only call
# YunoHost helpers when they run, never while being defined.
# =============================================================================

die() { echo "ERROR: $*" >&2; exit 1; }

# ----------------------------------------------------------------------------
# Application source (shipped inside this package, in app/)
# ----------------------------------------------------------------------------
package_dir() {
    if [[ -n "${YNH_APP_BASEDIR:-}" ]]; then echo "$YNH_APP_BASEDIR"; else (cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd); fi
}

# Copy server/ and client/ into $install_dir. node_modules and dist are left alone
# (they are rebuilt), and so is .env (the admin's configuration).
sync_app_source() {
    local src; src="$(package_dir)/app"
    [[ -d "$src/server" && -d "$src/client" ]] || die "The package is incomplete: $src/server or $src/client is missing."
    mkdir -p "$install_dir/server" "$install_dir/client" "$install_dir/bin"
    rsync -a --delete --exclude node_modules --exclude dist "$src/server/" "$install_dir/server/"
    rsync -a --delete --exclude node_modules --exclude dist "$src/client/" "$install_dir/client/"
    install -m 0755 "$(package_dir)/conf/import-legacy.sh" "$install_dir/bin/import-legacy.sh"
    install -m 0755 "$(package_dir)/conf/doctor.sh" "$install_dir/bin/doctor.sh"
    chown -R "$app:$app" "$install_dir"
}

# Run a command as the app's system user with Node.js on the PATH.
run_as_app() { ynh_exec_as_app env PATH="$path_with_nodejs" HOME="$install_dir" "$@"; }

# URL path the web app is built for: "/" or "/sub/".
web_base_path() { local p="${1:-$path}"; echo "${p%/}/"; }

build_client() {
    local base; base="$(web_base_path "${1:-$path}")"
    run_as_app bash -c "cd '$install_dir/client' && npm ci --no-audit --no-fund && VITE_BASE_PATH='$base' npm run build"
    # The build tools are not needed at runtime; the source stays for the next upgrade.
    ynh_safe_rm "$install_dir/client/node_modules"
}

build_app() {
    ynh_script_progression "Installing server dependencies (a few minutes)..."
    run_as_app bash -c "cd '$install_dir/server' && npm ci --no-audit --no-fund && npx prisma generate && npm run build"
    ynh_script_progression "Building the web app..."
    build_client
}

# ----------------------------------------------------------------------------
# .env  (the admin's configuration; created once, never overwritten by upgrades)
# ----------------------------------------------------------------------------

# Node's --env-file parser needs quotes around values with spaces, # or $.
env_quote() {
    local v="$1"
    [[ "$v" != *'"'* && "$v" != *$'\n'* ]] || die "A setting contains a double quote or a line break, which .env cannot hold."
    if [[ "$v" =~ [[:space:]\#\$\'\`] ]]; then printf '"%s"' "$v"; else printf '%s' "$v"; fi
}

write_env_file() {
    local app_url="https://${domain}${path%/}"
    local mail_enabled=false mail_from
    [[ -n "${smtp_user:-}" && -n "${smtp_password:-}" ]] && mail_enabled=true
    mail_from="MindAccel Tutoring <${smtp_user:-notifications@${domain}}>"

    (
        umask 077
        cat > "$install_dir/.env" <<ENV
# MindAccel Tutoring — configuration. Read once at start-up.
# After editing:  sudo systemctl restart ${app}
# Day-to-day switches (sign-ups, booking rules, maintenance) are in the app: Admin → Settings.

NODE_ENV=production
PORT=${port}
HOST=127.0.0.1

# Public address, no trailing slash. Updated automatically by "yunohost app change-url".
APP_URL=${app_url}

DATABASE_URL=postgresql://${db_user}:${db_pwd}@localhost:5432/${db_name}?schema=public

JWT_ACCESS_SECRET=${jwt_secret}
ACCESS_TOKEN_TTL_MIN=15
REFRESH_TOKEN_TTL_DAYS=30
PASSWORD_RESET_TTL_MIN=60
INVITE_TTL_HOURS=72
MAX_FAILED_LOGINS=5
LOCKOUT_MINUTES=15

# --- Email (Google SMTP with an App Password) ---
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=$(env_quote "${smtp_user:-}")
SMTP_PASS=$(env_quote "${smtp_password:-}")
MAIL_FROM=$(env_quote "$mail_from")
EMAIL_ENABLED=${mail_enabled}

# --- Scheduling defaults (can be changed any time in Admin → Settings) ---
BOOKING_MIN_LEAD_HOURS=12
BOOKING_MAX_HORIZON_DAYS=60
BOOKING_SLOT_STEP_MIN=15
STUDENT_CANCEL_CUTOFF_HOURS=24
MEETING_LINK_NUDGE_MIN=15

# --- Files ---
UPLOAD_DIR=${data_dir}/uploads
UPLOAD_MAX_MB=25
CLIENT_DIST_DIR=${install_dir}/client/dist

LOG_LEVEL=info
ENV
    )
    chown "$app:$app" "$install_dir/.env"
    chmod 600 "$install_dir/.env"
}

# env_set KEY VALUE — replace the line or append it (awk, so any character is safe).
env_set() {
    local file="${ENV_FILE:-$install_dir/.env}" tmp
    tmp="$(mktemp)"
    KEY="$1" VAL="$2" awk 'BEGIN { FS = OFS = "="; k = ENVIRON["KEY"]; v = ENVIRON["VAL"] }
        $1 == k { print k "=" v; done = 1; next } { print } END { if (!done) print k "=" v }' "$file" > "$tmp"
    cat "$tmp" > "$file"
    rm -f "$tmp"
}

# Upgrades never rewrite .env; they only add keys that a newer version needs.
env_add_if_missing() {
    local file="${ENV_FILE:-$install_dir/.env}"
    grep -qE "^$1=" "$file" || printf '%s=%s\n' "$1" "$2" >> "$file"
}

# ----------------------------------------------------------------------------
# `mindaccel` command (also installed as /usr/local/bin/mindaccel)
# ----------------------------------------------------------------------------
write_cli_wrapper() {
    cat > "$install_dir/bin/mindaccel" <<CLI
#!/usr/bin/env bash
# MindAccel command line — generated by the YunoHost package (do not edit; upgrades rewrite it).
set -euo pipefail
APP="${app}"
INSTALL_DIR="${install_dir}"
NODE_DIR="${nodejs_dir}"

usage() {
  cat <<'HELP'
Usage: mindaccel <command>

  create-admin <email>        create or promote an administrator; prints a one-time password link
  verify                      check that the data, migrations and uploaded files are consistent
  doctor                      full health check (service, web, database, email)
  migrate                     apply pending database migrations
  status                      show which database migrations are applied
  import-legacy --from <app>  copy data from an old My Webapp instance (see its --help)
HELP
  exit "\${1:-0}"
}

as_app() {
  if [[ \$EUID -eq 0 ]]; then runuser -u "\$APP" -- env HOME="\$INSTALL_DIR" PATH="\$NODE_DIR:\$PATH" "\$@"
  else env PATH="\$NODE_DIR:\$PATH" "\$@"; fi
}

cmd="\${1:-help}"; shift || true
cd "\$INSTALL_DIR/server"
case "\$cmd" in
  create-admin) [[ \$# -eq 1 ]] || usage 1; as_app node --env-file="\$INSTALL_DIR/.env" dist/cli/create-admin.js "\$1" ;;
  verify)       as_app node --env-file="\$INSTALL_DIR/.env" dist/cli/verify-data.js ;;
  migrate)      as_app node --env-file="\$INSTALL_DIR/.env" node_modules/prisma/build/index.js migrate deploy ;;
  status)       as_app node --env-file="\$INSTALL_DIR/.env" node_modules/prisma/build/index.js migrate status ;;
  doctor)       exec bash "\$INSTALL_DIR/bin/doctor.sh" ;;
  import-legacy) exec bash "\$INSTALL_DIR/bin/import-legacy.sh" --app "\$APP" "\$@" ;;
  help|-h|--help) usage 0 ;;
  *) echo "Unknown command: \$cmd" >&2; usage 1 ;;
esac
CLI
    chmod 755 "$install_dir/bin/mindaccel"
    chown "$app:$app" "$install_dir/bin/mindaccel"
    ln -sf "$install_dir/bin/mindaccel" /usr/local/bin/mindaccel
}

# Everything is free since v4.1. Payment records are kept as history, but Stripe keeps billing
# any subscription that is still active there until it is cancelled in the Stripe dashboard.
legacy_payment_warnings() {
    local q="SELECT
      (SELECT count(*) FROM subscriptions WHERE status IN ('ACTIVE','TRIALING','PAST_DUE') AND NOT cancel_at_period_end),
      (SELECT count(*) FROM payments WHERE refund_requested_at IS NOT NULL)"
    local counts subs refunds
    counts="$(runuser -u postgres -- psql -X -qtA -F ' ' -d "$db_name" -c "$q" 2>/dev/null || true)"
    read -r subs refunds <<< "${counts:-0 0}"
    if [[ "${subs:-0}" -gt 0 ]]; then
        ynh_print_warn "$subs subscription(s) are still active in Stripe and will keep charging students. Payments were removed from MindAccel, so cancel them in the Stripe dashboard (Billing → Subscriptions)."
    fi
    if [[ "${refunds:-0}" -gt 0 ]]; then
        ynh_print_warn "$refunds refund(s) were still waiting to be retried. Issue them yourself in the Stripe dashboard (Payments)."
    fi
}

# Database schema: bring it up to the version this release expects.
migrate_database() {
    ynh_script_progression "Updating the database structure..."
    "$install_dir/bin/mindaccel" migrate
}
