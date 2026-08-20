"""Loads and validates the questionnaire config — the single source of truth for questions,
numeric choice values (meal-point weights for carbs), and threshold alert rules shared by the
API, the nudge jobs, and the frontend."""

import json
from dataclasses import dataclass
from numbers import Number
from pathlib import Path


@dataclass(frozen=True)
class Choice:
    id: str
    label: str
    value: float


QUESTION_TYPES = {"single", "points"}


@dataclass(frozen=True)
class Question:
    id: str
    type: str
    text: str
    choices: tuple[Choice, ...]
    # Present only on questions charted as a trend panel.
    panel_title: str | None
    # Present only on points questions: the day-end slider's top of scale. Meal sums may
    # legally exceed it; it caps the slider, not the stored value.
    max: float | None

    def value_label(self, value) -> str:
        """The choice label for an exactly-matching value, else the number itself as text —
        stored values between choice anchors (e.g. a computed 10.4h window) are legal."""
        for choice in self.choices:
            if choice.value == value:
                return choice.label
        return f"{value:g}"


@dataclass(frozen=True)
class Rule:
    id: str
    question_id: str
    at_least: float | None
    below: float | None
    consecutive_days: int
    message: str

    def violates(self, value) -> bool:
        if self.at_least is not None:
            return value >= self.at_least
        return value < self.below


@dataclass(frozen=True)
class Questionnaire:
    version: int
    questions: tuple[Question, ...]
    rules: tuple[Rule, ...]

    def question(self, question_id: str) -> Question:
        for question in self.questions:
            if question.id == question_id:
                return question
        raise KeyError(f"unknown question {question_id!r}")

    def carb_weights(self) -> dict:
        """Meal-point weight per carbs choice id — the scoring table for meal derivation."""
        return {choice.id: choice.value for choice in self.question("carbs").choices}

    def validate_answers(self, answers: dict) -> None:
        expected = {question.id for question in self.questions}
        got = set(answers)
        if got != expected:
            raise ValueError(
                f"answers must cover exactly the questionnaire questions; "
                f"missing={sorted(expected - got)}, unknown={sorted(got - expected)}"
            )
        for question_id, value in answers.items():
            # bool is a Number subtype; it is never a legal answer.
            if isinstance(value, bool) or not isinstance(value, Number):
                raise ValueError(f"answer for question {question_id!r} must be a number")
            if value < 0:
                raise ValueError(f"answer for question {question_id!r} must not be negative")


def load(path) -> Questionnaire:
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    questions = []
    for q in raw["questions"]:
        if q.get("type") not in QUESTION_TYPES:
            raise ValueError(f"question {q['id']!r} has missing or unknown type {q.get('type')!r}")
        for c in q["choices"]:
            if isinstance(c.get("value"), bool) or not isinstance(c.get("value"), Number):
                raise ValueError(f"choice {c['id']!r} of question {q['id']!r} needs a numeric value")
        questions.append(Question(
            id=q["id"], type=q["type"], text=q["text"],
            choices=tuple(Choice(id=c["id"], label=c["label"], value=c["value"]) for c in q["choices"]),
            panel_title=q.get("panel_title"), max=q.get("max"),
        ))
    questions = tuple(questions)
    rules = []
    for r in raw["rules"]:
        comparators = [k for k in ("at_least", "below") if k in r]
        if len(comparators) != 1:
            raise ValueError(f"rule {r['id']!r} must set exactly one of at_least/below")
        rules.append(Rule(id=r["id"], question_id=r["question_id"],
                          at_least=r.get("at_least"), below=r.get("below"),
                          consecutive_days=r["consecutive_days"], message=r["message"]))
    rules = tuple(rules)
    question_ids = [q.id for q in questions]
    if len(set(question_ids)) != len(question_ids):
        raise ValueError("duplicate question ids")
    for rule in rules:
        if all(q.id != rule.question_id for q in questions):
            raise ValueError(f"rule {rule.id!r} references unknown question {rule.question_id!r}")
        if "{days}" not in rule.message:
            raise ValueError(f"rule {rule.id!r} message must contain {{days}}")
    return Questionnaire(version=raw["version"], questions=questions, rules=rules)
