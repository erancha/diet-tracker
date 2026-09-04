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
            "additions": [], "small_portion": False, "second_source": None}
    return {**base, **overrides}


def data_of(composed, question):
    """The JSON block of a composed upstream question, asserting the question rides first."""
    assert composed.startswith(question)
    prefix, header, payload = composed.partition("(JSON):\n")
    assert header, "composed question carries no data block"
    return json.loads(payload)


def test_recent_day_summaries_ride_with_the_question(store, questionnaire):
    answers = {"drinking": 3, "vegetables": 2, "eating_window": 10, "meals": 3, "carbs": 12}
    store.put_day("u1", "2026-08-26", answers, 12, "2026-08-26T22:00:00+03:00")
    store.put_day("u1", "2026-08-25", answers, 12, "2026-08-25T22:00:00+03:00")

    composed = chat_context.with_user_context("שאלה", store, questionnaire, "u1", TODAY)

    summaries = data_of(composed, "שאלה")["סיכום ימים אחרונים"]
    assert "2026-08-26" in summaries
    assert "2026-08-25" not in summaries
    day = summaries["2026-08-26"]
    assert day['שכפ"צ - שתיה (ליטר)'] == 3
    assert day["פחמימות / קמחים / סוכרים (סיכום ציון)"] == 12


def test_today_and_yesterday_meals_are_detailed_with_hebrew_labels(store, questionnaire):
    store.add_meal("u1", TODAY, meal(f"{TODAY}T12:30:00+03:00", choice="carb_grade_2",
                                     additions=["sweet"], vegetables=True))
    store.add_meal("u1", YESTERDAY, meal(
        f"{YESTERDAY}T09:00:00+03:00", choice="carb_grade_4", small_portion=True,
        second_source={"carbs_choice": "carb_grade_7", "small_portion": False}))

    composed = chat_context.with_user_context("שאלה", store, questionnaire, "u1", TODAY)
    data = data_of(composed, "שאלה")

    today_detail = data["היום"]
    assert today_detail["ציון פחמימות"] == 6  # grade 2 + sweet addition 4
    (entry,) = today_detail["ארוחות"]
    assert entry["שעה"] == "12:30"
    assert entry["מקור פחמימה"] == "דרגה 2"
    assert entry["תוספות"] == ["כולל מתוק"]
    assert entry["ירקות"] is True
    assert "פרי" not in entry

    yesterday_detail = data["אתמול"]
    assert yesterday_detail["ציון פחמימות"] == 9  # grade 4 halved + grade 7
    (entry,) = yesterday_detail["ארוחות"]
    assert entry["מקור פחמימה"] == "דרגה 4 (כמות קטנה)"
    assert entry["מקור פחמימה נוסף"] == "דרגה 7"


def test_a_tight_budget_sheds_meal_detail_before_day_summaries(store, questionnaire):
    answers = {"drinking": 3, "vegetables": 2, "eating_window": 10, "meals": 3, "carbs": 12}
    store.put_day("u1", "2026-08-28", answers, 12, "2026-08-28T22:00:00+03:00")
    for i in range(30):
        store.add_meal("u1", TODAY, meal(f"{TODAY}T{10 + i // 6:02}:{i % 6}0:00+03:00",
                                         additions=["sweet"], vegetables=True))
    question = "ש" * 3000

    composed = chat_context.with_user_context(question, store, questionnaire, "u1", TODAY)

    assert len(composed) <= chat_context.MAX_QUESTION_CHARS
    data = data_of(composed, question)
    assert "2026-08-28" in data["סיכום ימים אחרונים"]
    assert "היום" not in data


def test_the_composed_question_never_exceeds_the_upstream_cap(store, questionnaire):
    store.add_meal("u1", TODAY, meal(f"{TODAY}T12:30:00+03:00"))
    question = "ש" * 3990

    composed = chat_context.with_user_context(question, store, questionnaire, "u1", TODAY)

    assert composed == question


def test_the_tracking_scope_of_the_app_rides_with_the_question(store, questionnaire):
    composed = chat_context.with_user_context("שאלה", store, questionnaire, "u1", TODAY)

    scope = data_of(composed, "שאלה")["תחומי המעקב של האפליקציה"]
    assert 'שכפ"צ - שתיה (ליטר)' in scope["במעקב היומי"]
    assert "כולל מתוק" in scope["ברישום ארוחה"]
    assert "מקור פחמימה" in scope["ברישום ארוחה"]
    assert "משקל" in scope["בנוסף"]
    assert scope["הערה"] == ("אלה כל שדות ההזנה באפליקציה. נושא שאינו ברשימה אין לו שדה "
                             "באפליקציה, ולכן היעדרו מהנתונים אינו מעיד שהמשתמש לא צרך אותו.")


def test_a_tight_budget_keeps_the_tracking_scope(store, questionnaire):
    for i in range(30):
        store.add_meal("u1", TODAY, meal(f"{TODAY}T{10 + i // 6:02}:{i % 6}0:00+03:00",
                                         additions=["sweet"], vegetables=True))
    question = "ש" * 3000

    composed = chat_context.with_user_context(question, store, questionnaire, "u1", TODAY)

    data = data_of(composed, question)
    assert "היום" not in data
    assert "תחומי המעקב של האפליקציה" in data


def test_a_user_with_no_data_still_sends_the_empty_state(store, questionnaire):
    composed = chat_context.with_user_context("שאלה", store, questionnaire, "u1", TODAY)

    data = data_of(composed, "שאלה")
    assert data["סיכום ימים אחרונים"] == {}
    assert data["היום"]["ארוחות"] == []
    assert data["היום"]["ציון פחמימות"] == 0
