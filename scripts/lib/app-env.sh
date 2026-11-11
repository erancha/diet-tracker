#!/usr/bin/env bash
# Shared helpers for the bash scripts in scripts/: status output, the app's identity (name, region,
# branch-selected stack pair) and loaders for the gitignored settings files, so every script
# resolves these values the same way and none re-declares them.
#
# Core responsibilities:
# - print_help / show_help: a script's header comment block, as its --help text
# - usage_error: the help and a message on stderr, exit 2, for an argument a script does not take
# - die/info/ok/warn/step: status lines; die exits 1 with the message on stderr, step prefixes the
#   wall-clock time and the time elapsed since the sourcing script started
# - split_lines: newline-separated command output into an array
# - load_aws_config / load_secrets: source the gitignored lib/aws-config.sh / lib/secrets.sh,
#   refusing a file git would track or a secret value that appears in a tracked file
# - assert_secrets_untracked: that check, also run on staged changes by .githooks/pre-commit
# - get_app_name / get_region / resolve_stack: the stack this checkout deploys to, and
#   STACK_NAMES, the stacks aws-helper.sh operates on
# - SAM_CLI_TELEMETRY: off for every sam command a script runs
# - LOG_RETENTION_DAYS: how long the stack's log groups keep their events
# - stack_outputs / stack_output: CloudFormation outputs of that stack
# - ensure_node_modules: npm ci in a package folder whose lockfile changed since its last install
# - this app's own helpers, at the end: load_params for the gitignored lib/params.sh,
#   resolve_stack_pair for the pair's Cognito stack, cognito_output, and cfn_query, a
#   CloudFormation lookup that answers empty for a stack not deployed yet
#
# Expects SCRIPT_DIR to point at scripts/ before it is sourced.

# The variables set here are read by the scripts that source this file.
# shellcheck disable=SC2034

APP_FOLDER="$(dirname "$SCRIPT_DIR")"
# The app name prefixes every stack name: <app> from main, <app>-fb from any other branch.
DEFAULT_APP_NAME='diet-tracker'
# The stacks aws-helper.sh operates on: the branch's stack name with each suffix appended ('' is
# that stack itself), in the order they can be deleted.
STACK_SUFFIXES=('' '-cognito')
DEFAULT_REGION='eu-central-1'
# Days every log group of the stack keeps its events: lib/stack-params.sh passes it to the
# template's LogRetentionDays, and aws-helper.sh --log-retention sets it on existing groups.
LOG_RETENTION_DAYS=14
# The React app (repo-relative) and the config file app-config.sh writes for it.
FRONTEND_FOLDER='frontend'
APP_CONFIG_FILE="$APP_FOLDER/$FRONTEND_FOLDER/public/config.js"

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
WHITE_ON_BLUE='\033[1;37;44m'
NC='\033[0m'

# SAM CLI 1.165's usage telemetry crashes the command after it succeeds (FileNotFoundError in
# get_project_name), failing an otherwise good build.
export SAM_CLI_TELEMETRY=0

die() {
    echo -e "${RED}ERROR: $*${NC}" >&2
    exit 1
}

info() { echo -e "${CYAN}$*${NC}"; }
ok() { echo -e "${GREEN}$*${NC}"; }
warn() { echo -e "${YELLOW}$*${NC}"; }

# Prints the header comment block of a script, the single source of its usage: the comment lines
# between the shebang and the first other line. Without an argument, the executed script ($0).
print_help() { awk 'NR==1 {next} /^#/ {sub(/^# ?/, ""); print; next} {exit}' "${1:-$0}"; }

# The executed script's --help text. A script whose help is more than its header comment block
# defines its own show_help after sourcing this file.
show_help() { print_help "$0"; }

# Ends a script on an argument it does not take, or one it lacks: the help, then the message, on
# stderr, and exit status 2.
usage_error() {
    show_help >&2
    echo -e "\n${RED}ERROR: $*${NC}" >&2
    exit 2
}

# SECONDS counts from the start of the sourcing script's shell.
step() {
    printf "\n${WHITE_ON_BLUE}%s, elapsed %02d:%02d:%02d : %s${NC}\n" \
        "$(date +%H:%M:%S)" $((SECONDS / 3600)) $((SECONDS % 3600 / 60)) $((SECONDS % 60)) "$*"
}

# Splits newline-separated text into the named array; empty text gives an empty array. Callers
# capture the command output first (out="$(cmd)") so a failing command still stops the script,
# which reading it through mapfile < <(cmd) would not.
# shellcheck disable=SC2034  # target is a reference to the caller's array
split_lines() {
    local -n target="$1"
    target=()
    if [[ -n "$2" ]]; then
        mapfile -t target <<<"$2"
    fi
}

# Settings a secrets file sets that are public, so a copy in a tracked file is no leak.
PUBLIC_SETTINGS=(AWS_DEFAULT_REGION)

# The gitignored files that hold secrets.
SECRETS_FILES=("$SCRIPT_DIR/lib/aws-config.sh" "$SCRIPT_DIR/lib/secrets.sh")

# Fatal when git tracks or would track <file>, or when the value of a non-public setting it sets
# (KEY=value, with or without export) appears in git's files. <scope> "worktree" scans the tracked
# files as they are on disk, "index" the staged snapshot a commit records.
assert_secrets_untracked() {
    local file="$1" scope="$2" grep_scope=() name status
    [[ "$scope" == index ]] && grep_scope=(--cached)
    git -C "$APP_FOLDER" check-ignore -q "$file" ||
        die "$file is tracked or not gitignored; it must stay out of git"
    (
        # shellcheck source=/dev/null
        source "$file"
        for name in $(grep -oP '^(?:export )?\K\w+(?==)' "$file"); do
            [[ " ${PUBLIC_SETTINGS[*]} " == *" $name "* ]] && continue
            [[ -n "${!name}" ]] || die "$name is empty in $file"
            status=0
            git -C "$APP_FOLDER" grep "${grep_scope[@]}" -q -F -e "${!name}" || status=$?
            case "$status" in
                0) die "The value of $name (from $file) appears in git ($scope):" \
                       "$(git -C "$APP_FOLDER" grep "${grep_scope[@]}" -l -F -e "${!name}" |
                          tr '\n' ' ')" ;;
                1) ;;
                *) die "git grep failed while scanning for $name" ;;
            esac
        done
    ) || exit 1
}

# Sources lib/<file> after assert_secrets_untracked, and points git at the repo's hooks so the
# pre-commit hook applies the same check to every commit made from a checkout that holds secrets.
source_secrets_file() {
    local file="$SCRIPT_DIR/lib/$1"
    [[ -f "$file" ]] || die "Missing $file (copy lib/${1%.sh}.example.sh and fill it in)"
    assert_secrets_untracked "$file" worktree
    # shellcheck source=/dev/null
    source "$file"
    if [[ "$(git -C "$APP_FOLDER" config --default "" core.hooksPath)" != .githooks ]]; then
        git -C "$APP_FOLDER" config core.hooksPath .githooks
        # On stderr, so a caller that captures a script's output never reads this line.
        info "Enabled the repo's git hooks (core.hooksPath=.githooks)." >&2
    fi
}

# The deploying user's AWS credentials and region.
load_aws_config() { source_secrets_file aws-config.sh; }

# The Google OAuth client the Cognito stack signs users in through.
load_secrets() { source_secrets_file secrets.sh; }

get_app_name() {
    printf '%s' "${APP_NAME:-$DEFAULT_APP_NAME}"
}

get_region() {
    printf '%s' "${AWS_DEFAULT_REGION:-$DEFAULT_REGION}"
}

# The checkout's branch selects the stack: main deploys <app>, any other branch deploys <app>-fb.
# An exported STACK_NAME wins. STACK_NAMES, the stacks aws-helper.sh operates on, is that name
# with each of STACK_SUFFIXES appended.
resolve_stack() {
    local app_name suffix
    app_name="$(get_app_name)"
    BRANCH="$(git -C "$APP_FOLDER" rev-parse --abbrev-ref HEAD)" ||
        die "Could not read the git branch of $APP_FOLDER"
    if [ "$BRANCH" = main ]; then
        IS_MAIN=true
        STACK_NAME="${STACK_NAME:-$app_name}"
    else
        IS_MAIN=false
        STACK_NAME="${STACK_NAME:-${app_name}-fb}"
    fi
    STACK_NAMES=()
    for suffix in "${STACK_SUFFIXES[@]}"; do
        STACK_NAMES+=("$STACK_NAME$suffix")
    done
}

stack_outputs() {
    aws cloudformation describe-stacks --region "$(get_region)" --stack-name "$STACK_NAME" \
        --query 'Stacks[0].Outputs' --output json
}

# Reads a required output from the JSON stack_outputs printed; a missing key is fatal.
stack_output() {
    local outputs="$1" key="$2"
    jq -er --arg key "$key" '.[] | select(.OutputKey == $key) | .OutputValue' <<<"$outputs" ||
        die "Stack '$STACK_NAME' has no output '$key'"
}

# The stamp records the package-lock.json the folder's node_modules was installed from, so an
# unchanged lockfile skips the install and any lockfile change (pull, branch switch, upgrade)
# reinstalls. npm ci installs exactly what the lockfile pins and fails, rather than rewriting the
# lockfile, when it no longer matches package.json.
ensure_node_modules() {
    local folder="$APP_FOLDER/$1" stamp lock_hash
    stamp="$folder/node_modules/.package-lock.sha256"
    lock_hash="$(sha256sum "$folder/package-lock.json" | cut -d' ' -f1)"
    if [[ -f "$stamp" && "$(cat "$stamp")" == "$lock_hash" ]]; then
        return
    fi
    step "npm ci: $1"
    (cd "$folder" && npm ci --no-audit --no-fund)
    printf '%s\n' "$lock_hash" >"$stamp"
}

# The helpers below are this app's own; everything above is shared with the other AWS repos.

# The deployment's personal settings: addresses, the sign-up allow-list, per-user chat limits and
# the answering service URL. The file stays out of git like a secrets file, but its values are not
# searched for in the tracked files: the app publishes some of them by design (the sender address
# is on every mail, the admin address in the browser's config) and some may be empty.
load_params() {
    local file="$SCRIPT_DIR/lib/params.sh"
    [[ -f "$file" ]] || die "Missing $file (copy lib/params.example.sh and fill it in)"
    git -C "$APP_FOLDER" check-ignore -q "$file" ||
        die "$file is tracked or not gitignored; it must stay out of git"
    # shellcheck source=/dev/null
    source "$file"
}

# The branch's stack pair: resolve_stack, then COGNITO_STACK_NAME, the pair's Cognito stack.
resolve_stack_pair() {
    resolve_stack
    COGNITO_STACK_NAME="${STACK_NAMES[1]}"
}

# Reads a required output of the pair's Cognito stack.
cognito_output() {
    local STACK_NAME="$COGNITO_STACK_NAME" outputs
    outputs="$(stack_outputs)"
    stack_output "$outputs" "$1"
}

# Prints the text result of a CloudFormation lookup on one stack; nothing when the stack does not
# exist yet or the lookup matches nothing. Any other failure (credentials, network, access denied)
# is fatal. The CLI's stderr is kept apart from the value and passed on, so a warning never
# becomes part of it.
cfn_query() { # subcommand stack [argument...]
    local out err errors
    errors="$(mktemp)"
    if ! out="$(aws cloudformation "$1" --region "$(get_region)" --stack-name "$2" "${@:3}" \
        --output text 2>"$errors")"; then
        err="$(<"$errors")"
        rm -f "$errors"
        case "$err" in
            *"does not exist"*) return 0 ;;
            *) die "$1 $2 failed: $err" ;;
        esac
    fi
    cat "$errors" >&2
    rm -f "$errors"
    [[ "$out" == None ]] || printf '%s' "$out"
}
