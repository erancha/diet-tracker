#!/bin/bash
# Puts one message into the deployed undelivered table so the app shows it behind the header's
# alarm bell, the way it shows a message SES actually refused.
#
# The point is to see that surface on an account whose address is verified — the only accounts
# left in the SES sandbox never hit the real path, so without this the feature can only be watched
# happening to somebody else. The row is written directly rather than by making SES refuse
# anything: everything downstream of the refusal (the stored item, the API read, the bell, the
# dismissal) is exercised for real, the refusal itself is not.
#
# Dismissing the message in the app deletes the row, so this leaves nothing behind once looked at.
#
# Usage:
#   scripts/simulate-rejected-email.sh <email> [--subject <text>] [--body <text>] [--env <suffix>]
#
# Options:
#   --subject <text>  Subject line to show (default: the nightly tracking reminder's)
#   --body <text>     Body to show (default: the nightly tracking reminder's)
#   --env <suffix>    Target an isolated stack pair (same suffix as deploy.sh)
#   --help, -h        Show this usage
#
# Examples:
#   scripts/simulate-rejected-email.sh someone@gmail.com
#   scripts/simulate-rejected-email.sh someone@gmail.com --subject 'סיכום שבועי' --body 'שבוע טוב'
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/aws-config.sh

usage() {
  sed -n '/^# Usage:/,/^set /p' "$0" | sed '$d; s/^# \{0,3\}//'
  exit "$1"
}

# The nightly reminder's own wording, so the default lands in the bell reading exactly like the
# message a user would have missed. Mirrors REMINDER_SUBJECT/REMINDER_TEXT in src/handlers/nudge.py.
SUBJECT="תזכורת — רישום ארוחות"
BODY="עדיין לא רשמת ארוחות היום 🌙"

EMAIL="" ENV_SUFFIX=""
while [ $# -gt 0 ]; do
  case "$1" in
    --subject) SUBJECT="$2"; shift 2 ;;
    --body)    BODY="$2"; shift 2 ;;
    --env)     ENV_SUFFIX="-$2"; shift 2 ;;
    --help|-h) usage 0 ;;
    -*)        echo "unknown argument: $1" >&2; usage 1 ;;
    *)         [ -z "$EMAIL" ] || { echo "unexpected argument: $1" >&2; usage 1; }
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

TABLE=$(aws cloudformation describe-stack-resources --stack-name "$APP" \
  --logical-resource-id UndeliveredTable \
  --query "StackResources[0].PhysicalResourceId" --output text)

# The sort key the app dates the message by, in the UTC ISO form common/undelivered.py writes.
AT=$(date -u +%Y-%m-%dT%H:%M:%S.%6N+00:00)

aws dynamodb put-item --table-name "$TABLE" --item "$(jq -n \
  --arg pk "$SUB" --arg sk "$AT" --arg subject "$SUBJECT" --arg body "$BODY" \
  '{pk: {S: $pk}, sk: {S: $sk}, subject: {S: $subject}, body: {S: $body}}')"

echo "Wrote an undelivered message for $EMAIL (sub $SUB) at $AT"
echo "Open the app and press the alarm bell in the header; dismissing it there deletes the row."
