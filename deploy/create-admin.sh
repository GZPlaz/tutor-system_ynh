#!/usr/bin/env bash
# Create (or promote) an administrator and print a one-time set-password link.
#   sudo bash create-admin.sh gabez@mindaccel.org
set -euo pipefail
APP="${APP:-my_webapp__5}"
DIR="/var/www/${APP}/app/current/server"
[[ $EUID -eq 0 ]] || { echo "Run with sudo." >&2; exit 1; }
[[ -n "${1:-}" ]] || { echo "Usage: sudo bash create-admin.sh email@example.com" >&2; exit 1; }
[[ -f "$DIR/dist/cli/create-admin.js" ]] || { echo "No live release yet — run deploy.sh first." >&2; exit 1; }
cd "$DIR" && sudo -u "$APP" node --env-file=.env dist/cli/create-admin.js "$1"
