#!/usr/bin/env bash
#
# Build and deploy the app to the stack pair the current git branch selects: main deploys
# "diet-tracker" with "diet-tracker-cognito", any other branch "diet-tracker-fb" with
# "diet-tracker-fb-cognito", a fully isolated pair with its own Cognito domain.
#
#   ./scripts/deploy.sh                    backend: package the Lambda code, deploy both stacks
#   ./scripts/deploy.sh --frontend         backend, then the frontend
#   ./scripts/deploy.sh --frontend-only    frontend: npm run build, S3 sync, CloudFront invalidation
#   -h, --help                             show this help
#
# The Cognito callback URL and the API's CORS origin need the CloudFront URL, which exists only
# after the app stack's first deploy, so a backend run converges: it deploys with what is known,
# then deploys both stacks again when the URL turned out different. The Lambda package is
# byte-identical for an unchanged source (zip_lambda.py), so such a run leaves the functions
# untouched.
#
# Stack parameters come from lib/stack-params.sh. A backend run ends by writing
# frontend/public/config.js for the stack pair from its outputs (lib/app-config.sh), and the
# frontend publish writes it again first, so a published config.js always targets this stack's
# API. config/app.json ships inside the Lambda package and is published beside the frontend, so
# an edit to it needs --frontend.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/app-env.sh
source "$SCRIPT_DIR/lib/app-env.sh"

BUILD_FOLDER="$APP_FOLDER/build"

DEPLOY_BACKEND=true
DEPLOY_FRONTEND=false
while [[ $# -gt 0 ]]; do
    case "$1" in
        -h | --help) print_help; exit 0 ;;
        --frontend) DEPLOY_FRONTEND=true; shift ;;
        --frontend-only) DEPLOY_BACKEND=false; DEPLOY_FRONTEND=true; shift ;;
        *) usage_error "Unknown argument: $1" ;;
    esac
done

for tool in aws jq git npm python3; do
    command -v "$tool" >/dev/null || die "Required tool not found: $tool"
done
load_aws_config
resolve_stack_pair
REGION="$(get_region)"

step "deploy.sh: stack '$STACK_NAME' (branch '$BRANCH'), region $REGION"

# Prints the frontend's CloudFront URL; nothing before the app stack's first deploy.
deployed_frontend_url() {
    cfn_query describe-stacks "$STACK_NAME" \
        --query "Stacks[0].Outputs[?OutputKey=='FrontendUrl'].OutputValue"
}

# Uploads a template's Lambda package and deploys the stack. $1: template file name under
# scripts/; $2: stack name; the rest: the Key=Value parameters.
deploy_stack() {
    local template="$1" stack="$2" packaged
    shift 2
    packaged="$BUILD_FOLDER/${template%.yaml}.pkg.yaml"
    step "Deploying stack '$stack'"
    aws cloudformation package --region "$REGION" --template-file "$SCRIPT_DIR/$template" \
        --s3-bucket "$ARTIFACTS_BUCKET" --output-template-file "$packaged"
    aws cloudformation deploy --region "$REGION" --template-file "$packaged" \
        --stack-name "$stack" --capabilities CAPABILITY_IAM CAPABILITY_AUTO_EXPAND \
        --no-fail-on-empty-changeset --parameter-overrides "$@"
}

# $1: the frontend's CloudFront URL, empty before the app stack's first deploy.
deploy_stacks() {
    local frontend_url="$1" user_pool_id user_pool_client_id
    cognito_stack_parameters "$frontend_url"
    deploy_stack template-cognito.yaml "$COGNITO_STACK_NAME" "${COGNITO_PARAMETERS[@]}"
    user_pool_id="$(cognito_output UserPoolId)"
    user_pool_client_id="$(cognito_output UserPoolClientId)"
    app_stack_parameters "$frontend_url" "$user_pool_id" "$user_pool_client_id"
    deploy_stack template.yaml "$STACK_NAME" "${APP_PARAMETERS[@]}"
}

deploy_backend() {
    local account_id package_folder="$BUILD_FOLDER/lambda" known_url converged_url
    # shellcheck source=lib/stack-params.sh
    source "$SCRIPT_DIR/lib/stack-params.sh"

    account_id="$(aws sts get-caller-identity --query Account --output text)"
    ARTIFACTS_BUCKET="${STACK_NAME}-artifacts-${account_id}"
    aws s3api head-bucket --region "$REGION" --bucket "$ARTIFACTS_BUCKET" &>/dev/null ||
        aws s3 mb --region "$REGION" "s3://$ARTIFACTS_BUCKET"

    step "Packaging the Lambda code"
    rm -rf "$package_folder"
    mkdir -p "$package_folder"
    cp -r "$APP_FOLDER/src/." "$package_folder/"
    find "$package_folder" -type d -name __pycache__ -exec rm -rf {} +
    cp "$APP_FOLDER/config/app.json" "$package_folder/"
    python3 "$SCRIPT_DIR/zip_lambda.py" "$package_folder" "$BUILD_FOLDER/lambda.zip"

    known_url="$(deployed_frontend_url)"
    deploy_stacks "$known_url"
    converged_url="$(deployed_frontend_url)"
    if [[ "$converged_url" != "$known_url" ]]; then
        deploy_stacks "$converged_url"
    fi
    ok "Stacks '$COGNITO_STACK_NAME' and '$STACK_NAME' deployed."

    "$SCRIPT_DIR/lib/app-config.sh"
}

deploy_frontend() {
    local outputs bucket api_url frontend_folder="$APP_FOLDER/$FRONTEND_FOLDER"
    outputs="$(stack_outputs)"
    bucket="$(stack_output "$outputs" FrontendBucket)"
    api_url="$(stack_output "$outputs" ApiUrl)"

    # config.js holds one stack pair's endpoints; publishing one left by another branch's deploy
    # would point this stack's users at that one's API, so it is written for this stack first.
    "$SCRIPT_DIR/lib/app-config.sh"
    grep -qF "$api_url" "$APP_CONFIG_FILE" ||
        die "$APP_CONFIG_FILE does not target the API of '$STACK_NAME' ($api_url)"

    ensure_node_modules "$FRONTEND_FOLDER"
    step "Building the frontend"
    (cd "$frontend_folder" && npm run build)

    step "Uploading the build to s3://$bucket"
    # Hashed bundles are immutable by construction, so browsers may keep them forever. Everything
    # else (index.html, config.js, app.json) is served under a stable name and must be
    # revalidated on every visit: without an explicit no-cache, browsers cache these
    # heuristically and keep running a stale app long after an edge invalidation. app.json is
    # not part of the Vite build, so the sync excludes it from --delete and it is published on
    # its own.
    aws s3 sync "$frontend_folder/dist/assets" "s3://$bucket/assets" --region "$REGION" --delete \
        --cache-control 'public,max-age=31536000,immutable'
    aws s3 sync "$frontend_folder/dist" "s3://$bucket" --region "$REGION" --delete \
        --exclude 'assets/*' --exclude app.json --cache-control 'no-cache'
    aws s3 cp "$APP_FOLDER/config/app.json" "s3://$bucket/app.json" --region "$REGION" \
        --cache-control 'no-cache'
    step "Invalidating CloudFront distribution"
    aws cloudfront create-invalidation \
        --distribution-id "$(stack_output "$outputs" DistributionId)" --paths '/*' >/dev/null
    ok "Frontend deployed: $(stack_output "$outputs" FrontendUrl)"
}

if $DEPLOY_BACKEND; then
    deploy_backend
fi
if $DEPLOY_FRONTEND; then
    deploy_frontend
fi

step "deploy.sh completed for stack '$STACK_NAME'."
