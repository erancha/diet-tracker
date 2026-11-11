#!/usr/bin/env bash
# Read-only dump of one user's tracked data from the deployed tables, as the JSON DynamoDB
# returns it. It exists to seed frontend/public/demo.html's snapshot from real recorded days
# rather than from invented ones; nothing in the app reads its output.
#
# Every call is a read: the stack's table names, the user's sub from the pool, then the day
# records, the meals and the whole weight series.
#
# Usage:
#   scripts/temp-pull-demo-data.sh <email> [--from <date>] [--to <date>] [--out <path>]
#
# Acts on the stack pair the current git branch selects, as deploy.sh does.
#
# Options:
#   --from <date>   First day to read, ISO (default: 30 days before --to)
#   --to <date>     Last day to read, ISO (default: today)
#   --out <path>    Where to write the JSON (default: demo-data.json in the current directory)
#   --help, -h      Show this usage
#
# Example:
#   scripts/temp-pull-demo-data.sh someone@gmail.com --from 2026-09-01 --to 2026-09-10
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/app-env.sh
source "$SCRIPT_DIR/lib/app-env.sh"
export PATH="$HOME/.local/bin:$PATH"

TO=$(date +%F)
FROM=""
OUT=demo-data.json
POSITIONAL=()
while [ $# -gt 0 ]; do
  case "$1" in
    --from|--to|--out) [ $# -ge 2 ] || usage_error "$1 needs a value" ;;
  esac
  case "$1" in
    --from) FROM="$2"; shift 2 ;;
    --to)   TO="$2";   shift 2 ;;
    --out)  OUT="$2";  shift 2 ;;
    --help|-h) print_help; exit 0 ;;
    -*) usage_error "Unknown option: $1" ;;
    *)  POSITIONAL+=("$1"); shift ;;
  esac
done
[ ${#POSITIONAL[@]} -eq 1 ] || usage_error "Expected one email address"
EMAIL="${POSITIONAL[0]}"
cd "$APP_FOLDER"
load_aws_config
resolve_stack_pair
[ -n "$FROM" ] || FROM=$(date -d "$TO - 30 days" +%F)
# Meal sort keys are "<date>#<id>", so the range ends at the day after --to to take every meal of
# that day itself without relying on a high sentinel character.
AFTER_TO=$(date -d "$TO + 1 day" +%F)

resource() {
  aws cloudformation describe-stack-resources --stack-name "$1" \
    --logical-resource-id "$2" --query 'StackResources[0].PhysicalResourceId' --output text
}

DAYS=$(resource "$STACK_NAME" DaysTable)
MEALS=$(resource "$STACK_NAME" MealsTable)
WEIGHTS=$(resource "$STACK_NAME" WeightsTable)
POOL=$(resource "$COGNITO_STACK_NAME" UserPool)

SUB=$(aws cognito-idp list-users --user-pool-id "$POOL" \
  --filter "email = \"$EMAIL\"" \
  --query 'Users[0].Attributes[?Name==`sub`].Value' --output text)
[ -n "$SUB" ] && [ "$SUB" != "None" ] || { echo "no account for $EMAIL in $POOL" >&2; exit 1; }

echo "window: $FROM .. $TO" >&2

query() {
  aws dynamodb query --table-name "$1" \
    --key-condition-expression "$2" \
    --expression-attribute-values "$3" --output json
}

{
  echo '{"days":'
  query "$DAYS" 'pk = :u AND sk BETWEEN :a AND :b' \
    "{\":u\":{\"S\":\"$SUB\"},\":a\":{\"S\":\"$FROM\"},\":b\":{\"S\":\"$TO\"}}"
  echo ',"meals":'
  query "$MEALS" 'pk = :u AND sk BETWEEN :a AND :b' \
    "{\":u\":{\"S\":\"$SUB\"},\":a\":{\"S\":\"${FROM}#\"},\":b\":{\"S\":\"${AFTER_TO}#\"}}"
  echo ',"weights":'
  query "$WEIGHTS" 'pk = :u' "{\":u\":{\"S\":\"$SUB\"}}"
  echo '}'
} > "$OUT"

echo "wrote $OUT ($(wc -c < "$OUT") bytes)" >&2
