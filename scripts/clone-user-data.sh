#!/bin/bash
# Copies one user's recorded data into an isolated stack pair, to rehearse the app at a larger
# user count. Production is only read; every write lands in the --env stacks.
#
# Usage:
#   scripts/clone-user-data.sh mirror <email> --env <suffix>
#   scripts/clone-user-data.sh fictive <email> [--count <n>] --env <suffix>
#   scripts/clone-user-data.sh delete --env <suffix>
#
# Actions:
#   mirror    Replaces the address's rows in the --env stack with its production rows (days,
#             meals, weights, chats, undelivered messages, nudge state). The address must
#             already have an account in the --env pool.
#   fictive   Copies the address's --env rows to <n> accounts (default 100) created directly in
#             the --env pool as fictive-NNN@example.invalid: no Google account, no email sent,
#             notifications muted, shared chats kept shared. Re-running replaces their rows.
#   delete    Removes every fictive account and its rows from the --env stack.
#
# Examples:
#   scripts/clone-user-data.sh mirror someone@gmail.com --env dev
#   scripts/clone-user-data.sh fictive someone@gmail.com --env dev
#   scripts/clone-user-data.sh delete --env dev
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/aws-config.sh

[ -x .venv/bin/python ] || { echo "no .venv — run scripts/test.sh once to create it" >&2; exit 1; }
case "${1:-}" in
  ""|--help|-h) sed -n '/^# Usage:/,/^set /p' "$0" | sed '$d; s/^# \{0,3\}//'; exit 0 ;;
esac
PYTHONPATH=src exec .venv/bin/python scripts/clone_user_data.py "$@"
