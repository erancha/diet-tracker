import pytest
from conftest import APP_CONFIG

from common import appconfig
from common.questionnaire import parse


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
    q = appconfig.load(APP_CONFIG).questionnaire
    assert q.version == 11
    carbs = q.question("carbs")
    assert carbs.type == "points" and carbs.max == 35
    assert carbs.day_title == f"{carbs.text} ({carbs.day_qualifier})"
    # A question with no day qualifier names the unit it measures in instead, which is what lets
    # the values under that heading read as bare quantities.
    assert q.question("drinking").day_title == f'{q.question("drinking").text} (ליטר)'
    # The grade ladder ranks a meal by its carb source alone: one row per grade, weighted by the
    # grade itself, with no rung standing for a portion of another.
    assert [w for g, w in q.carb_weights().items() if g != "no_carbs"] == [1, 2, 3, 4, 5, 6, 7]
    assert q.carb_weights()["no_carbs"] == 0
    # Grades that stood for a quantity, or collapsed two of the scale's steps into one, are gone
    # from the picker; store.py reads meals recorded under them as their current equivalent.
    assert not {"grade6_7", "grade7_light", "grade7_heavy"} & set(q.carb_weights())
    # Fat is an accompaniment of any grade, not a grade of its own, so it never returns to the
    # scale as the heavy no-carb grade it replaced.
    assert "no_carbs_heavy" not in q.carb_weights()
    assert q.small_portion().percent == 50
    assert q.addition_values() == {"sweet": 4, "alcohol": 4, "nuts": 3, "fat": 2}
    # Additions are accompaniments, never grades — they must not leak into the grade picker.
    assert not set(q.addition_values()) & set(q.carb_weights())
    assert {r.id for r in q.rules} == {
        "low_drinking", "no_vegetables", "long_eating_window", "too_many_meals", "heavy_carbs"}


def test_repo_config_orders_questions_like_the_day_dashboard_with_carbs_last():
    # Question order drives the history table columns, the day-end form, and the digest;
    # it must match the day dashboard's order, with the carbs score closing the list.
    q = appconfig.load(APP_CONFIG).questionnaire
    assert [question.id for question in q.questions] == [
        "drinking", "vegetables", "eating_window", "meals", "carbs"]


def test_additions_missing_from_config_raises():
    q = parse(minimal())
    with pytest.raises(ValueError, match="additions"):
        q.addition_values()


def test_addition_without_numeric_value_is_rejected():
    raw = minimal()
    raw["questions"][0]["additions"] = [{"id": "sweet", "label": "sweet", "value": "4"}]
    with pytest.raises(ValueError, match="sweet"):
        parse(raw)


def test_rule_violates_compares_numerically():
    q = parse(minimal())
    rule = q.rules[0]
    assert rule.violates(8) and rule.violates(11)
    assert not rule.violates(7.9)


def test_below_rule_violates_under_threshold():
    raw = minimal(rules=[{"id": "low", "question_id": "carbs", "below": 2,
                          "consecutive_days": 1, "message": "low {days}"}])
    rule = parse(raw).rules[0]
    assert rule.violates(1.9) and not rule.violates(2)


def test_rule_must_have_exactly_one_comparator():
    raw = minimal(rules=[{"id": "bad", "question_id": "carbs", "at_least": 8, "below": 2,
                          "consecutive_days": 1, "message": "x {days}"}])
    with pytest.raises(ValueError, match="exactly one"):
        parse(raw)
    raw = minimal(rules=[{"id": "bad", "question_id": "carbs",
                          "consecutive_days": 1, "message": "x {days}"}])
    with pytest.raises(ValueError, match="exactly one"):
        parse(raw)


def test_choice_without_value_is_rejected():
    raw = minimal()
    del raw["questions"][0]["choices"][0]["value"]
    with pytest.raises(ValueError, match="value"):
        parse(raw)


def test_validate_answers_accepts_numbers_and_rejects_everything_else():
    q = parse(minimal())
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


def with_meals_question(extra_choices=()):
    raw = minimal()
    raw["questions"].append({
        "id": "meals", "type": "single", "text": "meals",
        "choices": [{"id": "m2", "label": "two", "value": 2},
                    {"id": "m3", "label": "three", "value": 3}, *extra_choices],
    })
    return raw


def test_validate_answers_enforces_choice_membership_and_points_range():
    q = parse(with_meals_question())
    q.validate_answers({"carbs": 12, "meals": 3})
    with pytest.raises(ValueError, match="meals"):
        q.validate_answers({"carbs": 12, "meals": 999})
    with pytest.raises(ValueError, match="meals"):
        q.validate_answers({"carbs": 12, "meals": 2.5})
    with pytest.raises(ValueError, match="carbs"):
        q.validate_answers({"carbs": 31, "meals": 3})


def test_validate_answers_accepts_tracked_floors_above_the_choice_scale():
    q = parse(with_meals_question())
    q.validate_answers({"carbs": 40, "meals": 5}, floors={"carbs": 40, "meals": 5})
    with pytest.raises(ValueError, match="meals"):
        q.validate_answers({"carbs": 12, "meals": 5}, floors={"meals": 4})


def test_value_label_carries_the_unit_on_a_value_no_choice_names():
    # The eating window is derived and rounded to the half hour, so it routinely lands between
    # the whole-hour choices; without the unit it reads as a bare number beside labelled
    # neighbours in the same history column.
    q = appconfig.load(APP_CONFIG).questionnaire.question("eating_window")
    assert q.value_label(8) == "8 שעות"
    assert q.value_label(7.5) == "7.5 שעות"
    assert q.value_label(13.5) == "13.5 שעות"


def test_value_label_leaves_a_unitless_questions_unmatched_value_bare():
    raw = minimal()
    raw["questions"].append({
        "id": "meals", "type": "single", "text": "meals",
        "choices": [{"id": "m3", "label": "three", "value": 3}],
    })
    assert parse(raw).question("meals").value_label(2.5) == "2.5"


def test_value_label_maps_single_choices_but_keeps_points_scores_numeric():
    raw = minimal()
    raw["questions"].append({
        "id": "meals", "type": "single", "text": "meals",
        "choices": [{"id": "m3", "label": "three", "value": 3}],
    })
    q = parse(raw)
    assert q.question("meals").value_label(3) == "three"
    assert q.question("meals").value_label(2.5) == "2.5"
    # A points score is a meal-weight sum, not a picked choice — 3 must not read as grade3.
    assert q.question("carbs").value_label(3) == "3"
    assert q.question("carbs").value_label(17) == "17"
