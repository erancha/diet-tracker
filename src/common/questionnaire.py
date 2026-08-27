"""Parses and validates the questionnaire element of the app config — the single source of truth
for questions, numeric choice values (meal-point weights for carbs), and threshold alert rules
shared by the API, the nudge jobs, and the frontend. Reading the file is appconfig's job."""

from dataclasses import dataclass
from numbers import Number


@dataclass(frozen=True)
class Choice:
    id: str
    label: str
    value: float
    # A choice phrased as an open-ended bound answers for everything past the ladder's last
    # measured step, so its value is a sentinel one step beyond rather than a quantity. Mirrors
    # the bound field frontend/src/types.ts declares.
    bound: bool = False


QUESTION_TYPES = {"single", "points"}


@dataclass(frozen=True)
class SmallPortion:
    """The reduced-quantity option a carbs choice may be recorded at.

    The grade ladder ranks a meal by its carb source alone, so quantity is recorded separately: a
    meal marked as a small portion counts its grade's weight at `percent`. It is offered only from
    `from_value` up, where a lighter helping is a distinction worth drawing and the reduced weight
    still lands above zero."""
    label: str
    from_value: float
    percent: float

    def offered_for(self, weight: float) -> bool:
        return weight >= self.from_value

    def weigh(self, weight: float) -> float:
        return weight * self.percent / 100


@dataclass(frozen=True)
class Question:
    id: str
    type: str
    text: str
    choices: tuple[Choice, ...]
    # Parenthesized qualifier appended to the text in day-scope headings (see day_title). The
    # config also carries a meal_qualifier for the frontend's per-meal picker; the backend never
    # renders a meal-scope heading, so it is not modeled here.
    day_qualifier: str | None
    # What the question measures, named in the day-scope heading — see day_title. Mirrors the
    # unit field frontend/src/types.ts declares.
    unit: str | None
    # Present only on questions charted as a trend panel.
    panel_title: str | None
    # Present only on points questions: the day-end slider's top of scale. Meal sums may
    # legally exceed it; it caps the slider, not the stored value.
    max: float | None
    # Present only on the carbs question: the accompaniments a meal may carry (a sweet, alcohol,
    # too many nuts), each with the point cost it adds on top of the meal's grade. Not choices,
    # so they never appear in the grade picker or carb_weights().
    additions: tuple[Choice, ...] | None
    # Present only on the carbs question: the quantity axis the grade ladder does not carry.
    small_portion: "SmallPortion | None"

    @property
    def day_title(self) -> str:
        """The question's day-scope heading — the base text plus the day qualifier when one is
        declared, else the unit it measures in. Mirrors questionTitle(question, "day") in
        frontend/src/violations.ts."""
        qualifier = self.day_qualifier if self.day_qualifier is not None else self.unit
        if qualifier is None:
            return self.text
        return f"{self.text} ({qualifier})"

    def value_label(self, value) -> str:
        """The choice label for an exactly-matching value. Stored values between choice anchors,
        or past them, are legal — the meal log derives them — and carry the question's unit so a
        computed 10.4h window reads as an eating window rather than a bare number. A points
        question stores a summed score, not a picked choice, so its value is always rendered as
        the number: a score of 3 happening to equal grade3's per-meal weight does not mean
        grade3 was eaten."""
        if self.type == "points":
            return f"{value:g}"
        for choice in self.choices:
            if choice.value == value:
                return choice.label
        if self.unit is None:
            return f"{value:g}"
        return f"{value:g} {self.unit}"


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

    @property
    def threshold(self) -> float:
        """The comparator bound: at_least when set, otherwise below."""
        if self.at_least is not None:
            return self.at_least
        return self.below


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

    def addition_values(self) -> dict:
        """Point cost per addition id — the surcharge table for meal derivation; the config must
        declare the additions."""
        additions = self.question("carbs").additions
        if additions is None:
            raise ValueError("carbs question must declare additions")
        return {addition.id: addition.value for addition in additions}

    def small_portion(self) -> SmallPortion:
        """The carbs question's reduced-portion option; the config must declare it."""
        declared = self.question("carbs").small_portion
        if declared is None:
            raise ValueError("carbs question must declare small_portion")
        return declared

    def validate_answers(self, answers: dict, floors: dict | None = None) -> None:
        """Rejects answers outside each question's domain: a single question accepts only its
        choice values, a points question its 0..max range. A value equal to its entry in floors
        (the day's meal-derived values) is also legal — the tracked truth may exceed the choice
        scale."""
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
            question = self.question(question_id)
            floor = floors.get(question_id) if floors else None
            # 1e-9 absorbs float representation noise, matching the submit floor check.
            matches_floor = floor is not None and abs(value - floor) < 1e-9
            if matches_floor:
                continue
            if question.type == "single":
                if all(choice.value != value for choice in question.choices):
                    raise ValueError(
                        f"answer for question {question_id!r} ({value}) is not a choice value")
            elif value > question.max:
                raise ValueError(
                    f"answer for question {question_id!r} ({value}) exceeds the maximum "
                    f"({question.max})")


def parse(raw: dict) -> Questionnaire:
    questions = []
    for q in raw["questions"]:
        if q.get("type") not in QUESTION_TYPES:
            raise ValueError(f"question {q['id']!r} has missing or unknown type {q.get('type')!r}")
        for c in q["choices"]:
            if isinstance(c.get("value"), bool) or not isinstance(c.get("value"), Number):
                raise ValueError(f"choice {c['id']!r} of question {q['id']!r} needs a numeric value")
        for a in q.get("additions", ()):
            if isinstance(a.get("value"), bool) or not isinstance(a.get("value"), Number):
                raise ValueError(f"addition {a['id']!r} of question {q['id']!r} needs a numeric value")
        questions.append(Question(
            id=q["id"], type=q["type"], text=q["text"],
            choices=tuple(Choice(id=c["id"], label=c["label"], value=c["value"],
                                 bound=c.get("bound", False)) for c in q["choices"]),
            day_qualifier=q.get("day_qualifier"), unit=q.get("unit"),
            panel_title=q.get("panel_title"), max=q.get("max"),
            additions=tuple(Choice(id=a["id"], label=a["label"], value=a["value"])
                            for a in q["additions"]) if "additions" in q else None,
            small_portion=SmallPortion(label=q["small_portion"]["label"],
                                       from_value=q["small_portion"]["from_value"],
                                       percent=q["small_portion"]["percent"])
            if "small_portion" in q else None,
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
