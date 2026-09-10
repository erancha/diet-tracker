"""Renders the asking user's recent tracked data as a standalone context block, sent beside the
chat question so the external answering service can ground answers in the asker's own numbers.
The service embeds only the question for retrieval; this block reaches the answering LLM alone,
so its bulk cannot drown the question's vocabulary in the similarity search.

The block carries the last week's submitted day summaries, today's and yesterday's meals with
their derived scores, and the latest weight measurements beside the target weight, all keyed
and labeled in the questionnaire's Hebrew vocabulary so the answering LLM reads domain terms
rather than internal ids. It also names the app's full tracking scope, so the answering LLM
can tell a subject the app has no field for from one the user left unrecorded, and the whole carb
grade ladder, so a grade in a meal entry reads as food rather than a bare rung."""

import json

from common import weight
from common.chat import MAX_CONTEXT_CHARS
from common.dates import days_before
from common.derive import derive
from common.digest import labeled_history

SUMMARY_DAYS = 7

_HEADER = "נתוני המעקב של השואל (JSON):\n"

# Meal-entry field names, shared between the per-meal entries and the tracking-scope statement
# so the scope always names the exact vocabulary the data uses.
_TIME = "שעה"
_CARB_SOURCE = "מקור פחמימה"
_SECOND_SOURCE = "מקור פחמימה נוסף"
_PORTION = "גודל המנה"
_VEGETABLES = "ירקות"
_FRUIT = "פרי"
_ADDITIONS = "תוספות"
_AMOUNT = "כמות"

# Names the grade ladder for what it is on both counts: every grade the app records, each named by
# foods that exemplify it rather than bound it.
_GRADE_LADDER = "דרגות מקור הפחמימה (דוגמאות מזון)"


def user_context(store, questionnaire, sub, day) -> str | None:
    """The user's recent data as a labeled context block, never exceeding the upstream cap;
    None when even the last remnant does not fit, telling the caller to send no context.

    When the cap is tight, whole sections are dropped in _bounded's fixed order of decreasing
    bulk, the weight block last because it is small.
    The tracking scope and the grade ladder are never dropped: the first keeps absent data
    readable as a missing field rather than an unrecorded habit, the second keeps the grades the
    meals are recorded in from arriving undefined. Absent data is a legal domain state and still
    rides (empty summaries let the LLM say nothing was tracked); false meal flags, empty addition
    lists and an unset target weight are omitted from the block as the equally legal quiet state."""
    data = {
        "סיכום ימים אחרונים": _summaries(store, questionnaire, sub, day),
        "היום": _day_detail(store, questionnaire, sub, day),
        "אתמול": _day_detail(store, questionnaire, sub, days_before(day, 1)),
        weight.LABEL: weight.measurements_block(store.get_weights(sub),
                                                store.get_target(sub)),
        "תחומי המעקב של האפליקציה": _tracking_scope(questionnaire),
        _GRADE_LADDER: _grade_ladder(questionnaire),
    }
    block = _bounded(data, MAX_CONTEXT_CHARS - len(_HEADER))
    if block is None:
        return None
    return f"{_HEADER}{block}"


def _bounded(data, budget) -> str | None:
    """The data as JSON text at most budget characters long — the room the upstream context cap
    leaves after the labeling header. While the text is too long, one section is removed and the
    rest re-serialized, in fixed order — yesterday's meals, today's, the oldest summary days one
    at a time, then the weight block. None when the text is still too long once only the empty
    summaries, the tracking scope and the grade ladder remain."""
    summaries = data["סיכום ימים אחרונים"]
    sheds = [lambda: data.pop("אתמול"), lambda: data.pop("היום")]
    sheds += [lambda d=date: summaries.pop(d) for date in sorted(summaries)]
    sheds.append(lambda: data.pop(weight.LABEL))
    while True:
        text = json.dumps(data, ensure_ascii=False)
        if len(text) <= budget:
            return text
        if not sheds:
            return None
        sheds.pop(0)()


def _grade_ladder(questionnaire) -> dict:
    """Every grade a carb source can be recorded at, beside the sample foods the config names it
    by — the whole ladder, each rung exemplified rather than defined. Meal entries send a grade by
    its label alone, and the knowledge base defines the ladder only on the page a question has to
    retrieve to reach it, so the ladder rides with every question instead."""
    return {choice.label: choice.examples
            for choice in questionnaire.question("carbs").choices
            if choice.examples is not None}


def _tracking_scope(questionnaire) -> dict:
    """Every field the app can record, in the vocabulary the data block uses, closed by a note
    that the list is exhaustive — so the LLM answers "the app has no such field" instead of
    reading an untracked subject as an unrecorded one."""
    carbs = questionnaire.question("carbs")
    return {
        # Each addition names the amount scale it is recorded on, so a quantified addition in
        # the meals above reads as the one field it is.
        "ברישום ארוחה": [_TIME, _CARB_SOURCE, _SECOND_SOURCE, _PORTION, _VEGETABLES, _FRUIT]
        + [f"{addition.label} ({_AMOUNT})" for addition in carbs.additions],
        "במעקב היומי": [question.day_heading for question in questionnaire.questions],
        "בנוסף": [weight.LABEL],
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
                     questionnaire.amounts(), questionnaire.portions(),
                     questionnaire.second_source(), questionnaire.excluded())
    carbs = questionnaire.question("carbs")
    grade_labels = {choice.id: choice.label for choice in carbs.choices}
    addition_labels = {addition.id: addition.label for addition in carbs.additions}
    portion_labels = {option.id: option.label for option in questionnaire.portions().options}
    amount_labels = {option.id: option.label for option in questionnaire.amounts().options}
    return {carbs.day_heading: derived.carbs,
            "ארוחות": [_meal_entry(meal, grade_labels, addition_labels, portion_labels,
                                   amount_labels)
                       for meal in meals]}


def _quantified_label(labels, key, quantity, quantity_labels) -> str:
    """One recorded thing named with the quantity it was recorded at — a carb grade with its
    helping, an addition with its amount. A thing carrying no quantity names itself alone."""
    if quantity is not None:
        return f"{labels[key]} ({quantity_labels[quantity]})"
    return labels[key]


def _meal_entry(meal, grade_labels, addition_labels, portion_labels, amount_labels) -> dict:
    entry = {_TIME: meal["at"][11:16],
             _CARB_SOURCE: _quantified_label(grade_labels, meal["carbs_choice"],
                                             meal["portion"], portion_labels)}
    second = meal["second_source"]
    if second is not None:
        entry[_SECOND_SOURCE] = _quantified_label(grade_labels, second["carbs_choice"],
                                                  second["portion"], portion_labels)
    if meal["vegetables"]:
        entry[_VEGETABLES] = True
    if meal["fruit"]:
        entry[_FRUIT] = True
    if meal["additions"]:
        entry[_ADDITIONS] = [_quantified_label(addition_labels, addition["id"],
                                               addition["amount"], amount_labels)
                             for addition in meal["additions"]]
    return entry
