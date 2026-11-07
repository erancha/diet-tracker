"""Exercises scripts/aws-helper.sh against a recording stand-in for the aws CLI.

The stand-in shadows the real CLI on PATH, appends every invocation to a file the tests read
back, and answers describe-stack-resources with a fixed physical resource name so the script's
log-group resolution can complete without AWS access, or with the failure AWS_FAILURE names so
the tests see how a lookup that fails is reported.
"""

import os
import subprocess
from pathlib import Path

import pytest

SCRIPT = Path(__file__).parent.parent / "scripts" / "aws-helper.sh"

FAKE_AWS = """#!/bin/bash
echo "$*" >> "$AWS_CALLS"
if [ "$1 $2" = "cloudformation describe-stack-resources" ]; then
  if [ -n "${AWS_FAILURE:-}" ]; then
    echo "$AWS_FAILURE" >&2
    exit 254
  fi
  echo "resolved-physical-name"
fi
"""


class Helper:
    """Runs aws-helper.sh with the fake aws CLI first on PATH; `calls` holds its invocations.

    The script's credentials file is gitignored and exists only on developer machines, so the
    run points AWS_CONFIG at an empty stub — the tests pass identically with or without it."""

    def __init__(self, tmp_path):
        fake_bin = tmp_path / "bin"
        fake_bin.mkdir()
        fake_aws = fake_bin / "aws"
        fake_aws.write_text(FAKE_AWS)
        fake_aws.chmod(0o755)
        stub_config = tmp_path / "aws-config.sh"
        stub_config.write_text("")
        self.calls = tmp_path / "calls"
        self.env = {**os.environ,
                    "PATH": f"{fake_bin}:{os.environ['PATH']}",
                    "AWS_CALLS": str(self.calls),
                    "AWS_CONFIG": str(stub_config)}

    def run(self, *args, failure=""):
        return subprocess.run(["bash", str(SCRIPT), *args],
                              env={**self.env, "AWS_FAILURE": failure},
                              capture_output=True, text=True)


@pytest.fixture
def helper(tmp_path):
    return Helper(tmp_path)


def test_errors_switch_tails_the_rag_lambda_filtered_to_warnings_and_errors(helper):
    result = helper.run("--logs", "rag", "--errors")
    assert result.returncode == 0, result.stderr
    resolve, tail = helper.calls.read_text().splitlines()
    assert "cloudformation describe-stack-resources" in resolve
    assert "--stack-name sum " in resolve
    assert "--logical-resource-id RagQueryFunction" in resolve
    assert tail.startswith("logs tail /aws/lambda/resolved-physical-name")
    assert "--filter-pattern" in tail
    assert "?ERROR" in tail and "?WARN" in tail


def test_any_lambda_is_addressable_as_stack_colon_logical_id(helper):
    result = helper.run("--logs", "some-stack:SomeFunction")
    assert result.returncode == 0, result.stderr
    resolve = helper.calls.read_text().splitlines()[0]
    assert "--stack-name some-stack" in resolve
    assert "--logical-resource-id SomeFunction" in resolve


def test_the_environment_is_taken_as_deploy_takes_it(helper):
    result = helper.run("--log-group", "api", "dev")
    assert result.returncode == 0, result.stderr
    assert "--stack-name diet-tracker-dev " in helper.calls.read_text()


def test_the_old_environment_option_is_refused(helper):
    assert helper.run("--logs", "api", "--env", "dev").returncode == 2


@pytest.mark.parametrize("action", ["--logs", "--log-group"])
def test_a_missing_stack_stops_with_one_message_naming_it_and_the_fix(helper, action):
    result = helper.run(action, "api", "dev", failure="Stack with id x does not exist")
    assert result.returncode == 1
    assert result.stdout == ""
    assert result.stderr == ("no function ApiFunction in stack diet-tracker-dev; list the deployed"
                             " ones: scripts/aws-helper.sh --functions dev\n")
    assert "logs tail" not in helper.calls.read_text()


def test_another_failed_lookup_is_passed_on_and_stops(helper):
    result = helper.run("--logs", "api", failure="AccessDenied")
    assert result.returncode == 1
    assert "AccessDenied" in result.stderr
    assert "--functions" not in result.stderr
    assert "logs tail" not in helper.calls.read_text()


def test_the_listing_names_the_deploy_for_a_missing_stack(helper):
    result = helper.run("--functions", "dev", failure="Stack with id x does not exist")
    assert result.returncode == 1
    assert "diet-tracker-dev" in result.stderr and "scripts/deploy.sh dev" in result.stderr
