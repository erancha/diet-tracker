"""Derives a day's four tracked questionnaire values from its recorded meals. The same
computation exists as frontend/src/derive.ts for live dashboard feedback; both implementations
must satisfy config/derive-vectors.json, and the server's result is the authority (floors,
submit validation)."""

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


def derive(meals: list, weights: dict, addition_values: dict, small_portion) -> Derived:
    if not meals:
        return Derived(carbs=0, meals=0, vegetables=0, eating_window=0)
    ordered = sorted(meals, key=lambda meal: datetime.fromisoformat(meal["at"]))
    carbs = 0
    fruits = 0
    for meal in ordered:
        weight = weights[meal["carbs_choice"]]
        # Quantity applies to the meal's own grade, before the fruit escalation floors it: the
        # escalation prices a second fruit, not the helping of whatever else was on the plate, so
        # a small portion must not discount it.
        if meal["small_portion"] and small_portion.offered_for(weight):
            weight = small_portion.weigh(weight)
        if meal["fruit"]:
            fruits += 1
            if fruits > 1:
                weight = max(weight, weights[FRUIT_ESCALATION_CHOICE])
        # Additions (a sweet, alcohol, too many nuts) cost on top of the meal's grade (escalated
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
        eating_window=round(window.total_seconds() / 1800) / 2,
    )
