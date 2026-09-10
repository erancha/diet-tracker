"""The repository declares its license in five places — the root LICENSE file GitHub reads for the
sidebar, NOTICE holding the extra grant the license itself does not give, the frontend package
manifest, and the README's badge and License section. A site left behind states a different
license from the others, so each test pins one site to the PolyForm terms."""

import json
from pathlib import Path

ROOT = Path(__file__).parent.parent
LICENSE = (ROOT / "LICENSE").read_text()
NOTICE = (ROOT / "NOTICE").read_text()
README = (ROOT / "README.md").read_text()
PACKAGE = json.loads((ROOT / "frontend" / "package.json").read_text())

REQUIRED_NOTICE = "Required Notice: Copyright Eran Hachmon (https://github.com/erancha)"
CONTACT = "erancha@gmail.com"


def test_license_file_carries_polyform_under_the_copyright_preamble():
    assert LICENSE.startswith("Copyright (c) 2026 Eran Hachmon\n")
    assert "# PolyForm Noncommercial License 1.0.0" in LICENSE


def test_license_file_states_the_notice_recipients_must_pass_on():
    assert REQUIRED_NOTICE in LICENSE
    assert REQUIRED_NOTICE in NOTICE


def test_notice_grants_evaluation_and_private_deployment_to_companies():
    assert "including a for-profit company" in NOTICE
    assert "private deployment" in NOTICE


def test_notice_routes_commercial_use_to_the_author():
    assert "Commercial use is not granted" in NOTICE
    assert CONTACT in NOTICE


def test_frontend_package_points_at_the_license_file():
    assert PACKAGE["license"] == "SEE LICENSE IN ../LICENSE"


def test_readme_points_at_the_license_and_notice_files():
    assert "[PolyForm Noncommercial License 1.0.0](LICENSE)" in README
    assert "[NOTICE](NOTICE)" in README
    assert CONTACT in README


def test_readme_badge_links_to_the_license_file():
    badge = (
        "[![License: PolyForm Noncommercial 1.0.0]"
        "(https://img.shields.io/badge/License-PolyForm%20Noncommercial%201.0.0-blue.svg)](LICENSE)"
    )
    assert badge in README
