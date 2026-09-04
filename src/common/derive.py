"""Derives a day's four tracked questionnaire values from its recorded meals. The same
computation exists as frontend/src/derive.ts for live dashboard feedback; both implementations
must satisfy config/derive-vectors.json, and the server's result is the authority (floors,
submit validation)."""

import math
from dataclasses import dataclass
from datetime import datetime

# Every carbs grade includes one fruit; only the day's first fruit rides free. Each fruit meal
# after it counts as the fruit grade, so its weight is raised to at least that choice's weight —
# never lowered when the meal's own grade is already heavier.
FRUIT_ESCALATION_CHOICE = "carb_grade_5"


@dataclass(frozen=True)
class Derived:
    carbs: float
    meals: int
    vegetables: int
    eating_window: float


def _source_weight(choice, small_portion_flag, weights, small_portion) -> float:
    """What one carb source on a plate weighs: its grade, at the reduced helping where the
    quantity rule offers one. A meal's main grade and its second source price identically."""
    weight = weights[choice]
    if small_portion_flag and small_portion.offered_for(weight):
        weight = small_portion.weigh(weight)
    return weight


def derive(meals: list, weights: dict, addition_values: dict, small_portion,
           second_source) -> Derived:
    if not meals:
        return Derived(carbs=0, meals=0, vegetables=0, eating_window=0)
    ordered = sorted(meals, key=lambda meal: datetime.fromisoformat(meal["at"]))
    carbs = 0
    fruits = 0
    for meal in ordered:
        # Quantity applies to each source's own grade, before the fruit escalation floors their
        # sum: the escalation prices a second fruit, not the helping of whatever else was on the
        # plate, so a small portion must not discount it.
        weight = _source_weight(meal["carbs_choice"], meal["small_portion"], weights,
                                small_portion)
        # A plate drawing on two light carb sources is one method-approved plate, so the higher
        # grade speaks for both. A heavier second source — a slice of white bread beside a grade 2
        # bowl — is always a reduced helping, adding its grade at the helping's percentage.
        second = meal["second_source"]
        if second is not None:
            second_weight = weights[second["carbs_choice"]]
            if second_source.is_light(second_weight):
                weight = max(weight, second_weight)
            else:
                weight += (second_weight
                           * second_source.portion_percent(second["portion"]) / 100)
        if meal["fruit"]:
            fruits += 1
            if fruits > 1:
                weight = max(weight, weights[FRUIT_ESCALATION_CHOICE])
        # Additions (a sweet, alcohol, too many nuts) cost on top of the meal's sources (escalated
        # or not), so an excellent meal with a cookie stays cheaper than a heavy meal with one.
        for addition in meal["additions"]:
            weight += addition_values[addition]
        carbs += weight
    window = (datetime.fromisoformat(ordered[-1]["at"])
              - datetime.fromisoformat(ordered[0]["at"]))
    return Derived(
        carbs=carbs,
        meals=len(meals),
        vegetables=sum(1 for meal in meals if meal["vegetables"]),
        # Whole hours, rounded up: the window never understates itself, so the floor a
        # submission must meet is the conservative bound of the recorded span.
        eating_window=math.ceil(window.total_seconds() / 3600),
    )
