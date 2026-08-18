#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [ ! -d .venv ]; then
  if ! python3 -m venv .venv; then
    echo "WARNING: venv with pip unavailable (python3 -m venv failed); falling back to system python3 with --break-system-packages" >&2
    python3 -m pip install -q --break-system-packages -r requirements-dev.txt
    python3 -m pytest "$@"
  else
    .venv/bin/pip install -q -r requirements-dev.txt
    .venv/bin/pytest "$@"
  fi
else
  if [ -f .venv/bin/pip ]; then
    .venv/bin/pip install -q -r requirements-dev.txt
    .venv/bin/pytest "$@"
  else
    echo "WARNING: venv created without pip; falling back to system python3 with --break-system-packages" >&2
    python3 -m pip install -q --break-system-packages -r requirements-dev.txt
    python3 -m pytest "$@"
  fi
fi
