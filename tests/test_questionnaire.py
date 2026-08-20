import json
from pathlib import Path

import pytest

from common.questionnaire import load

CONFIG = Path(__file__).parent.parent / "config" / "questionnaire.json"


def write(tmp_path, raw):
    path = tmp_path / "q.json"
    path.write_text(json.dumps(raw), encoding="utf-8")
    return path


def minimal(**overrides):
    raw = {
        "version": 1,
        "questions": [{
            "id": "carbs", "type": "points", "text": "carbs", "max": 30,
            "choices": [{"id": "no_carbs", "label": "none", "value": 0},
                        {"id": "grade3", "label": "g3", "value": 3}],
        }],
        "rules": [{"id": "heavy", "question_id": "carbs", "at_least": 8,
                   "consecutive_days": 2, "message": "heavy {days}"}],
    }
    raw.update(overrides)
    return raw


def test_repo_config_loads_with_numeric_choices_and_threshold_rules():
    q = load(CONFIG)
    assert q.version == 4
    carbs = q.question("carbs")
    assert carbs.type == "points" and carbs.max == 30
    assert q.carb_weights()["grade7_heavy"] == 8
    assert q.carb_weights()["grade1"] == 1
    assert q.carb_weights()["grade2"] == 2
    assert "grade1_2" not in q.carb_weights()
    assert {r.id for r in q.rules} == {
        "low_drinking", "no_vegetables", "long_eating_window", "too_many_meals", "heavy_carbs"}


def test_rule_violates_compares_numerically(tmp_path):
    q = load(write(tmp_path, minimal()))
    rule = q.rules[0]
    assert rule.violates(8) and rule.violates(11)
    assert not rule.violates(7.9)


def test_below_rule_violates_under_threshold(tmp_path):
    raw = minimal(rules=[{"id": "low", "question_id": "carbs", "below": 2,
                          "consecutive_days": 1, "message": "low {days}"}])
    rule = load(write(tmp_path, raw)).rules[0]
    assert rule.violates(1.9) and not rule.violates(2)


def test_rule_must_have_exactly_one_comparator(tmp_path):
    raw = minimal(rules=[{"id": "bad", "question_id": "carbs", "at_least": 8, "below": 2,
                          "consecutive_days": 1, "message": "x {days}"}])
    with pytest.raises(ValueError, match="exactly one"):
        load(write(tmp_path, raw))
    raw = minimal(rules=[{"id": "bad", "question_id": "carbs",
                          "consecutive_days": 1, "message": "x {days}"}])
    with pytest.raises(ValueError, match="exactly one"):
        load(write(tmp_path, raw))


def test_choice_without_value_is_rejected(tmp_path):
    raw = minimal()
    del raw["questions"][0]["choices"][0]["value"]
    with pytest.raises(ValueError, match="value"):
        load(write(tmp_path, raw))


def test_validate_answers_accepts_numbers_and_rejects_everything_else(tmp_path):
    q = load(write(tmp_path, minimal()))
    q.validate_answers({"carbs": 12})
    q.validate_answers({"carbs": 0.5})
    with pytest.raises(ValueError, match="number"):
        q.validate_answers({"carbs": "grade3"})
    with pytest.raises(ValueError, match="number"):
        q.validate_answers({"carbs": True})
    with pytest.raises(ValueError, match="negative"):
        q.validate_answers({"carbs": -1})
    with pytest.raises(ValueError, match="missing"):
        q.validate_answers({})
    with pytest.raises(ValueError, match="unknown"):
        q.validate_answers({"carbs": 1, "extra": 2})


def test_value_label_maps_back_to_choice_label(tmp_path):
    q = load(write(tmp_path, minimal()))
    assert q.question("carbs").value_label(3) == "g3"
    assert q.question("carbs").value_label(17) == "17"
