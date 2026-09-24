import json

from conftest import APP_CONFIG, meal

from common import next_meal
from common.questionnaire import parse

questionnaire = parse(json.load(open(APP_CONFIG))["questionnaire"])
FAT_LABEL = next(addition.label for addition in questionnaire.question("carbs").additions
                 if addition.id == "fat")


def test_a_day_with_no_meals_asks_for_the_first_meal_with_zero_facts():
    question = next_meal.compose([], questionnaire, "09:15")

    assert question.startswith("המלץ על הארוחה הבאה שלי היום, לפי כללי התוכנית: שני מתכונים "
                               "קלים ומהירים, מהתוכנית או שקולים למתכוניה, הראשון המלצה והשני חלופה")
    assert "ארוחות עד כה היום: 0" in question
    assert "ארוחות עם ירקות: 0" in question
    assert f'ארוחות עם "{FAT_LABEL}": 0' in question
    assert "פרי היום: לא" in question
    assert "ארוחה כבדה היום: לא" in question
    assert "השעה: 09:15" in question


def test_the_facts_count_todays_meals_vegetables_fat_and_fruit():
    meals = [
        meal("2026-09-24T08:00:00+03:00", "carb_grade_1", vegetables=True,
             additions=[{"id": "fat", "amount": "regular"}]),
        meal("2026-09-24T13:00:00+03:00", "carb_grade_2", fruit=True,
             additions=[{"id": "fat", "amount": "little"}]),
        meal("2026-09-24T16:00:00+03:00", "no_carbs"),
    ]

    question = next_meal.compose(meals, questionnaire, "18:40")

    assert "ארוחות עד כה היום: 3" in question
    assert "ארוחות עם ירקות: 1" in question
    assert f'ארוחות עם "{FAT_LABEL}": 2' in question
    assert "פרי היום: כן" in question
    assert "ארוחה כבדה היום: לא" in question


def test_a_meal_at_the_heavy_bound_reads_as_a_heavy_day():
    heavy = questionnaire.question("carbs").heavy_meal
    grade = next(choice.id for choice in questionnaire.question("carbs").choices
                 if choice.value >= heavy)

    question = next_meal.compose([meal("2026-09-24T13:00:00+03:00", grade)], questionnaire, "15:00")

    assert "ארוחה כבדה היום: כן" in question


def test_the_only_hard_coded_words_are_the_request_and_the_fact_names():
    question = next_meal.compose([], questionnaire, "09:15")

    # The fat addition is named by its configured label, never by its id.
    assert "fat" not in question
