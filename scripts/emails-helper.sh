#!/bin/bash
# Helper for the app's outgoing mail, against the deployed stacks. Each action is named by its own
# parameter and acts on one user, so a surface can be looked at on demand instead of waiting for a
# schedule to fire or for SES to refuse something. Most only simulate; --verify really asks SES to
# send, and the usage below says which is which.
#
# Usage:
#   scripts/emails-helper.sh --rejected <email> [--subject <text>] [--body <text>] [--env <suffix>]
#   scripts/emails-helper.sh --weekly-recap <email> [--send] [--env <suffix>]
#   scripts/emails-helper.sh --verify <email> [--env <suffix>]
#
# Simulations:
#   --rejected <email>      Show that user a message as one SES refused to deliver
#   --weekly-recap <email>  Run the weekly recap job for that user now, rather than on its schedule
#
# Real actions:
#   --verify <email>        Ask SES to mail that address its verification request again
#
# Options:
#   --subject <text>  With --rejected: subject to show (default: the nightly reminder's)
#   --body <text>     With --rejected: body to show (default: the nightly reminder's)
#   --send            With --weekly-recap: really answer, deliver and store, instead of printing
#   --env <suffix>    Target an isolated stack pair (same suffix as deploy.sh)
#   --help, -h        Show this usage
#
# Examples:
#   scripts/emails-helper.sh --rejected someone@gmail.com
#   scripts/emails-helper.sh --rejected someone@gmail.com --subject 'סיכום שבועי' --body 'שבוע טוב'
#   scripts/emails-helper.sh --weekly-recap someone@gmail.com          # what the week would send
#   scripts/emails-helper.sh --weekly-recap someone@gmail.com --send   # send it, to that user only
#   scripts/emails-helper.sh --verify someone@gmail.com                # re-request a dead link
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

ACTION="" EMAIL="" SEND="" ENV_SUFFIX=""
while [ $# -gt 0 ]; do
  # Every flag below that names a value, checked once here so a missing one prints the usage
  # rather than tripping over set -u.
  case "$1" in
    --rejected|--weekly-recap|--verify|--subject|--body|--env)
      [ $# -ge 2 ] || { echo "$1 needs a value" >&2; usage 1; } ;;
  esac
  case "$1" in
    --rejected|--weekly-recap|--verify) ACTION="${1#--}"; EMAIL="$2"; shift 2 ;;
    --subject) SUBJECT="$2"; shift 2 ;;
    --body)    BODY="$2"; shift 2 ;;
    --send)    SEND=1; shift ;;
    --env)     ENV_SUFFIX="-$2"; shift 2 ;;
    --help|-h) usage 0 ;;
    *)         echo "unknown argument: $1" >&2; usage 1 ;;
  esac
done
[ -n "$ACTION" ] && [ -n "$EMAIL" ] || usage 1

APP="diet-tracker${ENV_SUFFIX}"

# Writes the message directly rather than making SES refuse one: everything downstream of the
# refusal (the stored item, the API read, the bell, the dismissal) is exercised for real, the
# refusal itself is not. The point is to see that surface on an account whose address is verified —
# the accounts left in the SES sandbox never hit the real path, so without this the feature can
# only be watched happening to somebody else. Dismissing the message in the app deletes the row,
# so this leaves nothing behind once looked at.
rejected() {
  POOL=$(aws cloudformation describe-stacks --stack-name "${APP}-cognito" \
    --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" --output text)

  USERNAME=$(aws cognito-idp list-users --user-pool-id "$POOL" --filter "email = \"$EMAIL\"" \
    --query "Users[].Username" --output text)
  [ -n "$USERNAME" ] || { echo "no user with email $EMAIL in pool $POOL" >&2; exit 1; }
  [ "$(wc -w <<<"$USERNAME")" -eq 1 ] \
    || { echo "email $EMAIL matches several accounts: $USERNAME" >&2; exit 1; }

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
}

# Runs the scheduled job's own code, from the working tree, with its audience narrowed to the one
# account — so what a rule or config edit will send can be read before it is deployed. The AWS
# inputs come from the deployed NudgeFunction's environment, leaving the questionnaire as the only
# thing read from the working tree. Without --send both delivery channels and the transcript write
# are replaced by prints and nothing leaves the machine; with it, the recap lands in that user's
# mail and chat list, where it can be followed up and deleted like any other chat.
weekly_recap() {
  [ -x .venv/bin/python ] \
    || { echo "no .venv — run scripts/test.sh once to create it" >&2; exit 1; }

  FUNCTION=$(aws cloudformation describe-stack-resources --stack-name "$APP" \
    --logical-resource-id NudgeFunction \
    --query "StackResources[0].PhysicalResourceId" --output text)

  # Every variable the deployed job runs with, as shell-quoted export lines, so this run reads the
  # same resources the schedule does without restating a single name here.
  eval "$(aws lambda get-function-configuration --function-name "$FUNCTION" \
    --query 'Environment.Variables' --output json \
    | python3 -c 'import json, shlex, sys
for name, value in json.load(sys.stdin).items():
    print(f"export {name}={shlex.quote(value)}")')"
  export APP_CONFIG_PATH=config/app.json

  EMAIL="$EMAIL" SEND="$SEND" PYTHONPATH=src .venv/bin/python - <<'PY'
import dataclasses
import os

from handlers import nudge

send = bool(os.environ["SEND"])

# A week with no closed day has nothing to recap and stores no chat. Recording the write is what
# lets this run report whether the week produced one.
stored = []
store_chat = nudge.chat_history.append


def append(table, sub, question, answer, sources, **marks):
    stored.append(question)
    if send:
        return store_chat(table, sub, question, answer, sources, **marks)
    print(f"--- would store the chat {question!r} ---\n")
    return None


nudge.chat_history.append = append

if not send:
    nudge.notify.send_telegram = lambda token, chat, text: print(f"--- would telegram {chat} ---\n")
    nudge.notify.send_email = lambda ses, sender, to, subject, body, app_url: print(
        f"--- would email {to} — {subject} ---\n{body}\n")

env = nudge._build_env()
# The job's own audience, so an address that is muted or absent from the pool is reported as the
# reason nothing happened rather than silently producing an empty run.
audience = [user for user in env.users if user.email == os.environ["EMAIL"]]
if not audience:
    raise SystemExit(f"{os.environ['EMAIL']} is not in the notifiable pool — unknown address, "
                     "or notifications muted in the account menu")
nudge._weekly(dataclasses.replace(env, users=audience))
if not stored:
    raise SystemExit("No day was closed in the week, so the opening line alone "
                     f"{'went out' if send else 'would go out'} and no chat was stored.")
PY

  if [ -n "$SEND" ]; then
    echo "Sent the weekly recap to $EMAIL and stored it as a chat; open the app's chat list to"
    echo "read it, follow it up, or delete it."
  else
    echo "Dry run — nothing was sent or stored. Add --send to do it for real."
  fi
}

# Asks SES to mail the address its verification request again. In the sandbox a message reaches
# only an address that is itself a verified identity, and the request's link dies 24 hours after
# it is sent, so an address whose window expired has no way back on its own: the sign-up trigger
# runs once per account, and an account that already exists never signs up again. Skipping an
# address SES already reports as verified is the same guard src/handlers/presignup.py applies, so
# running this against a working address costs nothing.
verify() {
  # SES email identities are case sensitive, and sign-up creates the identity from the lowercased
  # address, so both the lookup and the request have to name it in that same form.
  ADDRESS=$(tr "[:upper:]" "[:lower:]" <<<"$EMAIL")

  status() {
    aws ses get-identity-verification-attributes --identities "$ADDRESS" \
      --query "VerificationAttributes.\"$ADDRESS\".VerificationStatus" --output text
  }

  BEFORE=$(status)
  # SES leaves an address it has never been asked about out of its answer, which the CLI renders
  # as None — a state of its own, and the one a sign-up whose SES call failed leaves behind.
  echo "SES reports $ADDRESS as ${BEFORE/None/an address it has never been asked about}"
  if [ "$BEFORE" = "Success" ]; then
    echo "Already verified — no request sent."
    return
  fi

  aws ses verify-email-identity --email-address "$ADDRESS"
  echo "Requested verification; SES now reports $(status)."
  echo "Amazon Web Services has mailed $ADDRESS a confirmation link that expires in 24 hours."
  echo "It commonly lands in spam, since it comes from a sender the recipient does not know."
}

case "$ACTION" in
  rejected)     rejected ;;
  weekly-recap) weekly_recap ;;
  verify)       verify ;;
esac
