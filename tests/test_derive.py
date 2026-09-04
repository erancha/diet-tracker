import json
from pathlib import Path

import pytest

from conftest import APP_CONFIG

from common import appconfig
from common.derive import Derived, derive
from common.questionnaire import Portion, SecondSource, SmallPortion
FIXTURE = json.loads(
    (Path(__file__).parent.parent / "config" / "derive-vectors.json").read_text(encoding="utf-8"))
SMALL = SmallPortion(**FIXTURE["small_portion"])
SECOND = SecondSource(
    light_grade_max=FIXTURE["second_source"]["light_grade_max"],
    portions=tuple(Portion(**p) for p in FIXTURE["second_source"]["portions"]))


def test_vector_scoring_tables_are_the_repo_configs():
    # The vectors carry their own copies of the scoring tables so both runtimes can replay them
    # without loading the config. Retiring or repricing a grade in the config must reach them:
    # left to drift, the vectors would keep passing against a scale the app no longer serves.
    questionnaire = appconfig.load(APP_CONFIG).questionnaire
    assert FIXTURE["weights"] == questionnaire.carb_weights()
    assert FIXTURE["addition_values"] == questionnaire.addition_values()
    assert SmallPortion(**FIXTURE["small_portion"]) == questionnaire.small_portion()
    assert SECOND == questionnaire.second_source()


@pytest.mark.parametrize("vector", FIXTURE["vectors"], ids=lambda v: v["name"])
def test_derivation_vectors(vector):
    result = derive(vector["meals"], FIXTURE["weights"], FIXTURE["addition_values"], SMALL,
                    SECOND)
    assert result == Derived(**vector["derived"])


def test_unknown_carbs_choice_raises():
    meal = {"at": "2026-08-20T09:00:00+03:00", "carbs_choice": "nope", "vegetables": False,
            "fruit": False, "additions": [], "small_portion": False}
    with pytest.raises(KeyError):
        derive([meal], FIXTURE["weights"], FIXTURE["addition_values"], SMALL, SECOND)


def test_unknown_addition_raises():
    meal = {"at": "2026-08-20T09:00:00+03:00", "carbs_choice": "carb_grade_1", "vegetables": False,
            "fruit": False, "additions": ["nope"], "small_portion": False,
            "second_source": None}
    with pytest.raises(KeyError):
        derive([meal], FIXTURE["weights"], FIXTURE["addition_values"], SMALL, SECOND)


def test_a_heavy_second_source_without_a_known_portion_raises():
    meal = {"at": "2026-08-20T09:00:00+03:00", "carbs_choice": "carb_grade_1",
            "vegetables": False, "fruit": False, "additions": [], "small_portion": False,
            "second_source": {"carbs_choice": "carb_grade_7", "portion": None}}
    with pytest.raises(KeyError):
        derive([meal], FIXTURE["weights"], FIXTURE["addition_values"], SMALL, SECOND)
