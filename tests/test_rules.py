from common import rules


def days(*values):
    """History fixture: consecutive days ending 2026-08-20 with the given carbs values,
    oldest first."""
    dates = [f"2026-08-{18 + i:02d}" for i in range(len(values))]
    return {d: {"carbs": v, "drinking": 3} for d, v in zip(dates, values)}


def test_violating_days_counts_each_crossing_day_on_its_own(numeric_questionnaire):
    heavy = numeric_questionnaire.rules[0]
    assert rules.violating_days(heavy, days(9, 3, 8)) == 2
