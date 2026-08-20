import json
from pathlib import Path

import pytest

from common.derive import Derived, derive

FIXTURE = json.loads(
    (Path(__file__).parent.parent / "config" / "derive-vectors.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("vector", FIXTURE["vectors"], ids=lambda v: v["name"])
def test_derivation_vectors(vector):
    result = derive(vector["meals"], FIXTURE["weights"])
    assert result == Derived(**vector["derived"])


def test_unknown_carbs_choice_raises():
    meal = {"at": "2026-08-20T09:00:00+03:00", "carbs_choice": "nope", "vegetables": False}
    with pytest.raises(KeyError):
        derive([meal], FIXTURE["weights"])
