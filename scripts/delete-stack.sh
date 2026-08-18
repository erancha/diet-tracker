#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/aws-config.sh

APP=diet-tracker
BUCKET=$(aws cloudformation describe-stacks --stack-name "$APP" \
  --query "Stacks[0].Outputs[?OutputKey=='FrontendBucket'].OutputValue" --output text)
aws s3 rm "s3://${BUCKET}" --recursive
aws cloudformation delete-stack --stack-name "$APP"
aws cloudformation wait stack-delete-complete --stack-name "$APP"
aws cloudformation delete-stack --stack-name "${APP}-cognito"
aws cloudformation wait stack-delete-complete --stack-name "${APP}-cognito"
echo "Both stacks deleted."
