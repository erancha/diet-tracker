import json

import pytest
from conftest import APP_CONFIG, meal

from common import appconfig, chat_context
from common.dates import days_before
from common.store import Store

TODAY = "2026-09-01"
YESTERDAY = "2026-08-31"


@pytest.fixture
def store(ddb):
    return Store("days", "meals", "state", "weights", dynamodb=ddb)


@pytest.fixture
def questionnaire():
    return appconfig.load(APP_CONFIG).questionnaire


def data_of(context):
    """The JSON payload of a context block, asserting the labeling header leads it."""
    header, separator, payload = context.partition("(JSON):\n")
    assert separator, "context carries no data block"
    return json.loads(payload)


def test_recent_day_summaries_ride_in_the_context(store, questionnaire):
    answers = {"drinking": 3, "vegetables": 2, "fat": 2, "eating_window": 10, "meals": 3, "carbs": 12}
    store.put_day("u1", "2026-08-26", answers, 12, "2026-08-26T22:00:00+03:00")
    store.put_day("u1", "2026-08-25", answers, 12, "2026-08-25T22:00:00+03:00")

    context = chat_context.user_context(store, questionnaire, "u1", TODAY)

    summaries = data_of(context)["סיכום ימים אחרונים"]
    assert "2026-08-26" in summaries
    assert "2026-08-25" not in summaries
    day = summaries["2026-08-26"]
    assert day['שכפ"צ - שתיה (ליטר)'] == 3
    assert day["ציון יומי"] == 12


def test_today_and_yesterday_meals_are_detailed_with_hebrew_labels(store, questionnaire):
    store.add_meal("u1", TODAY, meal(f"{TODAY}T12:30:00+03:00", choice="carb_grade_2",
                                     additions=[{"id": "sweet", "amount": "little"}],
                                     vegetables=True, fat_servings=2))
    store.add_meal("u1", YESTERDAY, meal(
        f"{YESTERDAY}T09:00:00+03:00", choice="carb_grade_4", portion="small",
        second_source={"carbs_choice": "carb_grade_7", "portion": "medium"}))

    data = data_of(chat_context.user_context(store, questionnaire, "u1", TODAY))

    today_detail = data["היום"]
    assert today_detail["ציון יומי"] == 3.5  # grade 2 + a small sweet, 3 at 50%
    (entry,) = today_detail["ארוחות"]
    assert entry["שעת הארוחה"] == "12:30"
    assert entry["מקור פחמימה"] == "דרגה 2"
    assert entry["תוספות"] == ["מתוק (מעט)"]
    assert entry["ירקות"] is True
    assert entry["מנות שומן"] == 2
    assert "פרי" not in entry

    yesterday_detail = data["אתמול"]
    # grade 4 at the small helping + grade 7 at the medium helping: 2.4 + 5.6
    assert yesterday_detail["ציון יומי"] == 8
    (entry,) = yesterday_detail["ארוחות"]
    assert entry["מקור פחמימה"] == "דרגה 4 (מנה קטנה)"
    assert entry["מקור פחמימה נוסף"] == "דרגה 7 (מנה בינונית)"
    assert "מנות שומן" not in entry


def test_a_tight_cap_sheds_meal_detail_before_day_summaries(store, questionnaire, monkeypatch):
    answers = {"drinking": 3, "vegetables": 2, "fat": 2, "eating_window": 10, "meals": 3, "carbs": 12}
    store.put_day("u1", "2026-08-28", answers, 12, "2026-08-28T22:00:00+03:00")
    for i in range(30):
        store.add_meal("u1", TODAY, meal(f"{TODAY}T{10 + i // 6:02}:{i % 6}0:00+03:00",
                                         additions=[{"id": "sweet", "amount": "little"}],
                                     vegetables=True))
    monkeypatch.setattr(chat_context, "MAX_CONTEXT_CHARS", 1300)

    context = chat_context.user_context(store, questionnaire, "u1", TODAY)

    assert len(context) <= 1300
    data = data_of(context)
    assert "2026-08-28" in data["סיכום ימים אחרונים"]
    assert "היום" not in data


def test_a_cap_too_small_for_even_the_remnant_yields_no_context(store, questionnaire, monkeypatch):
    monkeypatch.setattr(chat_context, "MAX_CONTEXT_CHARS", 50)

    assert chat_context.user_context(store, questionnaire, "u1", TODAY) is None


def test_the_tracking_scope_of_the_app_rides_in_the_context(store, questionnaire):
    scope = data_of(chat_context.user_context(
        store, questionnaire, "u1", TODAY))["תחומי המעקב של האפליקציה"]

    assert 'שכפ"צ - שתיה (ליטר)' in scope["במעקב היומי"]
    assert "מתוק (כמות)" in scope["ברישום ארוחה"]
    assert "מנות שומן" in scope["ברישום ארוחה"]
    assert "מנות שומן" in scope["במעקב היומי"]
    assert "מקור פחמימה" in scope["ברישום ארוחה"]
    assert "שעת הארוחה" in scope["ברישום ארוחה"]
    assert "משקל" in scope["בנוסף"]
    assert scope["הערה"] == ("אלה כל שדות ההזנה באפליקציה, והיא עוקבת רק אחריהם בכוונה תחילה. "
                             "נושא שאינו ברשימה — כמו חלבון או קלוריות — אינו במעקב האפליקציה "
                             "מעצם תכנונה, לא כמסקנה מהנתונים; היעדרו מהנתונים אינו מעיד "
                             "שהמשתמש לא צרך אותו.")


def test_a_tight_cap_keeps_the_tracking_scope_and_grade_examples(store, questionnaire, monkeypatch):
    for i in range(30):
        store.add_meal("u1", TODAY, meal(f"{TODAY}T{10 + i // 6:02}:{i % 6}0:00+03:00",
                                         additions=[{"id": "sweet", "amount": "little"}],
                                     vegetables=True))
    monkeypatch.setattr(chat_context, "MAX_CONTEXT_CHARS", 1200)

    data = data_of(chat_context.user_context(store, questionnaire, "u1", TODAY))

    assert "היום" not in data
    assert "משקל" in data
    assert "תחומי המעקב של האפליקציה" in data
    assert chat_context._GRADE_LADDER in data


def test_a_user_with_no_data_still_sends_the_empty_state(store, questionnaire):
    data = data_of(chat_context.user_context(store, questionnaire, "u1", TODAY))

    assert data["סיכום ימים אחרונים"] == {}
    assert data["היום"]["ארוחות"] == []
    assert data["היום"]["ציון יומי"] == 0
    assert data["משקל"] == {"מדידות": {}}


def test_last_weights_and_target_ride_dated_without_clock_times(store, questionnaire):
    days = ["2026-07-29", "2026-08-05", "2026-08-12", "2026-08-19", "2026-08-26", "2026-08-30"]
    for i, day in enumerate(days):
        store.put_weight("u1", day, 85 - i * 0.5, "07:30")
    store.put_target("u1", 78)

    weight = data_of(chat_context.user_context(store, questionnaire, "u1", TODAY))["משקל"]

    assert weight["מדידות"] == {"2026-08-05": 84.5, "2026-08-12": 84, "2026-08-19": 83.5,
                                "2026-08-26": 83, "2026-08-30": 82.5}
    assert weight["יעד"] == 78


def test_an_unset_target_is_omitted_from_the_weight_block(store, questionnaire):
    store.put_weight("u1", "2026-08-30", 82.5, "07:30")

    weight = data_of(chat_context.user_context(store, questionnaire, "u1", TODAY))["משקל"]

    assert weight == {"מדידות": {"2026-08-30": 82.5}}


def test_the_whole_grade_ladder_rides_in_the_context(store, questionnaire):
    ladder = data_of(chat_context.user_context(
        store, questionnaire, "u1", TODAY))[chat_context._GRADE_LADDER]

    assert ladder["דרגה 2"] == "קינואה | כוסמת | שיבולת שועל עבה | ארטישוק ירושלמי"
    assert set(ladder) == {choice.label for choice in questionnaire.question("carbs").choices}


# The recap's two weeks: the week ending Friday 2026-09-18 (the treat day) and the one before.
WEEK_END = "2026-09-18"
WEEK_START = "2026-09-12"
SATURDAY, SUNDAY, MONDAY = "2026-09-12", "2026-09-13", "2026-09-14"
LAST_SUNDAY = "2026-09-06"
THREE_WEEKS_BACK = "2026-08-30"
HEAVY = {"drinking": 3, "vegetables": 2, "fat": 2, "eating_window": 10, "meals": 3, "carbs": 15}
QUIET = {"drinking": 3, "vegetables": 2, "fat": 2, "eating_window": 10, "meals": 3, "carbs": 5}
BRIEF = "הנחיות לתשובה: לענות בקצרה."


def week_data(questionnaire, days, excluded=None, weights=None, target=None):
    context = chat_context.week_context(questionnaire, days, excluded or {}, WEEK_END, "FRI",
                                        weights or {}, target, BRIEF)
    return data_of(context)


def test_the_week_context_carries_the_week_and_the_one_before_it_newest_first(questionnaire):
    weeks = week_data(questionnaire, {SATURDAY: QUIET, LAST_SUNDAY: QUIET,
                                      THREE_WEEKS_BACK: QUIET})["שבועות"]

    # A day older than last week is out of view, the way the table never compares with it.
    assert [(week["מ"], week["עד"]) for week in weeks] == [
        ("2026-09-12", "2026-09-18"), ("2026-09-05", "2026-09-11")]
    assert [week["ימים שנסגרו"] for week in weeks] == [1, 1]
    assert list(weeks[0]["יום-יום"]) == [SATURDAY]
    assert list(weeks[1]["יום-יום"]) == [LAST_SUNDAY]


def test_a_day_names_its_weekday_its_answers_and_what_it_cost_in_flours_and_sugars(questionnaire):
    days = week_data(questionnaire, {SATURDAY: QUIET, WEEK_END: HEAVY},
                     excluded={SATURDAY: 4, WEEK_END: 9})["שבועות"][0]["יום-יום"]

    assert days[SATURDAY]["יום"] == "שבת"
    assert "יום פינוק" not in days[SATURDAY]
    assert days[SATURDAY]['שכפ"צ - שתיה (ליטר)'] == 3
    assert days[SATURDAY]["ציון יומי"] == 5
    assert days[SATURDAY]["קמחים וסוכרים (נקודות)"] == 4
    assert days[WEEK_END]["יום"] == "שישי"
    assert days[WEEK_END]["יום פינוק"] is True


def test_a_closed_day_without_meals_cost_nothing(questionnaire):
    days = week_data(questionnaire, {SATURDAY: QUIET})["שבועות"][0]["יום-יום"]
    assert days[SATURDAY]["קמחים וסוכרים (נקודות)"] == 0


def test_the_days_a_week_left_unclosed_are_listed(questionnaire):
    week = week_data(questionnaire, {SATURDAY: QUIET, MONDAY: QUIET})["שבועות"][0]
    assert week["ימים שלא נסגרו"] == ["2026-09-13", "2026-09-15", "2026-09-16", "2026-09-17",
                                      "2026-09-18"]


def test_every_week_tallies_its_crossed_bounds_by_subject(questionnaire):
    weeks = week_data(questionnaire, {SATURDAY: HEAVY, SUNDAY: HEAVY,
                                      MONDAY: {**QUIET, "drinking": 1},
                                      LAST_SUNDAY: HEAVY})["שבועות"]

    assert weeks[0]["ימים עם חריגה"] == {"שתיה (ליטרים)": 1, "ציון יומי": 2}
    assert weeks[1]["ימים עם חריגה"] == {"ציון יומי": 1}


def test_clean_days_are_the_closed_days_off_the_treat_day_that_cost_nothing(questionnaire):
    week = week_data(questionnaire, {SATURDAY: QUIET, SUNDAY: QUIET, WEEK_END: QUIET},
                     excluded={SUNDAY: 3, WEEK_END: 12})["שבועות"][0]

    # Saturday cost nothing; Sunday did; the Friday is the treat day and is neither clean nor not.
    assert week["ימים נקיים מקמחים וסוכרים (מלבד יום פינוק)"] == 1


def test_the_week_context_carries_the_weights_and_the_tracking_scope_but_no_meal_ladder(
        questionnaire):
    data = week_data(questionnaire, {SATURDAY: QUIET},
                     weights={"2026-09-18": {"kg": 82.5, "at": "07:30"}}, target=78)

    assert data["משקל"] == {"מדידות": {"2026-09-18": 82.5}, "יעד": 78}
    assert "במעקב היומי" in data["תחומי המעקב של האפליקציה"]
    assert chat_context._GRADE_LADDER not in data
    assert "היום" not in data


def test_the_week_context_opens_with_the_brief_and_then_the_labeled_data(questionnaire):
    context = chat_context.week_context(questionnaire, {}, {}, WEEK_END, "FRI", {}, None, BRIEF)
    assert context.startswith(f"{BRIEF}\n\nנתוני המעקב של השואל (JSON):\n")


def test_a_tight_cap_sheds_last_weeks_days_before_this_weeks(questionnaire, monkeypatch):
    days = {}
    for back in range(14):
        days[days_before(WEEK_END, back)] = HEAVY
    full = len(chat_context.week_context(questionnaire, days, {}, WEEK_END, "FRI", {}, None,
                                         BRIEF))
    monkeypatch.setattr(chat_context, "MAX_CONTEXT_CHARS", full - 1)

    context = chat_context.week_context(questionnaire, days, {}, WEEK_END, "FRI", {}, None, BRIEF)
    weeks = data_of(context)["שבועות"]

    # The brief counts against the cap like the data it precedes.
    assert len(context) <= full - 1

    assert "יום-יום" in weeks[0]
    assert "יום-יום" not in weeks[1]
    assert len(weeks) == 2


def test_a_cap_too_small_for_even_the_tallies_yields_no_context(questionnaire, monkeypatch):
    monkeypatch.setattr(chat_context, "MAX_CONTEXT_CHARS", 50)
    assert chat_context.week_context(questionnaire, {}, {}, WEEK_END, "FRI", {}, None,
                                     BRIEF) is None
