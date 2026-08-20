from common import rules


def days(*values):
    """History fixture: consecutive days ending 2026-08-20 with the given carbs values,
    oldest first."""
    dates = [f"2026-08-{18 + i:02d}" for i in range(len(values))]
    return {d: {"carbs": v, "drinking": 3} for d, v in zip(dates, values)}


def test_streak_counts_consecutive_violating_days(numeric_questionnaire):
    heavy = numeric_questionnaire.rules[0]
    assert rules.streak(heavy, days(3, 9, 8), "2026-08-20") == 2
    assert rules.streak(heavy, days(9, 3, 8), "2026-08-20") == 1
    assert rules.streak(heavy, days(9, 9, 3), "2026-08-20") == 0


def test_streak_ends_on_missing_day_or_missing_question(numeric_questionnaire):
    heavy = numeric_questionnaire.rules[0]
    history = days(9, 9, 9)
    del history["2026-08-19"]
    assert rules.streak(heavy, history, "2026-08-20") == 1
    history = days(9, 9, 9)
    del history["2026-08-19"]["carbs"]
    assert rules.streak(heavy, history, "2026-08-20") == 1


def test_below_rule_streak(numeric_questionnaire):
    low = numeric_questionnaire.rules[1]
    history = {"2026-08-19": {"carbs": 0, "drinking": 2},
               "2026-08-20": {"carbs": 0, "drinking": 2.4}}
    assert rules.streak(low, history, "2026-08-20") == 2


def test_due_alerts_fires_at_threshold_once_per_day(numeric_questionnaire):
    history = days(9, 9)
    state = {"rules": {}}
    violations = rules.due_alerts(numeric_questionnaire, history, "2026-08-19", state)
    assert [v.rule_id for v in violations] == ["heavy_carbs"]
    assert "2" in violations[0].message
    state = rules.mark_alerted(state, violations, "2026-08-19")
    assert rules.due_alerts(numeric_questionnaire, history, "2026-08-19", state) == []
