import json
import logging
from pathlib import Path

import pytest

from common.dates import days_before, today
from handlers import api

CONFIG = str(Path(__file__).parent.parent / "config" / "questionnaire.json")
ANSWERS = {"drinking": 3, "vegetables": 2, "eating_window": 13, "meals": 3, "carbs": 4}


@pytest.fixture
def env(monkeypatch, ddb):
    monkeypatch.setenv("AWS_DEFAULT_REGION", "eu-central-1")
    monkeypatch.setenv("DAYS_TABLE", "days")
    monkeypatch.setenv("MEALS_TABLE", "meals")
    monkeypatch.setenv("STATE_TABLE", "state")
    monkeypatch.setenv("QUESTIONNAIRE_PATH", CONFIG)
    alerts = []
    monkeypatch.setattr(api, "_alert", lambda email, violations: alerts.append((email, violations)))
    return alerts


def request(route, body=None, path_params=None):
    return {
        "routeKey": route,
        "body": json.dumps(body) if body else None,
        "pathParameters": path_params,
        "requestContext": {"authorizer": {"jwt": {"claims": {"sub": "u1", "email": "a@gmail.com"}}}},
    }


def body_of(response):
    return json.loads(response["body"])


def add_meal(carbs_choice="grade3", vegetables=True, fruit=False, at_time="09:10:00"):
    return api.handler(request("POST /meals", {
        "at": f"{today()}T{at_time}+03:00", "carbs_choice": carbs_choice,
        "vegetables": vegetables, "fruit": fruit}), None)


def test_handler_logs_route_and_caller(env, caplog):
    with caplog.at_level(logging.INFO):
        api.handler(request("GET /days"), None)
    assert "GET /days" in caplog.text
    assert "u1" in caplog.text


def test_submit_stores_numeric_answers_and_reports_no_violations(env):
    response = api.handler(request("POST /days", {"answers": ANSWERS}), None)
    assert response["statusCode"] == 200
    payload = body_of(response)
    assert payload["date"] == today() and payload["violations"] == []
    history = body_of(api.handler(request("GET /days"), None))
    assert history["days"][0] == {"date": today(), "answers": ANSWERS}


def test_submit_alerts_when_numeric_streak_reaches_threshold(env):
    from common.store import Store
    store = Store("days", "meals", "state")
    for offset in (2, 1):
        store.put_day("u1", days_before(today(), offset), ANSWERS, 3, "t")
    payload = body_of(api.handler(request("POST /days", {"answers": ANSWERS}), None))
    assert [v["rule_id"] for v in payload["violations"]] == ["long_eating_window"]
    assert env[0][0] == "a@gmail.com"


def test_submit_rejects_non_numeric_answers(env):
    response = api.handler(request("POST /days", {"answers": {**ANSWERS, "carbs": "grade3"}}), None)
    assert response["statusCode"] == 400
    assert "number" in body_of(response)["error"]


def test_submit_below_meal_floor_is_rejected_naming_the_field(env):
    add_meal("grade7_heavy")
    add_meal("grade7_heavy", at_time="13:00:00")
    response = api.handler(request("POST /days", {"answers": {**ANSWERS, "carbs": 4}}), None)
    assert response["statusCode"] == 400
    assert "carbs" in body_of(response)["error"]


def test_submit_at_exactly_the_floor_is_accepted(env):
    add_meal("grade7_heavy")
    add_meal("grade7_heavy", vegetables=False, at_time="19:34:00")
    answers = {"drinking": 3, "vegetables": 1, "eating_window": 10.5, "meals": 2, "carbs": 16}
    response = api.handler(request("POST /days", {"answers": answers}), None)
    assert response["statusCode"] == 200


def test_get_days_returns_today_and_yesterday_payloads(env):
    add_meal()
    payload = body_of(api.handler(request("GET /days"), None))
    assert payload["today"]["date"] == today()
    assert [m["carbs_choice"] for m in payload["today"]["meals"]] == ["grade3"]
    assert payload["today"]["derived"] == {"carbs": 3, "meals": 1, "vegetables": 1, "eating_window": 0}
    assert payload["yesterday"]["date"] == days_before(today(), 1)
    assert payload["yesterday"]["meals"] == []


def test_get_days_omits_yesterday_payload_once_submitted(env):
    from common.store import Store
    Store("days", "meals", "state").put_day("u1", days_before(today(), 1), ANSWERS, 3, "t")
    payload = body_of(api.handler(request("GET /days"), None))
    assert payload["yesterday"] is None


def test_delete_day_and_backfill_window_rejection(env):
    api.handler(request("POST /days", {"answers": ANSWERS}), None)
    ok = api.handler(request("DELETE /days/{date}", path_params={"date": today()}), None)
    assert ok["statusCode"] == 200
    missing = api.handler(request("DELETE /days/{date}", path_params={"date": today()}), None)
    assert missing["statusCode"] == 404
    old = api.handler(request("DELETE /days/{date}",
                              path_params={"date": days_before(today(), 5)}), None)
    assert old["statusCode"] == 400


def test_add_meal_records_and_returns_recomputed_day(env):
    payload = body_of(add_meal("no_carbs"))
    assert payload["derived"] == {"carbs": 0, "meals": 1, "vegetables": 1, "eating_window": 0}
    payload = body_of(add_meal("grade7_heavy", vegetables=False, at_time="13:30:00"))
    assert payload["derived"]["carbs"] == 8
    assert payload["derived"]["eating_window"] == 4.5


def test_add_meal_rejects_a_naive_timestamp(env):
    response = api.handler(request("POST /meals", {
        "at": f"{today()}T09:00:00", "carbs_choice": "grade3", "vegetables": False}), None)
    assert response["statusCode"] == 400


def test_add_meal_rejects_an_unparseable_timestamp(env):
    response = api.handler(request("POST /meals", {
        "at": f"{today()}Tnot-a-time", "carbs_choice": "grade3", "vegetables": False}), None)
    assert response["statusCode"] == 400


def test_add_meal_rejects_other_dates_unknown_choices_and_submitted_days(env):
    stale = api.handler(request("POST /meals", {
        "at": f"{days_before(today(), 1)}T09:00:00+03:00",
        "carbs_choice": "grade3", "vegetables": False}), None)
    assert stale["statusCode"] == 400
    unknown = api.handler(request("POST /meals", {
        "at": f"{today()}T09:00:00+03:00", "carbs_choice": "off_reset", "vegetables": False}), None)
    assert unknown["statusCode"] == 400
    api.handler(request("POST /days", {"answers": ANSWERS}), None)
    closed = add_meal()
    assert closed["statusCode"] == 409


def test_get_day_returns_any_past_days_meals_and_derived(env):
    from common.store import Store
    old = days_before(today(), 30)
    Store("days", "meals", "state").add_meal("u1", old, f"{old}T09:10:00+03:00", "grade3", True, False)
    payload = body_of(api.handler(request("GET /days/{date}", path_params={"date": old}), None))
    assert payload["date"] == old
    assert [m["carbs_choice"] for m in payload["meals"]] == ["grade3"]
    assert payload["derived"] == {"carbs": 3, "meals": 1, "vegetables": 1, "eating_window": 0}


def test_get_day_rejects_a_malformed_date(env):
    response = api.handler(request("GET /days/{date}", path_params={"date": "not-a-date"}), None)
    assert response["statusCode"] == 400


def test_delete_meal_updates_day_and_guards_dates(env):
    meal_id = body_of(add_meal())["meals"][0]["id"]
    payload = body_of(api.handler(request("DELETE /meals/{date}/{id}",
                                          path_params={"date": today(), "id": meal_id}), None))
    assert payload["meals"] == [] and payload["derived"]["meals"] == 0
    missing = api.handler(request("DELETE /meals/{date}/{id}",
                                  path_params={"date": today(), "id": meal_id}), None)
    assert missing["statusCode"] == 404
    stale = api.handler(request("DELETE /meals/{date}/{id}",
                                path_params={"date": days_before(today(), 1), "id": meal_id}), None)
    assert stale["statusCode"] == 400
