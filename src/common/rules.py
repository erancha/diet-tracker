"""Judges per-day numeric answers against the questionnaire's rules: which days crossed a bound,
and what subject a bound is named under."""

from common import appconfig
from common.dates import weekday_index


def falls_on(day: str, weekday: str) -> bool:
    """Whether a date falls on the named weekday, given in appconfig.WEEKDAYS' three-letter form."""
    return appconfig.WEEKDAYS[weekday_index(day)] == weekday


def violating_days(rule, history: dict) -> int:
    """How many days in `history` crossed the rule's bound on their own — the per-day test the
    trend chart's red dots and the history table's red cells apply, the treat day included."""
    return sum(1 for answers in history.values()
               if rule.question_id in answers and rule.violates(answers[rule.question_id]))


def crossed_days(questionnaire, history: dict) -> dict:
    """How many days of `history` crossed each bound, keyed by the bound's subject name; a subject
    no day crossed is absent."""
    return {subject_name(questionnaire, rule): over
            for rule in questionnaire.rules if (over := violating_days(rule, history))}


def spent(excluded: dict, day: str):
    """What the day spent on flours and sugars. `excluded` holds only days with meals, so a day
    absent from it recorded none and spent nothing."""
    return excluded[day] if day in excluded else 0


def clean_days(history: dict, excluded: dict, treat_weekday: str) -> int:
    """How many closed days off the treat day spent nothing on flours and sugars. The treat day
    is neither clean nor not: it is what the spending is for."""
    return sum(1 for day in history
               if not falls_on(day, treat_weekday) and spent(excluded, day) == 0)


def subject_name(questionnaire, rule) -> str:
    """The subject a rule judges, named as the day view titles it — the words the weekly recap
    and its context both count a crossed bound under."""
    question = questionnaire.question(rule.question_id)
    return question.day_title or question.panel_title or question.day_heading
