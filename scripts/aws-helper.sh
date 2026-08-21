#!/bin/bash
# Operations helper for the deployed stacks. CloudFormation appends random suffixes to the
# Lambda names, so this script resolves stable aliases (api, nudge, presignup) to the real
# resources and works with their CloudWatch log groups.
#
# Usage:
#   scripts/aws-helper.sh --logs <alias> [--since 1h] [--follow] [--filter <pattern>]
#   scripts/aws-helper.sh --log-group <alias>
#   scripts/aws-helper.sh --functions
#
# Options:
#   --logs <alias>       Tail the function's CloudWatch log group
#   --log-group <alias>  Print the function's log group path
#   --functions          List the deployed Lambda functions of both stacks
#   --since <duration>   How far back to read logs (aws logs tail syntax; default 1h)
#   --follow             Keep streaming new log events
#   --filter <pattern>   CloudWatch filter pattern, e.g. '?WARNING ?ERROR'
#   --env <suffix>       Target an isolated stack pair (same suffix as deploy.sh)
#   --help, -h           Show this usage
#
# Examples:
#   scripts/aws-helper.sh --logs api --since 1d            # yesterday's API activity
#   scripts/aws-helper.sh --logs nudge --follow            # watch tonight's jobs live
#   scripts/aws-helper.sh --logs api --filter '?ERROR ?WARNING'
#   scripts/aws-helper.sh --logs api --since 3h --filter '"email sent"'
#   scripts/aws-helper.sh --log-group nudge                # path for the console / Logs Insights
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/aws-config.sh

usage() {
  sed -n '/^# Usage:/,/^set /p' "$0" | sed '$d; s/^# \{0,3\}//'
  exit "$1"
}

ACTION="" TARGET="" SINCE="1h" FOLLOW="" FILTER="" ENV_SUFFIX=""
while [ $# -gt 0 ]; do
  case "$1" in
    --logs)      ACTION=logs; TARGET="$2"; shift 2 ;;
    --log-group) ACTION=log-group; TARGET="$2"; shift 2 ;;
    --functions) ACTION=functions; shift ;;
    --since)     SINCE="$2"; shift 2 ;;
    --follow)    FOLLOW=1; shift ;;
    --filter)    FILTER="$2"; shift 2 ;;
    --env)       ENV_SUFFIX="-$2"; shift 2 ;;
    --help|-h)   usage 0 ;;
    *)           echo "unknown argument: $1" >&2; usage 1 ;;
  esac
done
[ -n "$ACTION" ] || usage 1

APP="diet-tracker${ENV_SUFFIX}"

# Sets STACK and LOGICAL for an alias. Runs in the parent shell (never inside a command
# substitution) so an unknown alias aborts the whole script, not just a subshell.
resolve() {
  case "$1" in
    api)       STACK="$APP";           LOGICAL=ApiFunction ;;
    nudge)     STACK="$APP";           LOGICAL=NudgeFunction ;;
    presignup) STACK="${APP}-cognito"; LOGICAL=PreSignupFunction ;;
    *)         echo "unknown function alias: $1 (expected api, nudge, or presignup)" >&2; exit 1 ;;
  esac
}

log_group() {
  aws cloudformation describe-stack-resources --stack-name "$STACK" \
    --logical-resource-id "$LOGICAL" \
    --query "StackResources[0].PhysicalResourceId" --output text \
    | sed 's|^|/aws/lambda/|'
}

case "$ACTION" in
  logs)
    resolve "$TARGET"
    args=(--since "$SINCE" --format short)
    [ -n "$FOLLOW" ] && args+=(--follow)
    [ -n "$FILTER" ] && args+=(--filter-pattern "$FILTER")
    aws logs tail "$(log_group)" "${args[@]}"
    ;;
  log-group)
    resolve "$TARGET"
    log_group
    ;;
  functions)
    for stack in "$APP" "${APP}-cognito"; do
      aws cloudformation describe-stack-resources --stack-name "$stack" \
        --query "StackResources[?ResourceType=='AWS::Lambda::Function'].[LogicalResourceId,PhysicalResourceId]" \
        --output text
    done
    ;;
esac
