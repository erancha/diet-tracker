"""Loads and validates the questionnaire config — the single source of truth for
questions, choices, and alert rules shared by the API, the nudge jobs, and the frontend."""

import json
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Choice:
    id: str
    label: str


QUESTION_TYPES = {"single", "multi"}


@dataclass(frozen=True)
class Question:
    id: str
    type: str
    text: str
    choices: tuple[Choice, ...]

    def choice_label(self, choice_id: str) -> str:
        for choice in self.choices:
            if choice.id == choice_id:
                return choice.label
        raise KeyError(f"question {self.id!r} has no choice {choice_id!r}")


@dataclass(frozen=True)
class Rule:
    id: str
    question_id: str
    violating_choice_ids: frozenset
    consecutive_days: int
    message: str


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

    def validate_answers(self, answers: dict) -> None:
        expected = {question.id for question in self.questions}
        got = set(answers)
        if got != expected:
            raise ValueError(
                f"answers must cover exactly the questionnaire questions; "
                f"missing={sorted(expected - got)}, unknown={sorted(got - expected)}"
            )
        for question in self.questions:
            value = answers[question.id]
            choice_ids = {c.id for c in question.choices}
            if question.type == "single":
                if not isinstance(value, str):
                    raise ValueError(f"answer for question {question.id!r} must be a choice id string")
                if value not in choice_ids:
                    raise ValueError(f"invalid choice {value!r} for question {question.id!r}")
            else:
                if not isinstance(value, list):
                    raise ValueError(f"answer for question {question.id!r} must be a list of choice ids")
                if not value:
                    raise ValueError(f"answer for question {question.id!r} must not be empty")
                if len(set(value)) != len(value):
                    raise ValueError(f"answer for question {question.id!r} must not contain duplicates")
                unknown = set(value) - choice_ids
                if unknown:
                    raise ValueError(f"invalid choices {sorted(unknown)} for question {question.id!r}")


def load(path) -> Questionnaire:
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    questions = []
    for q in raw["questions"]:
        if "type" not in q:
            raise ValueError(f"question {q['id']!r} is missing a type")
        if q["type"] not in QUESTION_TYPES:
            raise ValueError(f"question {q['id']!r} has unknown type {q['type']!r}")
        questions.append(Question(
            id=q["id"], type=q["type"], text=q["text"],
            choices=tuple(Choice(id=c["id"], label=c["label"]) for c in q["choices"]),
        ))
    questions = tuple(questions)
    rules = tuple(
        Rule(id=r["id"], question_id=r["question_id"],
             violating_choice_ids=frozenset(r["violating_choice_ids"]),
             consecutive_days=r["consecutive_days"], message=r["message"])
        for r in raw["rules"]
    )
    question_ids = [q.id for q in questions]
    if len(set(question_ids)) != len(question_ids):
        raise ValueError("duplicate question ids")
    for rule in rules:
        question = next((q for q in questions if q.id == rule.question_id), None)
        if question is None:
            raise ValueError(f"rule {rule.id!r} references unknown question {rule.question_id!r}")
        choice_ids = {c.id for c in question.choices}
        if not rule.violating_choice_ids <= choice_ids:
            raise ValueError(f"rule {rule.id!r} references choices outside question {question.id!r}")
        if "{days}" not in rule.message:
            raise ValueError(f"rule {rule.id!r} message must contain {{days}}")
    return Questionnaire(version=raw["version"], questions=questions, rules=rules)
