#!/bin/bash
# Deployment parameters. Copy to params.sh (gitignored) and fill in real values.
export GOOGLE_CLIENT_ID="<google-oauth-client-id>"
export GOOGLE_CLIENT_SECRET="<google-oauth-client-secret>"
# Regex an email must fullmatch to sign up; join addresses with "|", ".*" allows everyone.
export ALLOWED_EMAILS=".*"
export SES_SENDER="erancha@gmail.com"
# Notified about each new user, and shown to rejected sign-ins as the access contact.
export ADMIN_EMAIL="webcharm.tech@gmail.com"
# Base URL of the Summaries.AI REST API the chat proxies to (its RestApiUrl stack output).
# The API key itself is not a deploy parameter — store it in SSM: aws ssm put-parameter \
#   --name /diet-tracker/rag/api-key --type SecureString --value <key>
export RAG_API_URL=""
# Chat questions each user may ask per day, and a JSON map of lowercase email -> limit for
# users whose allowance differs from the default.
export CHAT_DAILY_LIMIT="5"
export CHAT_DAILY_LIMIT_OVERRIDES="{}"
