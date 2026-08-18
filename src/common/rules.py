"""Evaluates alert rules over per-day answer history.

A rule fires when its question was answered with a violating choice for at least
`consecutive_days` days ending at the evaluation date. Alerts repeat daily while the streak
holds, but at most once per (rule, date) — `mark_alerted` records the date so the submit path
and the nightly job never double-alert the same day.
"""

from dataclasses import dataclass
from datetime import date, timedelta

# Window both the synchronous submit path and the nightly job evaluate streaks over.
LOOKBACK_DAYS = 30


@dataclass(frozen=True)
class Violation:
    rule_id: str
    streak: int
    message: str


def selected_ids(value) -> set:
    """Normalizes a single-question answer (str) or multi-question answer (list) to a choice-id set."""
    return {value} if isinstance(value, str) else set(value)


def streak(rule, history: dict, as_of: str) -> int:
    day = date.fromisoformat(as_of)
    count = 0
    while True:
        answers = history.get(day.isoformat())
        if answers is None:
            break
        if rule.question_id not in answers:
            # Answers predating the question's introduction are legal; they end the streak.
            break
        if not selected_ids(answers[rule.question_id]) & rule.violating_choice_ids:
            break
        count += 1
        day -= timedelta(days=1)
    return count


def due_alerts(questionnaire, history: dict, as_of: str, state: dict) -> list:
    violations = []
    for rule in questionnaire.rules:
        current = streak(rule, history, as_of)
        # A rule with no alert history is a legal state for new users and new rules.
        already = state["rules"].get(rule.id, {}).get("last_alert_for")
        if current >= rule.consecutive_days and already != as_of:
            violations.append(Violation(rule.id, current, rule.message.format(days=current)))
    return violations


def mark_alerted(state: dict, violations: list, as_of: str) -> dict:
    rules_state = dict(state["rules"])
    for violation in violations:
        rules_state[violation.rule_id] = {"last_alert_for": as_of}
    return {**state, "rules": rules_state}
