#!/usr/bin/env bash
# Personal deployment settings: addresses, the sign-up allow-list, per-user chat limits and the
# answering service URL. Copy to params.sh (gitignored) and fill in real values.
# Regex an email must fullmatch to sign up; join addresses with "|", ".*" allows everyone.
export ALLOWED_EMAILS=".*"
# From address of every mail the app sends; must be a verified SES identity.
export SES_SENDER="<sender-address>"
# Notified about each new user, and shown to rejected sign-ins as the access contact.
export ADMIN_EMAIL="<admin-address>"
# The developer's own account: diagnostic readings the app takes of itself are shown to it
# alone. Leave empty to show them to nobody.
export DEV_EMAIL=""
# Base URL of the Summaries.AI REST API the chat proxies to (its RestApiUrl stack output). Empty
# configures no answering service: the chat surface is withheld and the scheduled jobs run
# without it. A value already in the environment wins, so one deploy can be sent out without it
# (RAG_API_URL="" scripts/deploy.sh) without editing this line. The API key itself is not a
# deploy parameter; store it in SSM: scripts/aws-helper.sh --set-rag-key
export RAG_API_URL="${RAG_API_URL-}"
# JSON map of lowercase email -> daily chat question limit, for users whose allowance differs
# from CHAT_DAILY_LIMIT of lib/stack-params.sh.
export CHAT_DAILY_LIMIT_OVERRIDES="{}"
