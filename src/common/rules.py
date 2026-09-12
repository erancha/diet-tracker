"""Judges per-day numeric answers against the questionnaire's rules: which days crossed a bound,
and how a bound is named beside the mark.
"""

from datetime import date

from common import appconfig


def falls_on(day: str, weekday: str) -> bool:
    """Whether a date falls on the named weekday. WEEKDAYS is indexed Sunday-first, as the
    schedules and the frontend both read it; isoweekday() counts Monday as 1 and Sunday as 7."""
    return appconfig.WEEKDAYS[date.fromisoformat(day).isoweekday() % 7] == weekday


def violating_days(rule, history: dict) -> int:
    """How many days in `history` crossed the rule's bound on their own — the per-day test the
    trend chart's red dots and the history table's red cells apply, the treat day included."""
    return sum(1 for answers in history.values()
               if rule.question_id in answers and rule.violates(answers[rule.question_id]))


def bound_label(rule) -> str:
    """The rule's bound as the app names it beside a violation. Mirrors ruleBoundLabel in
    frontend/src/violations.ts, so a chart legend and the weekly recap quote one bound alike —
    an at_least rule reads as `מעל` there too, and the wording is what both surfaces show."""
    over = rule.at_least if rule.at_least is not None else rule.above
    if over is not None:
        return f"מעל {over:g}"
    return f"פחות מ-{rule.below:g}"
