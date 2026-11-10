#!/usr/bin/env bash
# Launch a Chrome window that the QA tools attach to over CDP.
#
# Why a dedicated profile: recent Chrome blocks --remote-debugging-port on the
# default profile for security, so this script uses a separate profile dir.
# Sign into your app once in this window, the session persists in the profile.
#
# usage: launch-chrome.sh [start-url]   (PORT=9222, QA_CHROME_PROFILE=~/.qa-chrome, CHROME=<binary>)
# The drivers in tools/ then attach to http://localhost:$PORT with no further setup.

set -euo pipefail

PORT="${PORT:-9222}"
PROFILE="${QA_CHROME_PROFILE:-$HOME/.qa-chrome}"
if [ -z "${CHROME:-}" ]; then
  for c in "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
           google-chrome google-chrome-stable chromium chromium-browser; do
    if [ -x "$c" ] || command -v "$c" >/dev/null 2>&1; then CHROME="$c"; break; fi
  done
fi
[ -n "${CHROME:-}" ] || { echo "No Chrome found, set CHROME=/path/to/chrome"; exit 1; }

if curl -s --max-time 1 "http://localhost:$PORT/json/version" >/dev/null 2>&1; then
  echo "Port $PORT is already in use: a debug Chrome may already be running."
  echo "Check: curl -s http://localhost:$PORT/json/version"
  exit 1
fi

echo "Launching Chrome (profile: $PROFILE) with remote debugging on port $PORT ..."
"$CHROME" \
  --remote-debugging-port="$PORT" \
  --user-data-dir="$PROFILE" \
  "${1:-about:blank}" \
  >/dev/null 2>&1 &

echo "Done. Sign into your app in that window."
