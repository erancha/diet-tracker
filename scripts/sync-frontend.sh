#!/bin/bash
# Builds and publishes the frontend: the Vite bundle plus the questionnaire config, which the
# frontend reads from its own origin so the API is only needed for authenticated calls.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/aws-config.sh

APP="diet-tracker${1:+-$1}"
stack_output() {
  aws cloudformation describe-stacks --stack-name "$APP" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}

(cd frontend && npm ci && npm run build)

# questionnaire.json is published separately below and must survive --delete.
BUCKET=$(stack_output FrontendBucket)

# config.js is built by deploy.sh for one specific stack's endpoints; syncing a config.js left
# over from another environment (e.g. dev) would silently point that environment's users at it.
DEPLOY_CMD="scripts/deploy.sh${1:+ $1}"
if [ ! -f frontend/public/config.js ]; then
  echo "frontend/public/config.js is missing — run $DEPLOY_CMD to regenerate config.js for this environment" >&2
  exit 1
fi
TARGET_API_URL=$(stack_output ApiUrl)
if ! grep -qF "$TARGET_API_URL" frontend/public/config.js; then
  echo "frontend/public/config.js does not target ${APP}'s API ($TARGET_API_URL) — run $DEPLOY_CMD to regenerate config.js for this environment" >&2
  exit 1
fi
aws s3 sync frontend/dist "s3://${BUCKET}" --delete --exclude questionnaire.json
aws s3 cp config/questionnaire.json "s3://${BUCKET}/questionnaire.json"
aws cloudfront create-invalidation --distribution-id "$(stack_output DistributionId)" --paths '/*' >/dev/null
echo "Frontend synced to $(stack_output FrontendUrl)"
