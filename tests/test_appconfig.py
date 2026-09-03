import json

import pytest
from conftest import APP_CONFIG

from common import appconfig


LEGAL_MEALS = {"max_per_day": 5}


def write(tmp_path, weight, meals=LEGAL_MEALS):
    raw = {
        "questionnaire": {
            "version": 1,
            "questions": [{"id": "carbs", "type": "points", "text": "carbs", "max": 30, "heavy_meal": 4,
                           "choices": [{"id": "no_carbs", "label": "none", "value": 0}]}],
            "rules": [],
        },
        "weight": weight,
        "meals": meals,
    }
    path = tmp_path / "app.json"
    path.write_text(json.dumps(raw), encoding="utf-8")
    return path


LEGAL_WEIGHT = {"weigh_in": {"weekday": "THU", "hour": 8}, "chart_months": 3,
                "limits": {"min_kg": 20, "max_kg": 400}}


def test_repo_config_carries_every_section():
    config = appconfig.load(APP_CONFIG)
    assert config.questionnaire.question("carbs").type == "points"
    assert config.weight.weigh_in.weekday == "THU"
    assert config.weight.weigh_in.hour == 8
    assert config.weight.chart_months == 3
    assert (config.weight.limits.min_kg, config.weight.limits.max_kg) == (20, 400)
    assert config.meals.max_per_day == 5


def test_max_meals_per_day_must_be_a_positive_integer(tmp_path):
    for cap in (0, -1, 2.5, True, "5"):
        path = write(tmp_path, LEGAL_WEIGHT, meals={"max_per_day": cap})
        with pytest.raises(ValueError, match="max_per_day"):
            appconfig.load(path)


def test_weigh_in_weekday_must_be_a_scheduler_token(tmp_path):
    path = write(tmp_path, {**LEGAL_WEIGHT, "weigh_in": {"weekday": "Thursday", "hour": 8}})
    with pytest.raises(ValueError, match="weekday"):
        appconfig.load(path)


def test_weigh_in_hour_must_be_an_hour_of_the_day(tmp_path):
    for hour in (24, -1, 8.5, True, "8"):
        path = write(tmp_path, {**LEGAL_WEIGHT, "weigh_in": {"weekday": "THU", "hour": hour}})
        with pytest.raises(ValueError, match="hour"):
            appconfig.load(path)


def test_chart_months_must_name_a_span_the_selector_offers(tmp_path):
    # The configured span opens the chart on one of the range chips; a value with no chip would
    # open on a range the reader has no control to return to.
    path = write(tmp_path, {**LEGAL_WEIGHT, "chart_months": 4})
    with pytest.raises(ValueError, match="chart_months"):
        appconfig.load(path)
    assert appconfig.load(write(tmp_path, {**LEGAL_WEIGHT, "chart_months": None})).weight.chart_months is None


def test_weight_limits_must_span_a_range(tmp_path):
    path = write(tmp_path, {**LEGAL_WEIGHT, "limits": {"min_kg": 400, "max_kg": 20}})
    with pytest.raises(ValueError, match="span no range"):
        appconfig.load(path)


def test_missing_keys_surface_instead_of_defaulting(tmp_path):
    path = write(tmp_path, {"weigh_in": {"weekday": "THU", "hour": 8}})
    with pytest.raises(KeyError):
        appconfig.load(path)
