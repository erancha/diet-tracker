#!/bin/bash
# Operations helper for the deployed stacks. CloudFormation appends random suffixes to the
# Lambda names, so this script resolves stable function targets to the real resources and works
# with their CloudWatch log groups.
#
# Usage:
#   scripts/aws-helper.sh --logs <target> [env] [--since 1h] [--follow]
#                         [--errors | --filter <pattern>]
#   scripts/aws-helper.sh --log-group <target> [env]
#   scripts/aws-helper.sh --functions [env]
#
# env: optional suffix (e.g. dev) naming the stack pair, as in deploy.sh.
#
# A target is an alias (api, nudge, questions, presignup, rag) or <stack>:<logical-id> for any
# Lambda the configured credentials can describe.
#
# Options:
#   --logs <target>      Tail the function's CloudWatch log group
#   --log-group <target> Print the function's log group path
#   --functions          List the deployed Lambda functions of both stacks
#   --since <duration>   How far back to read logs (aws logs tail syntax; default 1h)
#   --follow             Keep streaming new log events
#   --errors             Show only warning and error events (a --filter preset)
#   --filter <pattern>   CloudWatch filter pattern, e.g. '"email sent"'
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
# shellcheck source=common.sh
source scripts/common.sh
# AWS_CONFIG lets the tests substitute a stub for the gitignored credentials file, which only
# developer machines hold; a missing file still aborts loudly here rather than as a puzzling
# NoCredentials failure at the first aws call.
source "${AWS_CONFIG:-scripts/aws-config.sh}"

ACTION="" TARGET="" SINCE="1h" FOLLOW="" FILTER="" ENV_ARGS=()
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
    --help|-h)   print_help; exit 0 ;;
    -*)          print_help >&2; exit 2 ;;
    *)           ENV_ARGS+=("$1"); shift ;;
  esac
done
[ -n "$ACTION" ] || { print_help >&2; exit 2; }
parse_env_suffix_arg "${ENV_ARGS[@]}"
# The environment as the caller typed it, for the commands the messages suggest.
ENV_ARG="${ENV_SUFFIX:+ ${ENV_SUFFIX#-}}"

# Sets STACK and LOGICAL for a target. Runs in the parent shell (never inside a command
# substitution) so an unknown target aborts the whole script, not just a subshell.
# The rag alias points at Summaries.AI's production stack; both apps share one AWS account,
# so the sourced credentials cover it. Any other Lambda is reachable as <stack>:<logical-id>.
resolve() {
  case "$1" in
    api)       STACK="$APP";           LOGICAL=ApiFunction ;;
    nudge)     STACK="$APP";           LOGICAL=NudgeFunction ;;
    questions) STACK="$APP";           LOGICAL=AppQuestionFunction ;;
    presignup) STACK="${APP}-cognito"; LOGICAL=PreSignupFunction ;;
    rag)       STACK=sum;              LOGICAL=RagQueryFunction ;;
    *:*)       STACK="${1%%:*}";       LOGICAL="${1#*:}" ;;
    *)         echo "unknown target: $1 (expected api, nudge, questions, presignup, rag, or <stack>:<logical-id>)" >&2
               exit 1 ;;
  esac
}

# Call it in an assignment of its own, so a failed lookup stops the script.
log_group() {
  local name
  name=$(cfn_query describe-stack-resources "$STACK" --logical-resource-id "$LOGICAL" \
    --query "StackResources[0].PhysicalResourceId") || return 1
  [ -n "$name" ] || { echo "no function $LOGICAL in stack $STACK; list the deployed ones:" \
                           "scripts/aws-helper.sh --functions$ENV_ARG" >&2; return 1; }
  echo "/aws/lambda/$name"
}

case "$ACTION" in
  logs)
    resolve "$TARGET"
    args=(--since "$SINCE" --format short)
    [ -n "$FOLLOW" ] && args+=(--follow)
    [ -n "$FILTER" ] && args+=(--filter-pattern "$FILTER")
    group=$(log_group)
    aws logs tail "$group" "${args[@]}"
    ;;
  log-group)
    resolve "$TARGET"
    group=$(log_group)
    echo "$group"
    ;;
  functions)
    for stack in "$APP" "${APP}-cognito"; do
      functions=$(cfn_query describe-stack-resources "$stack" \
        --query "StackResources[?ResourceType=='AWS::Lambda::Function'].[LogicalResourceId,PhysicalResourceId]")
      [ -n "$functions" ] || { echo "stack $stack has no functions or does not exist; deploy it:" \
                                    "scripts/deploy.sh$ENV_ARG" >&2; exit 1; }
      echo "$functions"
    done
    ;;
esac
