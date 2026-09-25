"""Renders the asking user's tracked data as a standalone context block, sent beside a chat
question so the external answering service can ground answers in the asker's own numbers. The
service embeds only the question for retrieval; this block reaches the answering LLM alone, so
its bulk cannot drown the question's vocabulary in the similarity search.

Two blocks are built here, both keyed and labeled in the questionnaire's Hebrew vocabulary so
the answering LLM reads domain terms rather than internal ids, and both bounded to the upstream
cap by shedding whole sections in a fixed order of decreasing bulk:

- The recent-data block behind a question typed in the app: the last week's submitted day
  summaries, today's and yesterday's meals with their derived scores, and the latest weight
  measurements beside the target weight.
- The week block behind the weekly recap's follow-up: the recap's week and the one before it day
  by day, and the weights — what a reading of the week's direction needs, in place of the meals
  of two days it does not.

Both name the app's full tracking scope, so the answering LLM can tell a subject the app has no
field for from one the user left unrecorded; the recent-data block also carries the whole carb
grade ladder, so a grade in a meal entry reads as food rather than a bare rung."""

import json

from common import rules, weight
from common.appconfig import WEEKDAY_NAMES, WEEKDAYS
from common.chat import MAX_CONTEXT_CHARS
from common.dates import days_before, weekday_index
from common.derive import derive

SUMMARY_DAYS = 7

# How many weeks the weekly recap's block reaches back, the recap's own week included: the week
# and the one its table compares it with.
RECAP_WEEKS = 2

_HEADER = "נתוני המעקב של השואל (JSON):\n"

# Meal-entry field names, shared between the per-meal entries and the tracking-scope statement
# so the scope always names the exact vocabulary the data uses.
_TIME = "שעת הארוחה"
_CARB_SOURCE = "מקור פחמימה"
_SECOND_SOURCE = "מקור פחמימה נוסף"
_PORTION = "גודל המנה"
_VEGETABLES = "ירקות"
_FRUIT = "פרי"
_FAT_SERVINGS = "מנות שומן"
_ADDITIONS = "תוספות"
_AMOUNT = "כמות"

_GRADE_LADDER = "דרגות מקור הפחמימה (דוגמאות מזון)"
_SCOPE = "תחומי המעקב של האפליקציה"

# The week block's own vocabulary: a week's bounds, its counts, and the days it lists.
_WEEKS = "שבועות"
_FROM = "מ"
_TO = "עד"
_CLOSED = "ימים שנסגרו"
_UNCLOSED = "ימים שלא נסגרו"
_CLEAN = "ימים נקיים מקמחים וסוכרים (מלבד יום פינוק)"
_CROSSED = "ימים עם חריגה"
_DAY_BY_DAY = "יום-יום"
_WEEKDAY = "יום"
_TREAT_DAY = "יום פינוק"
_EXCLUDED_POINTS = "קמחים וסוכרים (נקודות)"


def user_context(store, questionnaire, sub, day) -> str | None:
    """The user's recent data as a labeled context block, never longer than MAX_CONTEXT_CHARS;
    None when the block is still too long once every droppable section is gone, telling the
    caller to send no context.

    While the block is too long, whole sections are dropped in _bounded's fixed order of
    decreasing bulk, the weight block last because it is small.
    The tracking scope and the grade ladder are never dropped: the first keeps absent data
    readable as a missing field rather than an unrecorded habit, the second keeps the grades the
    meals are recorded in from arriving undefined. Absent data is a legal domain state and still
    rides (empty summaries let the LLM say nothing was tracked); false meal flags, empty addition
    lists and an unset target weight are omitted from the block as the equally legal quiet state."""
    summaries = _summaries(store, questionnaire, sub, day)
    data = {
        "סיכום ימים אחרונים": summaries,
        "היום": _day_detail(store, questionnaire, sub, day),
        "אתמול": _day_detail(store, questionnaire, sub, days_before(day, 1)),
        weight.LABEL: weight.measurements_block(store.get_weights(sub),
                                                store.get_target(sub)),
        _SCOPE: _tracking_scope(questionnaire),
        _GRADE_LADDER: _grade_ladder(questionnaire),
    }
    sheds = [lambda: data.pop("אתמול"), lambda: data.pop("היום")]
    sheds += [lambda d=date: summaries.pop(d) for date in sorted(summaries)]
    sheds.append(lambda: data.pop(weight.LABEL))
    return _labeled(_bounded(data, sheds))


def week_context(questionnaire, days: dict, excluded: dict, week_end: str, treat_weekday: str,
                 weights: dict, target, brief: str) -> str | None:
    """The weeks behind a weekly recap as a labeled context block under `brief`, the recap's
    instructions on how the reading is to be written, never longer than MAX_CONTEXT_CHARS; None
    when even the recap's own tallies will not fit under the brief.

    `days` holds the closed days over the RECAP_WEEKS weeks ending on week_end, and `excluded`
    what each day with meals cost in flours and sugars; a closed day absent from `excluded`
    recorded no meals and cost nothing. Each week carries its bounds, its tallies — closed days,
    clean days off the treat day, days over each bound by subject, and the days left unclosed —
    and every closed day: its weekday, the treat day named as such, the submitted answers and
    the day's cost. Newest week first.

    While the block is too long, last week's day-by-day goes first, then this week's, then the
    weights. The tracking scope stays, for the reason it stays in user_context; the grade ladder
    never rides, since no meal entry does."""
    weeks = [_week(questionnaire, days, excluded, days_before(week_end, 7 * back), treat_weekday)
             for back in range(RECAP_WEEKS)]
    data = {
        _WEEKS: weeks,
        weight.LABEL: weight.measurements_block(weights, target),
        _SCOPE: _tracking_scope(questionnaire),
    }
    sheds = [lambda: weeks[1].pop(_DAY_BY_DAY), lambda: weeks[0].pop(_DAY_BY_DAY),
             lambda: data.pop(weight.LABEL)]
    preamble = f"{brief}\n\n"
    return _labeled(_bounded(data, sheds, len(preamble)), preamble)


def _labeled(block, preamble="") -> str | None:
    """The block under the header that names it as the asker's data, and under `preamble` when
    there is one; None stays None, telling the caller to send no context."""
    if block is None:
        return None
    return f"{preamble}{_HEADER}{block}"


def _bounded(data, sheds, taken=0) -> str | None:
    """The data as JSON text short enough to ride under the header, and `taken` characters of
    preamble, within the upstream context cap. While the text is too long, the next shed in the
    list removes one section and the rest is re-serialized; None when the text is still too long
    once every shed has run."""
    budget = MAX_CONTEXT_CHARS - taken - len(_HEADER)
    while True:
        text = json.dumps(data, ensure_ascii=False)
        if len(text) <= budget:
            return text
        if not sheds:
            return None
        sheds.pop(0)()


def _week(questionnaire, days, excluded, end, treat_weekday) -> dict:
    """One week ending on `end`: its bounds, its tallies, and its closed days one by one."""
    dates = [days_before(end, 6 - offset) for offset in range(7)]
    closed = {date: days[date] for date in dates if date in days}
    week = {
        _FROM: dates[0],
        _TO: end,
        _CLOSED: len(closed),
        _CLEAN: rules.clean_days(closed, excluded, treat_weekday),
        _CROSSED: rules.crossed_days(questionnaire, closed),
        _UNCLOSED: [date for date in dates if date not in days],
    }
    week[_DAY_BY_DAY] = {date: _day_entry(questionnaire, date, answers, excluded, treat_weekday)
                         for date, answers in closed.items()}
    return week


def _day_entry(questionnaire, date, answers, excluded, treat_weekday) -> dict:
    """One closed day: its weekday, the treat day marked as such, the submitted answers under
    their day headings, and what it cost in flours and sugars."""
    entry = {_WEEKDAY: WEEKDAY_NAMES[WEEKDAYS[weekday_index(date)]]}
    if rules.falls_on(date, treat_weekday):
        entry[_TREAT_DAY] = True
    entry.update(_labeled_history(questionnaire, {date: answers})[date])
    entry[_EXCLUDED_POINTS] = rules.spent(excluded, date)
    return entry


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
    that the list is exhaustive by design — so the LLM answers "the app leaves that out on
    purpose" instead of reading an untracked subject as an unrecorded one, or the app's scope as
    something it deduced from the data."""
    carbs = questionnaire.question("carbs")
    return {
        # Each addition names the amount scale it is recorded on, so a quantified addition in
        # the meals above reads as the one field it is.
        "ברישום ארוחה": [_TIME, _CARB_SOURCE, _SECOND_SOURCE, _PORTION, _VEGETABLES, _FRUIT,
                         _FAT_SERVINGS]
        + [f"{addition.label} ({_AMOUNT})" for addition in carbs.additions],
        "במעקב היומי": [question.day_heading for question in questionnaire.questions],
        "בנוסף": [weight.LABEL],
        "הערה": "אלה כל שדות ההזנה באפליקציה, והיא עוקבת רק אחריהם בכוונה תחילה. "
                "נושא שאינו ברשימה — כמו חלבון או קלוריות — אינו במעקב האפליקציה "
                "מעצם תכנונה, לא כמסקנה מהנתונים; היעדרו מהנתונים אינו מעיד "
                "שהמשתמש לא צרך אותו.",
    }


def _labeled_history(questionnaire, history: dict) -> dict:
    """The submitted answers keyed by date, each value under its question's Hebrew day-scope
    heading — the vocabulary the answering LLM reads instead of internal question ids."""
    return {date: {questionnaire.question(question_id).day_heading: value
                   for question_id, value in answers.items()}
            for date, answers in history.items()}


def _summaries(store, questionnaire, sub, day) -> dict:
    """The user's submitted answers over the summary window, in the shared Hebrew-labeled shape."""
    return _labeled_history(
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
    if meal["fat_servings"]:
        entry[_FAT_SERVINGS] = meal["fat_servings"]
    if meal["additions"]:
        entry[_ADDITIONS] = [_quantified_label(addition_labels, addition["id"],
                                               addition["amount"], amount_labels)
                             for addition in meal["additions"]]
    return entry
