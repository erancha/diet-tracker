"""Exercises scripts/aws-helper.sh against a recording stand-in for the aws CLI.

The stand-in shadows the real CLI on PATH, appends every invocation to a file the tests read
back, and answers describe-stack-resources with a fixed physical resource name so the script's
log-group resolution can complete without AWS access.
"""

import os
import subprocess
from pathlib import Path

import pytest

SCRIPT = Path(__file__).parent.parent / "scripts" / "aws-helper.sh"

FAKE_AWS = """#!/bin/bash
echo "$*" >> "$AWS_CALLS"
if [ "$1 $2" = "cloudformation describe-stack-resources" ]; then
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

    def run(self, *args):
        return subprocess.run(["bash", str(SCRIPT), *args],
                              env=self.env, capture_output=True, text=True)


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
