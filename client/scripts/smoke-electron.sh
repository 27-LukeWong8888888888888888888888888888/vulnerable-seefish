#!/usr/bin/env bash
# Real-Electron smoke run (Phase 6/7): boots the actual app with a hidden
# window; renderer/smoke.html executes the V4 chain + login round trip and
# exits 0 on success. Uses the packaged app.asar when present (proving the
# ASAR build works end to end), otherwise runs from source.
set -euo pipefail
cd "$(dirname "$0")/.."
export LAB_ELECTRON_SMOKE=1
export LAB_ELECTRON_NO_SANDBOX=1
if [ -f app.asar ]; then
  echo "smoke: running packaged app.asar"
  exec ./node_modules/.bin/electron --no-sandbox app.asar
fi
echo "smoke: running from source (app.asar not found — 'npm run pack' to build it)"
exec ./node_modules/.bin/electron --no-sandbox .
