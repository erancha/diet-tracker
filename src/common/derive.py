"""Derives a day's four tracked questionnaire values from its recorded meals, and the part of
its carb score that the program excludes from its six non-treat days. The same computation
exists as frontend/src/derive.ts for live dashboard feedback; both implementations must satisfy
config/derive-vectors.json, and the server's result is the authority (floors, submit
validation)."""

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


def _source_weight(choice, portion_id, weights, portions) -> float:
    """What the plate's main carb source weighs: its grade, at its recorded helping where the
    quantity rule offers one. The helping id must resolve against the declared scale even below
    the offered grade — a bad id is a data fault, never a quiet full serving — but it discounts
    only from the threshold up, matching where the picker exists."""
    weight = weights[choice]
    if portion_id is not None and portions.offered_for(weight):
        return portions.weigh(weight, portion_id)
    if portion_id is not None:
        portions.percent(portion_id)
    return weight


def _addition_weight(addition, addition_values, amounts) -> float:
    """What one recorded addition costs: its configured surcharge at the amount it was recorded
    at, or the surcharge whole when the record carries no amount."""
    value = addition_values[addition["id"]]
    if addition["amount"] is None:
        return value
    return amounts.weigh(value, addition["amount"])


@dataclass(frozen=True)
class MealWeight:
    """One meal's carb contribution: what it added to the day score, and how much of that came
    from what the program excludes on its six non-treat days. Every term of `excluded` is also a
    term of `total`, so the excluded part never exceeds the meal's own weight — the fruit
    escalation and every permitted grade lift the total alone."""
    total: float
    excluded: float


def meal_weights(meals: list, weights: dict, addition_values: dict, amounts, portions,
                 second_source, excluded) -> list:
    """Each meal's contribution, in the order the meals were eaten — the order the fruit
    escalation is applied in. The day's carb score is the sum of the totals and its excluded part
    the sum of the excluded, both weighed in this one walk so the two can never disagree."""
    result = []
    fruits = 0
    for meal in sorted(meals, key=lambda meal: datetime.fromisoformat(meal["at"])):
        # Quantity applies to each source's own grade, before the fruit escalation floors their
        # sum: the escalation prices a second fruit, not the helping of whatever else was on the
        # plate, so a reduced helping must not discount it.
        weight = _source_weight(meal["carbs_choice"], meal["portion"], weights, portions)
        part = weight if excluded.counts_source(weights[meal["carbs_choice"]]) else 0
        # A plate drawing on two light carb sources is one method-approved plate, so the higher
        # grade speaks for both. A heavier second source — a slice of white bread beside a grade 2
        # bowl — always carries a helping from the shared scale, adding its grade at that
        # helping's percentage.
        second = meal["second_source"]
        if second is not None:
            second_weight = weights[second["carbs_choice"]]
            if second_source.is_light(second_weight):
                weight = max(weight, second_weight)
                if excluded.counts_source(second_weight):
                    part = max(part, second_weight)
            else:
                added = portions.weigh(second_weight, second["portion"])
                weight += added
                if excluded.counts_source(second_weight):
                    part += added
        if meal["fruit"]:
            fruits += 1
            if fruits > 1:
                weight = max(weight, weights[FRUIT_ESCALATION_CHOICE])
        # Additions (a sweet, alcohol, nuts) cost on top of the meal's sources (escalated or not),
        # so an excellent meal with a cookie stays cheaper than a heavy meal with one.
        for addition in meal["additions"]:
            surcharge = _addition_weight(addition, addition_values, amounts)
            weight += surcharge
            if excluded.counts_addition(addition["id"]):
                part += surcharge
        result.append(MealWeight(total=weight, excluded=part))
    return result


def derive(meals: list, weights: dict, addition_values: dict, amounts, portions,
           second_source, excluded) -> Derived:
    if not meals:
        return Derived(carbs=0, meals=0, vegetables=0, eating_window=0)
    ordered = sorted(meals, key=lambda meal: datetime.fromisoformat(meal["at"]))
    window = (datetime.fromisoformat(ordered[-1]["at"])
              - datetime.fromisoformat(ordered[0]["at"]))
    return Derived(
        carbs=sum(weighed.total for weighed in meal_weights(
            meals, weights, addition_values, amounts, portions, second_source, excluded)),
        meals=len(meals),
        vegetables=sum(1 for meal in meals if meal["vegetables"]),
        # Whole hours, rounded up: the window never understates itself, so the floor a
        # submission must meet is the conservative bound of the recorded span.
        eating_window=math.ceil(window.total_seconds() / 3600),
    )


def excluded_points(meals: list, weights: dict, addition_values: dict, amounts, portions,
                    second_source, excluded) -> float:
    """The part of the day's carb score that came from what the program excludes on its six
    non-treat days. Charted beside the score, it separates a day that stayed within the program
    from one that spent the same points on sugar and flour."""
    return sum(weighed.excluded for weighed in meal_weights(
        meals, weights, addition_values, amounts, portions, second_source, excluded))


def excluded_by_day(questionnaire, meals_by_day: dict) -> dict:
    """excluded_points for every day of a range at once, keyed by day."""
    return {day: excluded_points(meals, questionnaire.carb_weights(),
                                 questionnaire.addition_values(), questionnaire.amounts(),
                                 questionnaire.portions(), questionnaire.second_source(),
                                 questionnaire.excluded())
            for day, meals in meals_by_day.items()}
