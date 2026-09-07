#!/bin/bash
# Operations helper for the deployed stacks. CloudFormation appends random suffixes to the
# Lambda names, so this script resolves stable function targets to the real resources and works
# with their CloudWatch log groups.
#
# Usage:
#   scripts/aws-helper.sh --logs <target> [--since 1h] [--follow] [--errors | --filter <pattern>]
#   scripts/aws-helper.sh --log-group <target>
#   scripts/aws-helper.sh --functions
#
# A target is an alias (api, nudge, presignup, rag) or <stack>:<logical-id> for any Lambda the
# configured credentials can describe.
#
# Options:
#   --logs <target>      Tail the function's CloudWatch log group
#   --log-group <target> Print the function's log group path
#   --functions          List the deployed Lambda functions of both stacks
#   --since <duration>   How far back to read logs (aws logs tail syntax; default 1h)
#   --follow             Keep streaming new log events
#   --errors             Show only warning and error events (a --filter preset)
#   --filter <pattern>   CloudWatch filter pattern, e.g. '"email sent"'
#   --env <suffix>       Target an isolated stack pair (same suffix as deploy.sh)
#   --help, -h           Show this usage
#
# Examples:
#   scripts/aws-helper.sh --logs api --since 1d            # yesterday's API activity
#   scripts/aws-helper.sh --logs nudge --follow            # watch tonight's jobs live
#   scripts/aws-helper.sh --logs rag --errors --since 1d   # Summaries.AI RAG problems, last day
#   scripts/aws-helper.sh --logs sum:BillingFunction --errors     # any Lambda by stack:logical-id
#   scripts/aws-helper.sh --logs api --since 3h --filter '"email sent"'
#   scripts/aws-helper.sh --log-group nudge                # path for the console / Logs Insights
set -euo pipefail
cd "$(dirname "$0")/.."
# AWS_CONFIG lets the tests substitute a stub for the gitignored credentials file, which only
# developer machines hold; a missing file still aborts loudly here rather than as a puzzling
# NoCredentials failure at the first aws call.
source "${AWS_CONFIG:-scripts/aws-config.sh}"

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
    # The level names cover both runtimes: Python logging emits [ERROR]/[WARNING], Node's
    # console methods emit ERROR/WARN; filter terms match whole delimited words, case-sensitive.
    --errors)    FILTER="?ERROR ?WARN ?WARNING"; shift ;;
    --filter)    FILTER="$2"; shift 2 ;;
    --env)       ENV_SUFFIX="-$2"; shift 2 ;;
    --help|-h)   usage 0 ;;
    *)           echo "unknown argument: $1" >&2; usage 1 ;;
  esac
done
[ -n "$ACTION" ] || usage 1

APP="diet-tracker${ENV_SUFFIX}"

# Sets STACK and LOGICAL for a target. Runs in the parent shell (never inside a command
# substitution) so an unknown target aborts the whole script, not just a subshell.
# The rag alias points at Summaries.AI's production stack; both apps share one AWS account,
# so the sourced credentials cover it. Any other Lambda is reachable as <stack>:<logical-id>.
resolve() {
  case "$1" in
    api)       STACK="$APP";           LOGICAL=ApiFunction ;;
    nudge)     STACK="$APP";           LOGICAL=NudgeFunction ;;
    presignup) STACK="${APP}-cognito"; LOGICAL=PreSignupFunction ;;
    rag)       STACK=sum;              LOGICAL=RagQueryFunction ;;
    *:*)       STACK="${1%%:*}";       LOGICAL="${1#*:}" ;;
    *)         echo "unknown target: $1 (expected api, nudge, presignup, rag, or <stack>:<logical-id>)" >&2
               exit 1 ;;
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
