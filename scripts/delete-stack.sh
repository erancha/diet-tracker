#!/bin/bash
# Deletes the app stack and then the Cognito stack.
#
# Usage:
#   scripts/delete-stack.sh [env]
#
# env: optional suffix (e.g. dev) naming the stack pair, as in deploy.sh.
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=common.sh
source scripts/common.sh
parse_env_suffix_arg "$@"
source scripts/aws-config.sh

BUCKET=$(aws cloudformation describe-stacks --stack-name "$APP" \
  --query "Stacks[0].Outputs[?OutputKey=='FrontendBucket'].OutputValue" --output text)
aws s3 rm "s3://${BUCKET}" --recursive
aws cloudformation delete-stack --stack-name "$APP"
aws cloudformation wait stack-delete-complete --stack-name "$APP"
aws cloudformation delete-stack --stack-name "${APP}-cognito"
aws cloudformation wait stack-delete-complete --stack-name "${APP}-cognito"
echo "Both stacks deleted."
