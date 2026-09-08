import json
from pathlib import Path

import pytest

from conftest import APP_CONFIG

from common import appconfig
from common.derive import Derived, derive, excluded_points
from common.questionnaire import Amounts, Excluded, Portions, ScaleOption, SecondSource
FIXTURE = json.loads(
    (Path(__file__).parent.parent / "config" / "derive-vectors.json").read_text(encoding="utf-8"))
PORTIONS = Portions(
    from_value=FIXTURE["portions"]["from_value"],
    options=tuple(ScaleOption(**p) for p in FIXTURE["portions"]["options"]))
AMOUNTS = Amounts(default=FIXTURE["amounts"]["default"],
                  options=tuple(ScaleOption(**o) for o in FIXTURE["amounts"]["options"]))
SECOND = SecondSource(light_grade_max=FIXTURE["second_source"]["light_grade_max"])
EXCLUDED = Excluded(grade=FIXTURE["excluded"]["grade"],
                    additions=tuple(FIXTURE["excluded"]["additions"]))


def _derive(meals):
    return derive(meals, FIXTURE["weights"], FIXTURE["addition_values"], AMOUNTS, PORTIONS, SECOND,
                  EXCLUDED)


def _excluded(meals):
    return excluded_points(meals, FIXTURE["weights"], FIXTURE["addition_values"], AMOUNTS,
                           PORTIONS, SECOND, EXCLUDED)


def test_vector_scoring_tables_are_the_repo_configs():
    # The vectors carry their own copies of the scoring tables so both runtimes can replay them
    # without loading the config. Retiring or repricing a grade in the config must reach them:
    # left to drift, the vectors would keep passing against a scale the app no longer serves.
    questionnaire = appconfig.load(APP_CONFIG).questionnaire
    assert FIXTURE["weights"] == questionnaire.carb_weights()
    assert FIXTURE["addition_values"] == questionnaire.addition_values()
    assert PORTIONS == questionnaire.portions()
    assert AMOUNTS == questionnaire.amounts()
    assert SECOND == questionnaire.second_source()
    assert EXCLUDED == questionnaire.excluded()


@pytest.mark.parametrize("vector", FIXTURE["vectors"], ids=lambda v: v["name"])
def test_derivation_vectors(vector):
    assert _derive(vector["meals"]) == Derived(**vector["derived"])


@pytest.mark.parametrize("vector", FIXTURE["vectors"], ids=lambda v: v["name"])
def test_excluded_vectors(vector):
    assert _excluded(vector["meals"]) == vector["excluded"]


@pytest.mark.parametrize("vector", FIXTURE["vectors"], ids=lambda v: v["name"])
def test_the_excluded_part_is_a_part_of_the_day_score(vector):
    # Every term of the excluded subtotal is also a term of the score, so the chart's second line
    # can never rise above the first.
    assert _excluded(vector["meals"]) <= _derive(vector["meals"]).carbs


def test_unknown_carbs_choice_raises():
    meal = {"at": "2026-08-20T09:00:00+03:00", "carbs_choice": "nope", "vegetables": False,
            "fruit": False, "additions": [], "portion": None}
    with pytest.raises(KeyError):
        _derive([meal])


def test_unknown_addition_raises():
    meal = {"at": "2026-08-20T09:00:00+03:00", "carbs_choice": "carb_grade_1", "vegetables": False,
            "fruit": False, "additions": [{"id": "nope", "amount": "regular"}], "portion": None,
            "second_source": None}
    with pytest.raises(KeyError):
        _derive([meal])


def test_unknown_addition_amount_raises():
    meal = {"at": "2026-08-20T09:00:00+03:00", "carbs_choice": "carb_grade_1", "vegetables": False,
            "fruit": False, "additions": [{"id": "sweet", "amount": "crumb"}], "portion": None,
            "second_source": None}
    with pytest.raises(KeyError):
        _derive([meal])


def test_an_unknown_primary_portion_raises_even_below_the_offered_grade():
    # The id must resolve against the declared scale before the offer rule decides whether it
    # discounts — a bad id is a data fault either way, never a quiet full serving.
    meal = {"at": "2026-08-20T09:00:00+03:00", "carbs_choice": "carb_grade_1", "vegetables": False,
            "fruit": False, "additions": [], "portion": "crumb", "second_source": None}
    with pytest.raises(KeyError):
        _derive([meal])


def test_a_heavy_second_source_without_a_known_portion_raises():
    meal = {"at": "2026-08-20T09:00:00+03:00", "carbs_choice": "carb_grade_1",
            "vegetables": False, "fruit": False, "additions": [], "portion": None,
            "second_source": {"carbs_choice": "carb_grade_7", "portion": None}}
    with pytest.raises(KeyError):
        _derive([meal])
