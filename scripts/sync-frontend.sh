#!/bin/bash
# Builds and publishes the frontend: the Vite bundle plus the questionnaire config, which the
# frontend reads from its own origin so the API is only needed for authenticated calls.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/aws-config.sh

APP=diet-tracker
stack_output() {
  aws cloudformation describe-stacks --stack-name "$APP" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}

(cd frontend && npm ci && npm run build)

# questionnaire.json is published separately below and must survive --delete.
BUCKET=$(stack_output FrontendBucket)
aws s3 sync frontend/dist "s3://${BUCKET}" --delete --exclude questionnaire.json
aws s3 cp config/questionnaire.json "s3://${BUCKET}/questionnaire.json"
aws cloudfront create-invalidation --distribution-id "$(stack_output DistributionId)" --paths '/*' >/dev/null
echo "Frontend synced to $(stack_output FrontendUrl)"
