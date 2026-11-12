#!/usr/bin/env bash
# Personal deployment settings: addresses, the sign-up allow-list, per-user chat limits and the
# answering service URL. ./scripts/init-env.sh copies this file to lib/params.sh (gitignored);
# fill it in there and never commit it.

# Optional: a regex an email must fullmatch to sign up; join addresses with "|". The default
# ".*" allows everyone.
export ALLOWED_EMAILS=".*"

# Required: the From address of every mail the app sends; must be a verified SES identity.
export SES_SENDER="<sender-address>"

# Required: notified about each new user, shown to rejected sign-ins as the access contact,
# and the one account the app treats as admin.
export ADMIN_EMAIL="<admin-address>"

# Optional: the developer's own account: diagnostic readings the app takes of itself are shown
# to it alone. Leave empty to show them to nobody.
export DEV_EMAIL=""

# Optional: the base URL of the Summaries.AI REST API the chat proxies to (its RestApiUrl stack
# output). Empty configures no answering service: the chat surface is withheld and the scheduled
# jobs run without it. A value already in the environment wins, so one deploy can be sent out
# without it (RAG_API_URL="" scripts/deploy.sh) without editing this line. The API key itself is
# not a deploy parameter; store it in SSM: scripts/aws-helper.sh --set-rag-key
export RAG_API_URL="${RAG_API_URL-}"

# Optional: a JSON map of lowercase email -> daily chat question limit, for users whose
# allowance differs from CHAT_DAILY_LIMIT of lib/stack-params.sh.
export CHAT_DAILY_LIMIT_OVERRIDES="{}"
