#!/bin/bash
# Deployment parameters. Copy to params.sh (gitignored) and fill in real values.
export GOOGLE_CLIENT_ID="<google-oauth-client-id>"
export GOOGLE_CLIENT_SECRET="<google-oauth-client-secret>"
export ALLOWED_EMAILS="erancha@gmail.com"
export SES_SENDER="erancha@gmail.com"
# Base URL of the Summaries.AI REST API the chat proxies to (its RestApiUrl stack output).
# The API key itself is not a deploy parameter — store it in SSM: aws ssm put-parameter \
#   --name /diet-tracker/rag/api-key --type SecureString --value <key>
export RAG_API_URL=""
