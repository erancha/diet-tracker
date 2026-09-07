import json

import pytest
from conftest import APP_CONFIG

from common import appconfig, chat_context
from common.store import Store

TODAY = "2026-09-01"
YESTERDAY = "2026-08-31"


@pytest.fixture
def store(ddb):
    return Store("days", "meals", "state", "weights", dynamodb=ddb)


@pytest.fixture
def questionnaire():
    return appconfig.load(APP_CONFIG).questionnaire


def meal(at, choice="carb_grade_2", **overrides):
    base = {"at": at, "carbs_choice": choice, "vegetables": False, "fruit": False,
            "additions": [], "portion": None, "second_source": None}
    return {**base, **overrides}


def data_of(context):
    """The JSON payload of a context block, asserting the labeling header leads it."""
    header, separator, payload = context.partition("(JSON):\n")
    assert separator, "context carries no data block"
    return json.loads(payload)


def test_recent_day_summaries_ride_in_the_context(store, questionnaire):
    answers = {"drinking": 3, "vegetables": 2, "eating_window": 10, "meals": 3, "carbs": 12}
    store.put_day("u1", "2026-08-26", answers, 12, "2026-08-26T22:00:00+03:00")
    store.put_day("u1", "2026-08-25", answers, 12, "2026-08-25T22:00:00+03:00")

    context = chat_context.user_context(store, questionnaire, "u1", TODAY)

    summaries = data_of(context)["סיכום ימים אחרונים"]
    assert "2026-08-26" in summaries
    assert "2026-08-25" not in summaries
    day = summaries["2026-08-26"]
    assert day['שכפ"צ - שתיה (ליטר)'] == 3
    assert day["פחמימות / קמחים / סוכרים (סיכום ציון)"] == 12


def test_today_and_yesterday_meals_are_detailed_with_hebrew_labels(store, questionnaire):
    store.add_meal("u1", TODAY, meal(f"{TODAY}T12:30:00+03:00", choice="carb_grade_2",
                                     additions=[{"id": "sweet", "amount": "little"}],
                                     vegetables=True))
    store.add_meal("u1", YESTERDAY, meal(
        f"{YESTERDAY}T09:00:00+03:00", choice="carb_grade_4", portion="small",
        second_source={"carbs_choice": "carb_grade_7", "portion": "medium"}))

    data = data_of(chat_context.user_context(store, questionnaire, "u1", TODAY))

    today_detail = data["היום"]
    assert today_detail["ציון פחמימות"] == 3.5  # grade 2 + a small sweet, 3 at 50%
    (entry,) = today_detail["ארוחות"]
    assert entry["שעה"] == "12:30"
    assert entry["מקור פחמימה"] == "דרגה 2"
    assert entry["תוספות"] == ["כולל מתוק (מעט)"]
    assert entry["ירקות"] is True
    assert "פרי" not in entry

    yesterday_detail = data["אתמול"]
    # grade 4 at the small helping + grade 7 at the medium helping: 2.4 + 5.6
    assert yesterday_detail["ציון פחמימות"] == 8
    (entry,) = yesterday_detail["ארוחות"]
    assert entry["מקור פחמימה"] == "דרגה 4 (מנה קטנה)"
    assert entry["מקור פחמימה נוסף"] == "דרגה 7 (מנה בינונית)"


def test_a_tight_cap_sheds_meal_detail_before_day_summaries(store, questionnaire, monkeypatch):
    answers = {"drinking": 3, "vegetables": 2, "eating_window": 10, "meals": 3, "carbs": 12}
    store.put_day("u1", "2026-08-28", answers, 12, "2026-08-28T22:00:00+03:00")
    for i in range(30):
        store.add_meal("u1", TODAY, meal(f"{TODAY}T{10 + i // 6:02}:{i % 6}0:00+03:00",
                                         additions=[{"id": "sweet", "amount": "little"}],
                                     vegetables=True))
    monkeypatch.setattr(chat_context, "MAX_CONTEXT_CHARS", 1200)

    context = chat_context.user_context(store, questionnaire, "u1", TODAY)

    assert len(context) <= 1200
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
    assert "כולל מתוק (כמות)" in scope["ברישום ארוחה"]
    assert "מקור פחמימה" in scope["ברישום ארוחה"]
    assert "משקל" in scope["בנוסף"]
    assert scope["הערה"] == ("אלה כל שדות ההזנה באפליקציה. נושא שאינו ברשימה אין לו שדה "
                             "באפליקציה, ולכן היעדרו מהנתונים אינו מעיד שהמשתמש לא צרך אותו.")


def test_a_tight_cap_keeps_the_tracking_scope(store, questionnaire, monkeypatch):
    for i in range(30):
        store.add_meal("u1", TODAY, meal(f"{TODAY}T{10 + i // 6:02}:{i % 6}0:00+03:00",
                                         additions=[{"id": "sweet", "amount": "little"}],
                                     vegetables=True))
    monkeypatch.setattr(chat_context, "MAX_CONTEXT_CHARS", 1200)

    data = data_of(chat_context.user_context(store, questionnaire, "u1", TODAY))

    assert "היום" not in data
    assert "משקל" in data
    assert "תחומי המעקב של האפליקציה" in data


def test_a_user_with_no_data_still_sends_the_empty_state(store, questionnaire):
    data = data_of(chat_context.user_context(store, questionnaire, "u1", TODAY))

    assert data["סיכום ימים אחרונים"] == {}
    assert data["היום"]["ארוחות"] == []
    assert data["היום"]["ציון פחמימות"] == 0
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
