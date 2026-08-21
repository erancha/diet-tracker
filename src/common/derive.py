"""Derives a day's four tracked questionnaire values from its recorded meals. The same
computation exists as frontend/src/derive.ts for live dashboard feedback; both implementations
must satisfy config/derive-vectors.json, and the server's result is the authority (floors,
submit validation)."""

from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class Derived:
    carbs: float
    meals: int
    vegetables: int
    eating_window: float


def derive(meals: list, weights: dict) -> Derived:
    if not meals:
        return Derived(carbs=0, meals=0, vegetables=0, eating_window=0)
    times = sorted(datetime.fromisoformat(meal["at"]) for meal in meals)
    return Derived(
        carbs=sum(weights[meal["carbs_choice"]] for meal in meals),
        meals=len(meals),
        vegetables=sum(1 for meal in meals if meal["vegetables"]),
        eating_window=round((times[-1] - times[0]).total_seconds() / 1800) / 2,
    )
