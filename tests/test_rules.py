from pathlib import Path

from common.questionnaire import load
from common.rules import due_alerts, mark_alerted, streak

CONFIG = Path(__file__).parent.parent / "config" / "questionnaire.json"
Q = load(CONFIG)
WINDOW_RULE = next(r for r in Q.rules if r.id == "long_eating_window")  # threshold 3


def day_answers(window_choice):
    return {"eating_window": window_choice, "meals": "m3", "carbs": "grade3"}


def history(*choices_newest_last, end="2026-08-18"):
    """Build consecutive-day history ending at `end` from eating_window choices."""
    from datetime import date, timedelta
    end_d = date.fromisoformat(end)
    days = {}
    for i, choice in enumerate(reversed(choices_newest_last)):
        days[(end_d - timedelta(days=i)).isoformat()] = day_answers(choice)
    return days


def test_streak_counts_consecutive_violating_days():
    h = history("over_12", "over_12", "over_12")
    assert streak(WINDOW_RULE, h, "2026-08-18") == 3


def test_streak_broken_by_compliant_day_and_by_gap():
    assert streak(WINDOW_RULE, history("over_12", "h10", "over_12"), "2026-08-18") == 1
    gapped = history("over_12", "over_12")
    del gapped["2026-08-17"]
    assert streak(WINDOW_RULE, gapped, "2026-08-18") == 1


def test_streak_zero_when_as_of_missing_or_question_absent():
    assert streak(WINDOW_RULE, {}, "2026-08-18") == 0
    # An answer set predating the question's introduction ends the streak, not the evaluation.
    old = history("over_12", "over_12", "over_12")
    del old["2026-08-16"]["eating_window"]
    assert streak(WINDOW_RULE, old, "2026-08-18") == 2


def test_streak_fires_on_multi_question_when_any_selected_choice_violates(multi_questionnaire):
    rule = multi_questionnaire.rules[0]
    h = {
        "2026-08-17": {"carbs": ["grade7_heavy", "grade3"]},
        "2026-08-18": {"carbs": ["grade1_2", "off_reset"]},
    }
    assert streak(rule, h, "2026-08-18") == 2
    violations = due_alerts(multi_questionnaire, h, "2026-08-18", {"rules": {}})
    assert [v.rule_id for v in violations] == ["heavy_carbs"]


def test_due_alerts_fire_at_threshold_and_dedup_same_day():
    h = history("over_12", "over_12", "over_12")
    state = {"rules": {}}
    violations = due_alerts(Q, h, "2026-08-18", state)
    assert [v.rule_id for v in violations] == ["long_eating_window"]
    assert violations[0].message == "חלון אכילה מעל 12 שעות 3 ימים ברצוף"
    state = mark_alerted(state, violations, "2026-08-18")
    assert due_alerts(Q, h, "2026-08-18", state) == []


def test_due_alerts_fire_again_next_day():
    h = history("over_12", "over_12", "over_12", "over_12")
    state = mark_alerted({"rules": {}}, due_alerts(Q, h, "2026-08-17", {"rules": {}}), "2026-08-17")
    violations = due_alerts(Q, h, "2026-08-18", state)
    assert [v.streak for v in violations] == [4]
