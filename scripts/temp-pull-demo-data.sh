#!/bin/bash
# Read-only dump of one user's tracked data from the deployed tables, as the JSON DynamoDB
# returns it. It exists to seed frontend/public/demo.html's snapshot from real recorded days
# rather than from invented ones; nothing in the app reads its output.
#
# Every call is a read: the stack's table names, the user's sub from the pool, then the day
# records, the meals and the whole weight series.
#
# Usage:
#   scripts/temp-pull-demo-data.sh <email> [--from <date>] [--to <date>] [--out <path>]
#                                 [--env <suffix>]
#
# Options:
#   --from <date>   First day to read, ISO (default: 30 days before --to)
#   --to <date>     Last day to read, ISO (default: today)
#   --out <path>    Where to write the JSON (default: demo-data.json in the current directory)
#   --env <suffix>  Target an isolated stack pair (same suffix as deploy.sh)
#   --help, -h      Show this usage
#
# Example:
#   scripts/temp-pull-demo-data.sh someone@gmail.com --from 2026-09-01 --to 2026-09-10
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.local/bin:$PATH"
source scripts/aws-config.sh

usage() { sed -n '2,21p' "$0" | sed 's/^# \{0,1\}//'; }

EMAIL=""
TO=$(date +%F)
FROM=""
OUT=demo-data.json
ENV_SUFFIX=""
while [ $# -gt 0 ]; do
  case "$1" in
    --from) FROM="$2"; shift 2 ;;
    --to)   TO="$2";   shift 2 ;;
    --out)  OUT="$2";  shift 2 ;;
    --env)  ENV_SUFFIX="$2"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    -*) echo "unknown option $1" >&2; usage >&2; exit 2 ;;
    *)  EMAIL="$1"; shift ;;
  esac
done
[ -n "$EMAIL" ] || { echo "an email is required" >&2; usage >&2; exit 2; }
[ -n "$FROM" ] || FROM=$(date -d "$TO - 30 days" +%F)
# Meal sort keys are "<date>#<id>", so the range ends at the day after --to to take every meal of
# that day itself without relying on a high sentinel character.
AFTER_TO=$(date -d "$TO + 1 day" +%F)

APP="diet-tracker${ENV_SUFFIX}"

resource() {
  aws cloudformation describe-stack-resources --stack-name "$1" \
    --logical-resource-id "$2" --query 'StackResources[0].PhysicalResourceId' --output text
}

DAYS=$(resource "$APP" DaysTable)
MEALS=$(resource "$APP" MealsTable)
WEIGHTS=$(resource "$APP" WeightsTable)
POOL=$(resource "${APP}-cognito" UserPool)

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
