#!/usr/bin/env bash
# Shared helpers for the scripts that target a stack pair: help text, the environment suffix and
# stack lookups. Sourced, never run.
set -euo pipefail

# Print the calling script's header comment block as --help text (single source of usage docs).
print_help() { awk 'NR==1 {next} /^#/ {sub(/^# ?/, ""); print; next} {exit}' "$0"; }

# For every script that targets a stack pair: an optional bare environment suffix ("dev" targets
# the isolated stack pair diet-tracker-dev). Handles -h and unknown arguments, then sets APP and
# ENV_SUFFIX.
parse_env_suffix_arg() {
  case "${1:-}" in
    -h|--help) print_help; exit 0 ;;
    -*) print_help >&2; exit 2 ;;
  esac
  [ $# -le 1 ] || { print_help >&2; exit 2; }
  ENV_SUFFIX="${1:+-$1}"
  APP="diet-tracker${ENV_SUFFIX}"
}

# The text result of a CloudFormation lookup on one stack; empty when the stack does not exist yet
# or the lookup matches nothing. Any other failure (credentials, network, access denied) stops the
# script. The CLI's stderr is kept apart from the value and passed on, so a warning never becomes
# part of it.
cfn_query() {  # subcommand stack [argument...]
  local out err errors
  errors=$(mktemp)
  if ! out=$(aws cloudformation "$1" --stack-name "$2" "${@:3}" --output text 2>"$errors"); then
    err=$(<"$errors")
    rm -f "$errors"
    case "$err" in
      *"does not exist"*) return 0 ;;
      *) echo "$1 $2 failed: $err" >&2; return 1 ;;
    esac
  fi
  cat "$errors" >&2
  rm -f "$errors"
  [ "$out" = "None" ] || printf '%s' "$out"
}
