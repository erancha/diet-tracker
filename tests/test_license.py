"""The repository declares its license in four places — the root LICENSE file GitHub reads for the
sidebar, the frontend package manifest, and the README's badge and License section. A site left
behind states a different license from the others, so each test pins one site to MIT."""

import json
from pathlib import Path

ROOT = Path(__file__).parent.parent
LICENSE = (ROOT / "LICENSE").read_text()
README = (ROOT / "README.md").read_text()
PACKAGE = json.loads((ROOT / "frontend" / "package.json").read_text())


def test_license_file_is_mit_with_copyright_line():
    assert LICENSE.startswith("MIT License\n")
    assert "Copyright (c) 2026 Eran C" in LICENSE


def test_frontend_package_declares_mit():
    assert PACKAGE["license"] == "MIT"


def test_readme_points_at_the_license_file():
    assert "Released under the MIT License. See [LICENSE](LICENSE)." in README


def test_readme_badge_links_to_the_license_file():
    badge = "[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)"
    assert badge in README
