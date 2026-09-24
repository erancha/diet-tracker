"""Composes the question the app asks on a user's behalf for their next meal: today's facts the
app is authoritative on, as counts in the questionnaire's vocabulary, then a fixed request for
two quick recipes under the program's rules, the program's own or equivalents to them. Which
counts complete a day is the program documents' to decide, so the answering service reads that
from them and the question only reports."""

from common.derive import meal_weights

# The addition whose count the fat budget is judged by; named in the question by its label.
FAT_ADDITION = "fat"

REQUEST = ("המלץ על הארוחה הבאה שלי היום, לפי כללי התוכנית: שני מתכונים קלים ומהירים, "
           "מהתוכנית או שקולים למתכוניה, הראשון המלצה והשני חלופה, שמשלימים את מה שאכלתי היום.")


def compose(meals: list, questionnaire, clock: str) -> str:
    """The question for today's next meal given today's meals so far and the wall-clock time."""
    carbs = questionnaire.question("carbs")
    weighed = meal_weights(meals, questionnaire.carb_weights(), questionnaire.addition_values(),
                           questionnaire.amounts(), questionnaire.portions(),
                           questionnaire.second_source(), questionnaire.excluded())
    heavy = any(weight.total >= carbs.heavy_meal for weight in weighed)
    fat_label = next(addition.label for addition in carbs.additions
                     if addition.id == FAT_ADDITION)
    with_fat = sum(1 for meal in meals
                   if any(addition["id"] == FAT_ADDITION for addition in meal["additions"]))
    facts = [
        f"ארוחות עד כה היום: {len(meals)}",
        f"ארוחות עם ירקות: {sum(1 for meal in meals if meal['vegetables'])}",
        f'ארוחות עם "{fat_label}": {with_fat}',
        f"פרי היום: {_yes_no(any(meal['fruit'] for meal in meals))}",
        f"ארוחה כבדה היום: {_yes_no(heavy)}",
        f"השעה: {clock}",
    ]
    return f"{REQUEST} {'; '.join(facts)}."


def _yes_no(flag: bool) -> str:
    return "כן" if flag else "לא"
