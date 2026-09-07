#!/bin/bash
# Copies Summaries.AI's API key into the SSM parameter diet-tracker's chat Lambda reads,
# without the key value touching a file or the terminal.
#
# The key is a Summaries.AI resource: its stack created it, names its id in the stack outputs,
# and its question-answering API requires it on every call. The SSM parameter
# /diet-tracker/rag/api-key is diet-tracker's resource: the chat Lambda reads it fresh on every
# question, so replacing the stored value is all a key change needs — no redeploy.
#
# Usage: bash scripts/set-rag-key.sh [api-key-id]   (default: Summaries.AI's production stack's key)
# The sourced aws-config.sh credentials serve both calls — the two apps share one AWS account;
# SRC_PROFILE and DST_PROFILE name AWS CLI profiles overriding the key fetch and the SSM write
# respectively, for when they no longer do.
set -euo pipefail
export PATH="$HOME/.local/bin:$PATH"
source scripts/aws-config.sh
KEY_ID="${1:-e81k9zrw38}"
KEY=$(aws apigateway get-api-key --include-value --api-key "$KEY_ID" --query value --output text \
      ${SRC_PROFILE:+--profile "$SRC_PROFILE"})
aws ssm put-parameter --name /diet-tracker/rag/api-key --type SecureString --overwrite --value "$KEY" \
    ${DST_PROFILE:+--profile "$DST_PROFILE"} >/dev/null
echo "SSM /diet-tracker/rag/api-key updated from API key id $KEY_ID"
