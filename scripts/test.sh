#!/usr/bin/env bash
#
# The repo's quality gate: bash -n on every script, then the backend pytest suite. The first run
# creates .venv at the repo root, and stops when python3 cannot create one with pip in it
# (install python3-venv); every run installs requirements-dev.txt into it.
#
#   ./scripts/test.sh [pytest argument...]   run the gate; exits non-zero at the first failure
#   -h, --help                               show this help
#
# Every argument other than -h/--help is passed to pytest, by design, so pytest is the one to
# reject an argument it does not take.
#
# Examples:
#   ./scripts/test.sh
#   ./scripts/test.sh tests/test_template.py -k schedule
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/app-env.sh
source "$SCRIPT_DIR/lib/app-env.sh"

case "${1:-}" in
    -h | --help) print_help; exit 0 ;;
esac

step "bash -n on every script"
for script in "$SCRIPT_DIR"/*.sh "$SCRIPT_DIR"/lib/*.sh "$SCRIPT_DIR"/tools/*.sh \
    "$APP_FOLDER/.githooks/pre-commit"; do
    bash -n "$script" || die "Syntax error in $script"
done
ok "All scripts parse."

step "pytest"
cd "$APP_FOLDER"
[[ -d .venv ]] || python3 -m venv .venv ||
    die "python3 -m venv failed; install python3-venv (sudo apt install python3-venv) and rerun"
# Debian's python3 creates a venv without pip unless python3-venv is installed.
[[ -f .venv/bin/pip ]] ||
    die ".venv has no pip; install python3-venv (sudo apt install python3-venv)," \
        "delete .venv and rerun"
.venv/bin/pip install -q -r requirements-dev.txt
.venv/bin/pytest "$@"
