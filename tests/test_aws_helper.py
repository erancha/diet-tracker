"""Exercises scripts/aws-helper.sh, with the app's own options of scripts/lib/aws-helper-app.sh,
against a recording stand-in for the aws CLI.

The scripts run from a scratch git checkout holding copies of them and an empty stand-in for the
gitignored credentials file, which only developer machines hold; the checkout's branch selects the
stack pair as a real one does. The stand-in CLI shadows the real one on PATH, appends every
invocation to a file the tests read back, and answers the lookups the helper makes: a stack's
functions, and the log group a function writes to. AWS_FAILURE names a failure for the function
lookup to answer with instead, so the tests see how a lookup that fails is reported.

An app stack owns the buckets <stack>-frontend and <stack>-files, the second retained by its
template. The first holds an object version and a delete marker when BUCKET_HOLDS_OBJECTS is set,
until a delete-objects call, whose stdin the stand-in keeps beside the recorded invocations.

The region holds one Lambda layer, shared, with versions 2 and 3; its functions use the versions
USED_LAYER_VERSIONS names.
"""

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

SCRIPTS = Path(__file__).parent.parent / "scripts"
COPIED = ("aws-helper.sh", "lib/app-env.sh", "lib/list-resources.sh", "lib/aws-helper-app.sh")
CREDENTIALS = "scripts/lib/aws-config.sh"

FAKE_AWS = """#!/bin/bash
echo "$*" >> "$AWS_CALLS"
argument() {  # prints the value following the option named $1
  local name="$1"
  shift
  while [ $# -gt 0 ]; do
    [ "$1" = "$name" ] && { echo "$2"; return; }
    shift
  done
}
case "$1 $2" in
  "cloudformation list-stack-resources")
    if [ -n "${AWS_FAILURE:-}" ]; then
      echo "$AWS_FAILURE" >&2
      exit 254
    fi
    stack=$(argument --stack-name "$@")
    case "$*" in
      *AWS::S3::Bucket*)
        case "$stack" in
          *-cognito) echo '[]' ;;
          *) printf '[{"LogicalResourceId": "%sBucket", "PhysicalResourceId": "%s"}]' \\
               Frontend "$stack-frontend" Files "$stack-files" | jq -s add ;;
        esac
        exit 0 ;;
    esac
    case "$stack" in
      *-cognito) ids="PreSignupFunction" ;;
      *) ids="ApiFunction NudgeFunction AppQuestionFunction RagQueryFunction SomeFunction" ;;
    esac
    for id in $ids; do
      echo "{\\"LogicalResourceId\\": \\"$id\\", \\"PhysicalResourceId\\": \\"$stack-$id-x1\\"}"
    done | jq -s .
    ;;
  "lambda get-function-configuration")
    echo "/aws/lambda/declared/$(argument --function-name "$@")"
    ;;
  "cloudformation get-template")
    echo '{"Resources": {"FrontendBucket": {"Type": "AWS::S3::Bucket"},
           "FilesBucket": {"Type": "AWS::S3::Bucket", "DeletionPolicy": "Retain"}}}'
    exit 0 ;;
  "s3api list-object-versions")
    if [ -n "${BUCKET_HOLDS_OBJECTS:-}" ] && [ ! -e "$AWS_CALLS.emptied" ]; then
      echo '{"Versions": [{"Key": "index.html", "VersionId": "v1"}],
             "DeleteMarkers": [{"Key": "old.js", "VersionId": "v2"}]}'
    else
      echo '{"Versions": null, "DeleteMarkers": null}'
    fi
    exit 0 ;;
  "s3api delete-objects")
    cat > "$AWS_CALLS.deleted"
    touch "$AWS_CALLS.emptied"
    echo null
    exit 0 ;;
  "logs describe-log-groups") echo '[]'; exit 0 ;;
  "cloudformation delete-stack" | "cloudformation wait") exit 0 ;;
  "lambda list-layers") echo '["shared"]'; exit 0 ;;
  "lambda list-layer-versions")
    for version in 2 3; do
      printf '["%s:%s", "2026-0%s-01T00:00:00.000+0000"]' "$LAYER_ARN" "$version" "$version"
    done | jq -s .
    exit 0 ;;
  "lambda list-functions")
    for version in $USED_LAYER_VERSIONS; do
      printf '"%s:%s"' "$LAYER_ARN" "$version"
    done | jq -s .
    exit 0 ;;
  "lambda delete-layer-version") exit 0 ;;
esac
"""


class Helper:
    """Runs the scratch checkout's aws-helper.sh with the fake aws CLI first on PATH; `calls`
    holds its invocations."""

    def __init__(self, tmp_path, branch):
        fake_bin = tmp_path / "bin"
        fake_bin.mkdir()
        fake_aws = fake_bin / "aws"
        fake_aws.write_text(FAKE_AWS)
        fake_aws.chmod(0o755)
        self.checkout = tmp_path / "checkout"
        for name in COPIED:
            target = self.checkout / "scripts" / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy(SCRIPTS / name, target)
        (self.checkout / CREDENTIALS).write_text("")
        (self.checkout / ".gitignore").write_text(f"/{CREDENTIALS}\n")
        self._git("init", "--quiet", "--initial-branch", branch)
        self._git("add", "--all")
        self._git("-c", "user.name=test", "-c", "user.email=test@example.invalid",
                  "commit", "--quiet", "--message", "Scratch checkout")
        # As in a checkout that already ran a script: the first run enables the hooks and says so.
        self._git("config", "core.hooksPath", ".githooks")
        self.calls = tmp_path / "calls"
        self.calls.write_text("")
        self.env = {**os.environ,
                    "PATH": f"{fake_bin}:{os.environ['PATH']}",
                    "AWS_CALLS": str(self.calls),
                    "LAYER_ARN": "arn:aws:lambda:eu-central-1:123456789012:layer:shared"}
        # An exported stack name would win over the branch.
        self.env.pop("STACK_NAME", None)

    def _git(self, *args):
        subprocess.run(["git", "-C", str(self.checkout), *args], check=True)

    def run(self, *args, failure="", stdin=None, holds_objects=False, used_layer_versions="3"):
        return subprocess.run(["bash", str(self.checkout / "scripts" / "aws-helper.sh"), *args],
                              env={**self.env, "AWS_FAILURE": failure,
                                   "BUCKET_HOLDS_OBJECTS": "1" if holds_objects else "",
                                   "USED_LAYER_VERSIONS": used_layer_versions},
                              capture_output=True, text=True, input=stdin)

    def all_calls(self):
        return self.calls.read_text().splitlines()

    def lookups(self):
        return [call for call in self.calls.read_text().splitlines()
                if call.startswith("cloudformation list-stack-resources")]

    def tails(self):
        return [call for call in self.calls.read_text().splitlines()
                if call.startswith("logs tail")]


@pytest.fixture
def helper(tmp_path):
    return Helper(tmp_path, "main")


@pytest.fixture
def branch_helper(tmp_path):
    return Helper(tmp_path, "some-feature")


def test_errors_switch_tails_the_rag_lambda_filtered_to_warnings_and_errors(helper):
    result = helper.run("--stack-logs", "rag", "--errors")
    assert result.returncode == 0, result.stderr
    (lookup,) = helper.lookups()
    assert "--stack-name sum " in lookup
    (tail,) = helper.tails()
    assert tail.startswith("logs tail /aws/lambda/declared/sum-RagQueryFunction-x1")
    assert "--filter-pattern" in tail
    assert "?ERROR" in tail and "?WARN" in tail


def test_any_lambda_is_addressable_as_stack_colon_logical_id(helper):
    result = helper.run("--stack-logs", "some-stack:SomeFunction")
    assert result.returncode == 0, result.stderr
    (lookup,) = helper.lookups()
    assert "--stack-name some-stack " in lookup
    (tail,) = helper.tails()
    assert tail.startswith("logs tail /aws/lambda/declared/some-stack-SomeFunction-x1")


@pytest.mark.parametrize("part, function", [
    ("api", "diet-tracker-ApiFunction-x1"),
    ("nudge", "diet-tracker-NudgeFunction-x1"),
    ("question", "diet-tracker-AppQuestionFunction-x1"),
    ("presignup", "diet-tracker-cognito-PreSignupFunction-x1"),
])
def test_a_function_of_the_stack_pair_is_named_by_a_part_of_its_logical_id(helper, part,
                                                                           function):
    result = helper.run("--logs", part, "--since", "1d")
    assert result.returncode == 0, result.stderr
    (tail,) = helper.tails()
    assert tail.startswith(f"logs tail /aws/lambda/declared/{function} ")
    assert "--since 1d" in tail


def test_main_selects_the_production_stack_pair(helper):
    result = helper.run("--log-group", "api")
    assert result.returncode == 0, result.stderr
    assert result.stdout == "/aws/lambda/declared/diet-tracker-ApiFunction-x1\n"
    assert ["--stack-name diet-tracker " in call for call in helper.lookups()] == [True, False]
    assert "--stack-name diet-tracker-cognito " in helper.lookups()[1]


def test_any_other_branch_selects_its_own_stack_pair(branch_helper):
    result = branch_helper.run("--log-group", "api")
    assert result.returncode == 0, result.stderr
    assert result.stdout == "/aws/lambda/declared/diet-tracker-fb-ApiFunction-x1\n"
    first, second = branch_helper.lookups()
    assert "--stack-name diet-tracker-fb " in first
    assert "--stack-name diet-tracker-fb-cognito " in second


@pytest.mark.parametrize("arguments", [
    ("--logs", "api", "--env", "dev"),
    ("--logs", "api", "dev"),
    ("--log-group", "api", "dev"),
    ("--functions", "dev"),
])
def test_an_environment_argument_is_refused(helper, arguments):
    assert helper.run(*arguments).returncode == 2
    assert helper.tails() == []


@pytest.mark.parametrize("action", ["--logs", "--log-group"])
def test_a_missing_stack_stops_with_the_lookups_own_message(helper, action):
    result = helper.run(action, "api", failure="Stack with id diet-tracker does not exist")
    assert result.returncode != 0
    assert result.stdout == ""
    assert "Stack with id diet-tracker does not exist" in result.stderr
    assert helper.tails() == []


def test_another_failed_lookup_is_passed_on_and_stops(helper):
    result = helper.run("--logs", "api", failure="AccessDenied")
    assert result.returncode != 0
    assert "AccessDenied" in result.stderr
    assert helper.tails() == []


def test_the_listing_stops_at_a_missing_stack(branch_helper):
    result = branch_helper.run("--functions",
                               failure="Stack with id diet-tracker-fb does not exist")
    assert result.returncode != 0
    assert "diet-tracker-fb does not exist" in result.stderr


def _calls(helper, prefix):
    return [call for call in helper.all_calls() if call.startswith(prefix)]


def test_delete_stack_stops_at_a_bucket_that_holds_objects(helper):
    result = helper.run("--delete-stack", stdin="diet-tracker\n", holds_objects=True)
    assert result.returncode == 1
    assert "s3://diet-tracker-frontend" in result.stderr
    assert "--delete-stack --empty" in result.stderr
    assert "diet-tracker-files" not in result.stderr
    assert _calls(helper, "s3api delete-objects") == []
    assert _calls(helper, "cloudformation delete-stack") == []


@pytest.mark.parametrize("args", [["--delete-stack", "--empty"], ["--empty", "--delete-stack"]])
def test_delete_stack_with_empty_empties_the_buckets_and_then_deletes(helper, args):
    result = helper.run(*args, stdin="diet-tracker\n", holds_objects=True)
    assert result.returncode == 0, result.stderr
    calls = helper.all_calls()
    emptied = next(i for i, call in enumerate(calls)
                   if call.startswith("s3api delete-objects"))
    deleted = [i for i, call in enumerate(calls)
               if call.startswith("cloudformation delete-stack")]
    assert "--bucket diet-tracker-frontend " in calls[emptied]
    assert len(deleted) == 2 and emptied < deleted[0]
    assert "--stack-name diet-tracker" in calls[deleted[0]]
    assert "--stack-name diet-tracker-cognito" in calls[deleted[1]]
    batch = json.loads(Path(f"{helper.calls}.deleted").read_text())
    assert batch["Objects"] == [
        {"Key": "index.html", "VersionId": "v1"},
        {"Key": "old.js", "VersionId": "v2"},
    ]
    # The bucket the template retains is named and never listed or emptied.
    assert "Keeping s3://diet-tracker-files" in result.stdout
    assert not any("diet-tracker-files" in call for call in calls)


def test_delete_stack_deletes_stacks_whose_buckets_are_empty(helper):
    result = helper.run("--delete-stack", stdin="diet-tracker\n")
    assert result.returncode == 0, result.stderr
    assert _calls(helper, "s3api delete-objects") == []
    assert len(_calls(helper, "cloudformation delete-stack")) == 2


def test_delete_stack_touches_nothing_unless_the_stack_is_named(helper):
    result = helper.run("--delete-stack", "--empty", stdin="other\n", holds_objects=True)
    assert result.returncode == 1
    assert _calls(helper, "s3api") == []
    assert _calls(helper, "cloudformation delete-stack") == []


@pytest.mark.parametrize(
    "args", [["--empty"], ["--empty", "--functions"], ["--delete-stack", "--empty", "dev"]]
)
def test_empty_is_refused_without_delete_stack(helper, args):
    result = helper.run(*args)
    assert result.returncode == 2
    assert helper.all_calls() == []


@pytest.mark.parametrize("args, stdin", [(["--prune-layers", "--yes"], None),
                                         (["--prune-layers"], "prune\n")])
def test_prune_layers_deletes_the_versions_no_function_uses(helper, args, stdin):
    result = helper.run(*args, stdin=stdin)
    assert result.returncode == 0, result.stderr
    assert "--function-version ALL" in _calls(helper, "lambda list-functions")[0]
    assert "shared:2  created 2026-02-01" in result.stdout
    assert "shared:3" not in result.stdout
    (delete,) = _calls(helper, "lambda delete-layer-version")
    assert "--layer-name shared --version-number 2" in delete


def test_prune_layers_deletes_nothing_when_every_version_is_used(helper):
    result = helper.run("--prune-layers", used_layer_versions="2 3")
    assert result.returncode == 0, result.stderr
    assert "in use" in result.stdout
    assert _calls(helper, "lambda delete-layer-version") == []


def test_prune_layers_deletes_nothing_on_a_wrong_confirmation(helper):
    result = helper.run("--prune-layers", stdin="yes\n")
    assert result.returncode == 1
    assert "shared:2" in result.stdout
    assert "nothing deleted" in result.stderr
    assert _calls(helper, "lambda delete-layer-version") == []


@pytest.mark.parametrize("args", [["--no-such-option"], ["--log-group"], ["--logs"],
                                  ["--prune-layers", "extra"],
                                  ["--prune-layers", "--yes", "extra"]])
def test_a_usage_error_needs_no_credentials_file(helper, args):
    (helper.checkout / CREDENTIALS).unlink()
    result = helper.run(*args)
    assert result.returncode == 2
    assert helper.all_calls() == []


def test_enabling_the_git_hooks_is_reported_outside_the_captured_output(helper):
    subprocess.run(["git", "-C", str(helper.checkout), "config", "--unset", "core.hooksPath"], check=True)
    result = helper.run("--log-group", "api")
    assert (result.returncode, result.stdout) == (0, "/aws/lambda/declared/diet-tracker-ApiFunction-x1\n")
    assert "core.hooksPath" in result.stderr
