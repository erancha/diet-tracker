"""Runs scripts/init-env.sh in a scratch git checkout holding the repo's script, app-env.sh, the
settings examples and .gitignore, to check which settings files a run creates and which it keeps.
"""

import subprocess
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parent.parent
LIB = REPO / "scripts" / "lib"
EXAMPLES = sorted(LIB.glob("*.example.sh"))
SETTINGS_FILES = [example.name.replace(".example.sh", ".sh") for example in EXAMPLES]


class Checkout:
    def __init__(self, root):
        self.lib = root / "scripts" / "lib"
        self.lib.mkdir(parents=True)
        self.script = root / "scripts" / "init-env.sh"
        for source in (REPO / "scripts" / "init-env.sh", LIB / "app-env.sh", *EXAMPLES):
            target = root / source.relative_to(REPO)
            target.write_text(source.read_text())
        (root / ".gitignore").write_text((REPO / ".gitignore").read_text())
        subprocess.run(["git", "-C", str(root), "init", "--quiet"], check=True)

    def run(self, *args):
        return subprocess.run(
            ["bash", str(self.script), *args], check=False, capture_output=True, text=True
        )

    def example_of(self, name):
        return (self.lib / name.replace(".sh", ".example.sh")).read_text()


@pytest.fixture
def checkout(tmp_path):
    return Checkout(tmp_path)


def test_the_repo_has_settings_examples():
    assert "aws-config.sh" in SETTINGS_FILES


def test_init_env_creates_the_settings_files_from_their_examples(checkout):
    result = checkout.run()
    assert result.returncode == 0, result.stderr
    for name in SETTINGS_FILES:
        assert (checkout.lib / name).read_text() == checkout.example_of(name)
        assert (checkout.lib / name).stat().st_mode & 0o777 == 0o600


def test_init_env_keeps_existing_settings_files_unless_forced(checkout):
    checkout.run()
    kept, missing = SETTINGS_FILES[0], SETTINGS_FILES[-1]
    (checkout.lib / kept).write_text("export FILLED_IN=1\n")
    (checkout.lib / missing).unlink()
    result = checkout.run()
    assert result.returncode == 0, result.stderr
    assert f"{kept} already exists" in result.stdout
    assert (checkout.lib / kept).read_text() == "export FILLED_IN=1\n"
    assert (checkout.lib / missing).read_text() == checkout.example_of(missing)
    forced = checkout.run("--force")
    assert forced.returncode == 0, forced.stderr
    assert (checkout.lib / kept).read_text() == checkout.example_of(kept)
