#!/usr/bin/env bash
# Parameter values scripts/template.yaml and scripts/template-cognito.yaml are deployed with, for
# both branch stack pairs. Sourced (never executed) after lib/app-env.sh and resolve_stack.
#
# Core responsibilities:
# - loads the Google OAuth client from the gitignored lib/secrets.sh, and the addresses, sign-up
#   allow-list, per-user chat limits and answering service URL from the gitignored lib/params.sh
# - CHAT_DAILY_LIMIT, LOCAL_FRONTEND_URL: the settings that are the same for every deployment
# - cognito_stack_parameters / app_stack_parameters: fill COGNITO_PARAMETERS / APP_PARAMETERS
#   with the Key=Value list of each stack
#
# CloudFormation keeps a stack's previous value of any parameter a deploy leaves out, so a
# parameter must be listed here to be under this file's control. Left out on purpose: every
# parameter still at its template default (the meal hours, the SSM parameter names).

load_secrets
require_settings secrets.sh GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET
load_params
require_settings params.sh SES_SENDER ADMIN_EMAIL

# Chat questions each user may ask per day; CHAT_DAILY_LIMIT_OVERRIDES of lib/params.sh names
# the users whose allowance differs.
CHAT_DAILY_LIMIT=5
# The Vite dev server, a Cognito callback URL and an allowed API origin of every stack pair.
LOCAL_FRONTEND_URL='http://localhost:8000'

# Prints a value of config/app.json, selected by a Python subscript expression.
app_config() {
    python3 -c "import json, sys; print(json.load(open(sys.argv[1]))$1)" \
        "$APP_FOLDER/config/app.json"
}

# $1: the frontend's CloudFront URL, empty before the app stack's first deploy.
cognito_stack_parameters() {
    local frontend_url="$1" callbacks="$LOCAL_FRONTEND_URL/"
    [[ -z "$frontend_url" ]] || callbacks+=",$frontend_url/"
    COGNITO_PARAMETERS=(
        "GoogleClientId=$GOOGLE_CLIENT_ID"
        "GoogleClientSecret=$GOOGLE_CLIENT_SECRET"
        "AllowedEmails=$ALLOWED_EMAILS"
        "AdminEmail=$ADMIN_EMAIL"
        "SesSender=$SES_SENDER"
        "CallbackUrls=$callbacks"
        "DomainPrefix=$(cognito_domain_prefix)"
        "LogRetentionDays=$LOG_RETENTION_DAYS"
    )
}

# $1: the frontend's CloudFront URL, empty before the app stack's first deploy; $2, $3: the
# Cognito stack's user pool id and client id.
#
# The treat day's weekday and the morning hour are declared in config/app.json and lifted into
# stack parameters because an EventBridge cron expression is fixed when the stack deploys.
app_stack_parameters() {
    local frontend_url="$1" user_pool_id="$2" user_pool_client_id="$3"
    local origins="$LOCAL_FRONTEND_URL"
    [[ -z "$frontend_url" ]] || origins+=",$frontend_url"
    APP_PARAMETERS=(
        "SesSender=$SES_SENDER"
        "AllowedOrigins=$origins"
        "AdminEmail=$ADMIN_EMAIL"
        "UserPoolId=$user_pool_id"
        "UserPoolClientId=$user_pool_client_id"
        "TreatDayWeekday=$(app_config "['treat_day']['weekday']")"
        "MorningHour=$(app_config "['morning_notifications']['hour']")"
        "RagApiUrl=$RAG_API_URL"
        "ChatDailyLimit=$CHAT_DAILY_LIMIT"
        "ChatDailyLimitOverrides=$CHAT_DAILY_LIMIT_OVERRIDES"
        "LogRetentionDays=$LOG_RETENTION_DAYS"
    )
}
