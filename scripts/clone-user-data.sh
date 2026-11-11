#!/usr/bin/env bash
# Copies one user's recorded data into the isolated stack pair of a feature branch, to rehearse
# the app at a larger user count. Production is only read; every write lands in the stack pair
# the current git branch selects, as deploy.sh does, and the production pair is refused as a
# target, so the script runs from a feature branch only.
#
# Usage:
#   scripts/clone-user-data.sh mirror <email>
#   scripts/clone-user-data.sh fictive <email> [--count <n>]
#   scripts/clone-user-data.sh delete
#
# Actions:
#   mirror    Replaces the address's rows in the branch stack with its production rows (days,
#             meals, weights, chats, undelivered messages, nudge state). The address must
#             already have an account in the branch stack's pool.
#   fictive   Copies the address's branch-stack rows to <n> accounts (default 100) created
#             directly in the branch stack's pool as fictive-NNN@example.invalid: no Google
#             account, no email sent, notifications muted, shared chats kept shared. Re-running
#             replaces their rows.
#   delete    Removes every fictive account and its rows from the branch stack.
#
# Examples:
#   scripts/clone-user-data.sh mirror someone@gmail.com
#   scripts/clone-user-data.sh fictive someone@gmail.com
#   scripts/clone-user-data.sh delete
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/app-env.sh
source "$SCRIPT_DIR/lib/app-env.sh"

# The documented forms only, checked here so a usage mistake prints this help, before any
# credentials are read.
case "${1:-}" in
  --help|-h) print_help; exit 0 ;;
  mirror) [ $# -eq 2 ] || usage_error "mirror takes one email address" ;;
  fictive)
    [ $# -eq 2 ] || { [ $# -eq 4 ] && [ "$3" = --count ] && [[ "$4" =~ ^[1-9][0-9]*$ ]]; } ||
      usage_error "fictive takes one email address and an optional --count <n>" ;;
  delete) [ $# -eq 1 ] || usage_error "delete takes no argument" ;;
  "") usage_error "No action given" ;;
  *) usage_error "Unknown action: $1" ;;
esac
cd "$APP_FOLDER"
[ -x .venv/bin/python ] || { echo "no .venv — run scripts/test.sh once to create it" >&2; exit 1; }
load_aws_config
resolve_stack
PYTHONPATH=src exec .venv/bin/python scripts/clone_user_data.py --target-stack "$STACK_NAME" "$@"
