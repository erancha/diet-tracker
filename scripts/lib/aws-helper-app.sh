#!/usr/bin/env bash
#
# diet-tracker's own options:
#
#   --stack-logs <target> [--since <age>] [--follow] [--errors | --filter <pattern>]
#                               print the log events of a function of any stack of the account,
#                               with the arguments of --logs; <target> is <stack>:<logical id>,
#                               or rag for the Summaries.AI function that answers the in-app chat
#   --log-group <target>        print the log group a function writes to, for the console or
#                               Logs Insights; <target> as for --stack-logs, or as for --logs
#   --set-rag-key [<key id>]    copy a Summaries.AI API key (default: its production stack's)
#                               into the SSM parameter the chat function reads on every
#                               question, without the key touching a file or the terminal
#
# This stack pair's functions for --logs: api, chat, nudge, question (the per-user consumer
# answering the weekly recap and the morning debrief), presignup.
#
# --set-rag-key reads the key and writes the parameter with the credentials of
# lib/aws-config.sh, since the two apps share one AWS account; SRC_PROFILE and DST_PROFILE name
# AWS CLI profiles for the key read and the parameter write when the apps sit in separate
# accounts.
#
# Examples:
#   ./scripts/aws-helper.sh --logs nudge --follow
#   ./scripts/aws-helper.sh --stack-logs rag --errors --since 1d
#   ./scripts/aws-helper.sh --stack-logs sum:BillingFunction --errors
#   ./scripts/aws-helper.sh --log-group nudge

# Summaries.AI's production stack and its function that answers the in-app chat.
RAG_TARGET='sum:RagQueryFunction'
# The API key Summaries.AI's production stack created; its question-answering API requires the
# key on every call.
DEFAULT_RAG_KEY_ID='e81k9zrw38'
# The chat function reads the parameter fresh on every question, so replacing the stored value
# is all a key change needs.
RAG_KEY_PARAMETER='/diet-tracker/rag/api-key'

# Narrows the helper to the stack of a <stack>:<logical id> target or of the rag alias, and sets
# TARGET_FUNCTION to its logical id. connect of aws-helper.sh keeps a stack that is already set.
select_stack_target() {
    local target="$1"
    [[ "$target" != rag ]] || target="$RAG_TARGET"
    [[ "$target" == *:* ]] || usage_error "Expected <stack>:<logical id> or rag, got: $target"
    STACK_NAME="${target%%:*}"
    STACK_NAMES=("$STACK_NAME")
    TARGET_FUNCTION="${target#*:}"
}

stack_logs() {
    [[ $# -gt 0 ]] || usage_error "--stack-logs needs a target"
    select_stack_target "$1"
    shift
    tail_logs "$TARGET_FUNCTION" "$@"
}

print_log_group() {
    [[ $# -eq 1 ]] || usage_error "--log-group takes one target"
    TARGET_FUNCTION="$1"
    if [[ "$1" == rag || "$1" == *:* ]]; then
        select_stack_target "$1"
    fi
    connect
    resolve_function "$TARGET_FUNCTION"
    function_log_group "$FUNCTION_NAME"
}

set_rag_key() {
    [[ $# -le 1 ]] || usage_error "--set-rag-key takes at most a key id"
    connect
    local key_id="${1:-$DEFAULT_RAG_KEY_ID}" key
    key="$(aws apigateway get-api-key --region "$REGION" --include-value --api-key "$key_id" \
        --query value --output text ${SRC_PROFILE:+--profile "$SRC_PROFILE"})"
    aws ssm put-parameter --region "$REGION" --name "$RAG_KEY_PARAMETER" --type SecureString \
        --overwrite --value "$key" ${DST_PROFILE:+--profile "$DST_PROFILE"} >/dev/null
    ok "SSM $RAG_KEY_PARAMETER updated from API key id $key_id"
}

app_option() {
    local option="$1"
    shift
    case "$option" in
        --stack-logs) stack_logs "$@" ;;
        --log-group) print_log_group "$@" ;;
        --set-rag-key) set_rag_key "$@" ;;
        *) return 1 ;;
    esac
}
