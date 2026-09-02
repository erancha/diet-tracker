#!/bin/bash
# Resets one user to a first-time sign-in: deletes their Cognito account and every row they own
# across the four app tables. Cognito mints a new sub for the recreated account, so the rows must
# go with it — left behind they are orphans no sign-in can ever reach again. The email must still
# match the ALLOWED_EMAILS regex for the presignup gate to let the account back in.
#
# Usage:
#   scripts/reset-user.sh <email> [--keep-account] [--yes] [--env <suffix>]
#
# Options:
#   --keep-account   Delete the user's data only, keeping the Cognito account and its sub
#   --yes, -y        Skip the prompt for an account holding no data; a reset that would destroy
#                    days, meals, weighings or nudge state asks either way
#   --env <suffix>   Target an isolated stack pair (same suffix as deploy.sh)
#   --help, -h       Show this usage
#
# Examples:
#   scripts/reset-user.sh someone@gmail.com
#   scripts/reset-user.sh someone@gmail.com --keep-account   # wipe the log, keep the account
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/aws-config.sh

usage() {
  sed -n '/^# Usage:/,/^set /p' "$0" | sed '$d; s/^# \{0,3\}//'
  exit "$1"
}

EMAIL="" KEEP_ACCOUNT="" ASSUME_YES="" ENV_SUFFIX=""
while [ $# -gt 0 ]; do
  case "$1" in
    --keep-account) KEEP_ACCOUNT=1; shift ;;
    --yes|-y)       ASSUME_YES=1; shift ;;
    --env)          ENV_SUFFIX="-$2"; shift 2 ;;
    --help|-h)      usage 0 ;;
    -*)             echo "unknown argument: $1" >&2; usage 1 ;;
    *)              [ -z "$EMAIL" ] || { echo "unexpected argument: $1" >&2; usage 1; }
                    EMAIL="$1"; shift ;;
  esac
done
[ -n "$EMAIL" ] || usage 1

APP="diet-tracker${ENV_SUFFIX}"
POOL=$(aws cloudformation describe-stacks --stack-name "${APP}-cognito" \
  --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" --output text)

USERNAME=$(aws cognito-idp list-users --user-pool-id "$POOL" --filter "email = \"$EMAIL\"" \
  --query "Users[].Username" --output text)
[ -n "$USERNAME" ] || { echo "no user with email $EMAIL in pool $POOL" >&2; exit 1; }
[ "$(wc -w <<<"$USERNAME")" -eq 1 ] || { echo "email $EMAIL matches several accounts: $USERNAME" >&2; exit 1; }

SUB=$(aws cognito-idp admin-get-user --user-pool-id "$POOL" --username "$USERNAME" \
  --query "UserAttributes[?Name=='sub'].Value" --output text)

# The tables holding the user's rows under pk/sk, and the pk-only table beside them.
ROW_TABLES="DaysTable MealsTable WeightsTable"
STATE_TABLE="NudgeStateTable"

table() {
  aws cloudformation describe-stack-resources --stack-name "$APP" --logical-resource-id "$1" \
    --query "StackResources[0].PhysicalResourceId" --output text
}

# The sort keys the user owns in one pk/sk table, one per line. The AWS CLI paginates the query
# itself, so a long history is surveyed in full.
rows_of() {
  aws dynamodb query --table-name "$(table "$1")" --key-condition-expression "pk = :p" \
    --expression-attribute-values "{\":p\":{\"S\":\"$SUB\"}}" \
    --query "Items[].sk.S" --output text | tr '\t' '\n' | grep -v '^$' || true
}

# What the reset would destroy, surveyed before anything is deleted so the prompt can name it and
# the deletes can work from the same reading rather than querying a second time.
declare -A ROWS
HELD=0 INVENTORY=""
for logical in $ROW_TABLES; do
  ROWS[$logical]=$(rows_of "$logical")
  count=$([ -z "${ROWS[$logical]}" ] && echo 0 || grep -c . <<<"${ROWS[$logical]}")
  HELD=$((HELD + count))
  INVENTORY="${INVENTORY}  $logical: $count item(s)"$'\n'
done
STATE_HELD=$(aws dynamodb get-item --table-name "$(table "$STATE_TABLE")" \
  --key "{\"pk\":{\"S\":\"$SUB\"}}" --query "length(keys(@))" --output text)
HELD=$((HELD + STATE_HELD))
INVENTORY="${INVENTORY}  $STATE_TABLE: $STATE_HELD item(s)"

echo "Resetting $EMAIL (username $USERNAME, sub $SUB) in $APP"
[ -n "$KEEP_ACCOUNT" ] && echo "  the Cognito account is kept" || echo "  the Cognito account is deleted"
echo "$INVENTORY"

# Reads the answer from the source named, so a data-bearing reset can insist on the terminal and
# not be answered by whatever stdin happens to carry.
confirm() {
  local reply
  read -r -p "Proceed? [y/N] " reply <"$1"
  [ "$reply" = y ] || { echo "aborted"; exit 1; }
}

# An account holding nothing loses only its Cognito registration, which the next sign-in rebuilds,
# so --yes covers it. Rows are the user's own history and come back from nowhere once deleted, so
# that reset is confirmed at the terminal however the script was invoked.
if [ "$HELD" -gt 0 ]; then
  echo "This account holds recorded data — deleting it cannot be undone."
  confirm /dev/tty
elif [ -z "$ASSUME_YES" ]; then
  confirm /dev/stdin
fi

for logical in $ROW_TABLES; do
  name=$(table "$logical")
  count=0
  while read -r sk; do
    [ -n "$sk" ] || continue
    aws dynamodb delete-item --table-name "$name" \
      --key "{\"pk\":{\"S\":\"$SUB\"},\"sk\":{\"S\":\"$sk\"}}"
    count=$((count + 1))
  done <<<"${ROWS[$logical]}"
  echo "  $logical: $count item(s) deleted"
done
aws dynamodb delete-item --table-name "$(table "$STATE_TABLE")" --key "{\"pk\":{\"S\":\"$SUB\"}}"
echo "  $STATE_TABLE: cleared"

if [ -z "$KEEP_ACCOUNT" ]; then
  aws cognito-idp admin-delete-user --user-pool-id "$POOL" --username "$USERNAME"
  echo "  Cognito account deleted — the next Google sign-in re-runs the presignup allowlist gate"
fi
echo "Done."
