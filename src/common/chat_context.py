"""Renders the asking user's recent tracked data as a JSON block riding after a chat question,
so the external answering service can ground answers in the asker's own numbers.

The block carries the last week's submitted day summaries plus today's and yesterday's meals
with their derived scores, all keyed and labeled in the questionnaire's Hebrew vocabulary so
the answering LLM reads domain terms rather than internal ids. It also names the app's full
tracking scope, so the answering LLM can tell a subject the app has no field for from one the
user left unrecorded. The question text stays first: the upstream service embeds the whole
string for retrieval, and the head is what should drive the match."""

import json

from common.chat import MAX_QUESTION_CHARS
from common.dates import days_before
from common.derive import derive
from common.digest import labeled_history

SUMMARY_DAYS = 7

_HEADER = "\n\n---\nנתוני המעקב של השואל (JSON):\n"

# Meal-entry field names, shared between the per-meal entries and the tracking-scope statement
# so the scope always names the exact vocabulary the data uses.
_TIME = "שעה"
_CARB_SOURCE = "מקור פחמימה"
_SECOND_SOURCE = "מקור פחמימה נוסף"
_SMALL_PORTION = "כמות קטנה"
_VEGETABLES = "ירקות"
_FRUIT = "פרי"
_ADDITIONS = "תוספות"


def with_user_context(question, store, questionnaire, sub, day) -> str:
    """The question with the user's recent data appended, never exceeding the upstream cap.

    When the budget is tight, detail is shed in fixed order — yesterday's detail, today's,
    then the oldest summary days one at a time — and a question leaving no room at all goes
    upstream bare. The tracking scope is never shed: it is what keeps absent data readable
    as a missing field rather than an unrecorded habit. Absent data is a legal domain state
    and still rides (empty summaries let the LLM say nothing was tracked); false meal flags
    and empty addition lists are omitted from the block as the equally legal quiet state."""
    data = {
        "סיכום ימים אחרונים": _summaries(store, questionnaire, sub, day),
        "היום": _day_detail(store, questionnaire, sub, day),
        "אתמול": _day_detail(store, questionnaire, sub, days_before(day, 1)),
        "תחומי המעקב של האפליקציה": _tracking_scope(questionnaire),
    }
    budget = MAX_QUESTION_CHARS - len(question) - len(_HEADER)
    block = _bounded(data, budget)
    if block is None:
        return question
    return f"{question}{_HEADER}{block}"


def _bounded(data, budget) -> str | None:
    """The data serialized within the budget, shedding detail in fixed order until it fits;
    None when even the last remnant does not."""
    summaries = data["סיכום ימים אחרונים"]
    sheds = [lambda: data.pop("אתמול"), lambda: data.pop("היום")]
    sheds += [lambda d=date: summaries.pop(d) for date in sorted(summaries)]
    while True:
        text = json.dumps(data, ensure_ascii=False)
        if len(text) <= budget:
            return text
        if not sheds:
            return None
        sheds.pop(0)()


def _tracking_scope(questionnaire) -> dict:
    """Every field the app can record, in the vocabulary the data block uses, closed by a note
    that the list is exhaustive — so the LLM answers "the app has no such field" instead of
    reading an untracked subject as an unrecorded one."""
    carbs = questionnaire.question("carbs")
    return {
        "ברישום ארוחה": [_TIME, _CARB_SOURCE, _SECOND_SOURCE, _SMALL_PORTION, _VEGETABLES,
                         _FRUIT] + [addition.label for addition in carbs.additions],
        "בשאלון היומי": [question.day_title for question in questionnaire.questions],
        "בנוסף": ["משקל"],
        "הערה": "אלה כל שדות ההזנה באפליקציה. נושא שאינו ברשימה אין לו שדה באפליקציה, "
                "ולכן היעדרו מהנתונים אינו מעיד שהמשתמש לא צרך אותו.",
    }


def _summaries(store, questionnaire, sub, day) -> dict:
    """The user's submitted answers over the summary window, in the shared Hebrew-labeled shape."""
    return labeled_history(
        questionnaire, store.get_days_range(sub, days_before(day, SUMMARY_DAYS - 1), day))


def _day_detail(store, questionnaire, sub, day) -> dict:
    """One day's meals in Hebrew vocabulary, beside the carb score they derive to."""
    meals = store.get_meals(sub, day)
    derived = derive(meals, questionnaire.carb_weights(), questionnaire.addition_values(),
                     questionnaire.small_portion())
    carbs = questionnaire.question("carbs")
    grade_labels = {choice.id: choice.label for choice in carbs.choices}
    addition_labels = {addition.id: addition.label for addition in carbs.additions}
    return {"ציון פחמימות": derived.carbs,
            "ארוחות": [_meal_entry(meal, grade_labels, addition_labels) for meal in meals]}


def _grade_label(labels, choice, small_portion) -> str:
    if small_portion:
        return f"{labels[choice]} ({_SMALL_PORTION})"
    return labels[choice]


def _meal_entry(meal, grade_labels, addition_labels) -> dict:
    entry = {_TIME: meal["at"][11:16],
             _CARB_SOURCE: _grade_label(grade_labels, meal["carbs_choice"],
                                        meal["small_portion"])}
    second = meal["second_source"]
    if second is not None:
        entry[_SECOND_SOURCE] = _grade_label(grade_labels, second["carbs_choice"],
                                             second["small_portion"])
    if meal["vegetables"]:
        entry[_VEGETABLES] = True
    if meal["fruit"]:
        entry[_FRUIT] = True
    if meal["additions"]:
        entry[_ADDITIONS] = [addition_labels[addition] for addition in meal["additions"]]
    return entry
