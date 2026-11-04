#!/bin/bash
# Lets the hosted API send the setup reminder email from hello@snapply.co.uk through Gmail.
# Asks for a Google app password (myaccount.google.com/apppasswords) without showing it, and stores it as a Fly secret.
set -euo pipefail
APP="${APP:-snapply-api}"
FLY="$HOME/.fly/bin/flyctl"; command -v flyctl >/dev/null && FLY=flyctl
read -r -s -p "Google app password (16 letters, spaces are fine): " PW; echo
PW="$(printf '%s' "$PW" | tr -d '[:space:]')"
[ ${#PW} -eq 16 ] || { echo "That is not 16 letters. Create one at https://myaccount.google.com/apppasswords and run this again."; exit 1; }
"$FLY" secrets set --app "$APP" SMTP_USER=tolgaoy5@gmail.com SMTP_PASSWORD="$PW" >/dev/null
echo "Saved. The server restarts and starts sending setup reminders to new sign-ups without a CV."
