import json
import logging
from decimal import Decimal

import boto3
import pytest
from conftest import APP_CONFIG

from common.dates import days_before, today
from handlers import api

ANSWERS = {"drinking": 3, "vegetables": 2, "eating_window": 13, "meals": 3, "carbs": 4}

# Weigh-in stamp the API is pinned to below, so the payload assertions do not straddle the
# minute boundary a real clock would cross mid-test.
WEIGH_IN_AT = "07:42"


@pytest.fixture
def env(monkeypatch, ddb):
    monkeypatch.setenv("AWS_DEFAULT_REGION", "eu-central-1")
    monkeypatch.setenv("DAYS_TABLE", "days")
    monkeypatch.setenv("MEALS_TABLE", "meals")
    monkeypatch.setenv("STATE_TABLE", "state")
    monkeypatch.setenv("WEIGHTS_TABLE", "weights")
    monkeypatch.setenv("APP_CONFIG_PATH", str(APP_CONFIG))
    monkeypatch.setattr(api, "clock_time", lambda: WEIGH_IN_AT)


def request(route, body=None, path_params=None):
    return {
        "routeKey": route,
        "body": json.dumps(body) if body else None,
        "pathParameters": path_params,
        "requestContext": {"authorizer": {"jwt": {"claims": {"sub": "u1", "email": "a@gmail.com"}}}},
    }


def body_of(response):
    return json.loads(response["body"])


def meal_body(carbs_choice, vegetables, fruit, additions, at_time, small_portion, second_source):
    """The body both recording and correcting a meal take, so the two helpers cannot drift."""
    return {"at": f"{today()}T{at_time}+03:00", "carbs_choice": carbs_choice,
            "vegetables": vegetables, "fruit": fruit, "additions": list(additions),
            "small_portion": small_portion, "second_source": second_source}


def add_meal(carbs_choice="carb_grade_3", vegetables=True, fruit=False, additions=(),
             at_time="09:10:00", small_portion=False, second_source=None):
    return api.handler(request("POST /meals", meal_body(
        carbs_choice, vegetables, fruit, additions, at_time, small_portion, second_source)), None)


def update_meal(meal_id, carbs_choice="carb_grade_3", vegetables=True, fruit=False, additions=(),
                small_portion=False,
                at_time="09:10:00", date=None, second_source=None):
    return api.handler(request("PUT /meals/{date}/{id}", meal_body(
        carbs_choice, vegetables, fruit, additions, at_time, small_portion, second_source),
        path_params={"date": date or today(), "id": meal_id}), None)


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


def test_submit_reports_violations_but_leaves_alerting_to_the_nightly_job(env):
    from common.store import Store
    store = Store("days", "meals", "state", "weights")
    for offset in (2, 1):
        store.put_day("u1", days_before(today(), offset), ANSWERS, 3, "t")
    payload = body_of(api.handler(request("POST /days", {"answers": ANSWERS}), None))
    # The reply shows the violations for the UI; the day stays unmarked as alerted, so the
    # nightly rules job raises the single daily outbound alert.
    assert [v["rule_id"] for v in payload["violations"]] == ["long_eating_window"]
    assert store.get_nudge_state("u1")["rules"] == {}


def test_submit_rejects_non_numeric_answers(env):
    response = api.handler(request("POST /days", {"answers": {**ANSWERS, "carbs": "carb_grade_3"}}), None)
    assert response["statusCode"] == 400
    assert "number" in body_of(response)["error"]


def test_submit_below_meal_floor_is_rejected_naming_the_field(env):
    add_meal("carb_grade_7")
    add_meal("carb_grade_7", at_time="13:00:00")
    response = api.handler(request("POST /days", {"answers": {**ANSWERS, "carbs": 4}}), None)
    assert response["statusCode"] == 400
    assert "carbs" in body_of(response)["error"]


def test_submit_at_exactly_the_floor_is_accepted(env):
    add_meal("carb_grade_7")
    add_meal("carb_grade_7", vegetables=False, at_time="19:34:00")
    answers = {"drinking": 3, "vegetables": 1, "eating_window": 10.5, "meals": 2, "carbs": 16}
    response = api.handler(request("POST /days", {"answers": answers}), None)
    assert response["statusCode"] == 200


def test_get_days_returns_today_and_yesterday_payloads(env):
    add_meal()
    payload = body_of(api.handler(request("GET /days"), None))
    assert payload["today"]["date"] == today()
    assert [m["carbs_choice"] for m in payload["today"]["meals"]] == ["carb_grade_3"]
    assert payload["today"]["derived"] == {"carbs": 3, "meals": 1, "vegetables": 1, "eating_window": 0}
    assert payload["yesterday"]["date"] == days_before(today(), 1)
    assert payload["yesterday"]["meals"] == []


def test_get_days_keeps_yesterday_floors_once_submitted(env):
    from common.store import Store
    store = Store("days", "meals", "state", "weights")
    yesterday = days_before(today(), 1)
    store.add_meal("u1", yesterday, meal_body("carb_grade_3", True, False, [], "09:10:00", False,
                                              None) | {"at": f"{yesterday}T09:10:00+03:00"})
    store.put_day("u1", yesterday, ANSWERS, 3, "t")
    payload = body_of(api.handler(request("GET /days"), None))
    assert payload["yesterday"]["date"] == yesterday
    assert payload["yesterday"]["derived"]["vegetables"] == 1


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
    payload = body_of(add_meal("carb_grade_7", vegetables=False, at_time="13:30:00"))
    assert payload["derived"]["carbs"] == 7
    assert payload["derived"]["eating_window"] == 4.5


def test_meal_additions_add_their_costs_on_top_of_its_grade(env):
    payload = body_of(add_meal("carb_grade_2", additions=["sweet", "alcohol"]))
    assert payload["derived"]["carbs"] == 10


def test_a_second_carb_source_is_priced_beside_the_meals_own_grade(env):
    # A grade 2 plate carrying a slice of white bread: the plate keeps its grade, and the bread
    # costs half of grade 7 as the helping it was.
    payload = body_of(add_meal("carb_grade_2", second_source={
        "carbs_choice": "carb_grade_7", "small_portion": True}))
    assert payload["derived"]["carbs"] == 5.5
    assert payload["meals"][0]["second_source"] == {"carbs_choice": "carb_grade_7",
                                                    "small_portion": True}


def test_correcting_a_meal_can_drop_its_second_carb_source(env):
    meal_id = body_of(add_meal("carb_grade_2", second_source={
        "carbs_choice": "carb_grade_7", "small_portion": False}))["meals"][0]["id"]
    payload = body_of(update_meal(meal_id, "carb_grade_2"))
    assert payload["meals"][0]["second_source"] is None
    assert payload["derived"]["carbs"] == 2


def test_add_meal_rejects_an_unknown_second_carb_source(env):
    response = add_meal("carb_grade_2", second_source={"carbs_choice": "nope",
                                                       "small_portion": False})
    assert response["statusCode"] == 400
    assert "nope" in body_of(response)["error"]


def test_add_meal_rejects_the_no_carb_grade_as_a_second_source(env):
    # Drawing on no carb source is what carrying no second source says, so the grade that names it
    # would be a second way of saying the same thing.
    response = add_meal("carb_grade_2", second_source={"carbs_choice": "no_carbs",
                                                       "small_portion": False})
    assert response["statusCode"] == 400
    assert "no_carbs" in body_of(response)["error"]


def test_add_meal_rejects_a_second_source_that_is_not_a_grade_and_a_helping(env):
    missing = add_meal("carb_grade_2", second_source={"carbs_choice": "carb_grade_7"})
    assert missing["statusCode"] == 400
    stray = add_meal("carb_grade_2", second_source={"carbs_choice": "carb_grade_7",
                                                    "small_portion": False, "fruit": True})
    assert stray["statusCode"] == 400
    unstructured = add_meal("carb_grade_2", second_source="carb_grade_7")
    assert unstructured["statusCode"] == 400
    flag = add_meal("carb_grade_2", second_source={"carbs_choice": "carb_grade_7",
                                                   "small_portion": "yes"})
    assert flag["statusCode"] == 400


def test_add_meal_rejects_an_unknown_addition(env):
    response = add_meal("carb_grade_2", additions=["nope"])
    assert response["statusCode"] == 400
    assert "nope" in body_of(response)["error"]


def test_add_meal_rejects_non_list_additions(env):
    response = api.handler(request("POST /meals", {
        "at": f"{today()}T09:00:00+03:00", "carbs_choice": "carb_grade_3",
        "vegetables": False, "fruit": False, "additions": "sweet", "small_portion": False}), None)
    assert response["statusCode"] == 400
    assert "additions" in body_of(response)["error"]


def test_add_meal_rejects_a_naive_timestamp(env):
    response = api.handler(request("POST /meals", {
        "at": f"{today()}T09:00:00", "carbs_choice": "carb_grade_3", "vegetables": False}), None)
    assert response["statusCode"] == 400


def test_add_meal_rejects_an_unparseable_timestamp(env):
    response = api.handler(request("POST /meals", {
        "at": f"{today()}Tnot-a-time", "carbs_choice": "carb_grade_3", "vegetables": False}), None)
    assert response["statusCode"] == 400


def test_add_meal_rejects_other_dates_unknown_choices_and_submitted_days(env):
    stale = api.handler(request("POST /meals", {
        "at": f"{days_before(today(), 1)}T09:00:00+03:00",
        "carbs_choice": "carb_grade_3", "vegetables": False}), None)
    assert stale["statusCode"] == 400
    unknown = api.handler(request("POST /meals", {
        "at": f"{today()}T09:00:00+03:00", "carbs_choice": "off_reset", "vegetables": False}), None)
    assert unknown["statusCode"] == 400
    api.handler(request("POST /days", {"answers": ANSWERS}), None)
    closed = add_meal()
    assert closed["statusCode"] == 409


def test_update_meal_rewrites_every_recorded_field_and_recomputes_the_day(env):
    meal_id = body_of(add_meal("carb_grade_3"))["meals"][0]["id"]
    payload = body_of(update_meal(meal_id, "no_carbs", vegetables=False, fruit=True,
                                  additions=["sweet"], at_time="13:30:00"))
    assert len(payload["meals"]) == 1
    meal = payload["meals"][0]
    assert meal["at"] == f"{today()}T13:30:00+03:00"
    assert (meal["carbs_choice"], meal["vegetables"], meal["fruit"], meal["additions"]) \
        == ("no_carbs", False, True, ["sweet"])
    assert payload["derived"]["vegetables"] == 0


def test_update_meal_rejects_an_unknown_choice_and_a_naive_timestamp(env):
    meal_id = body_of(add_meal())["meals"][0]["id"]
    unknown = update_meal(meal_id, carbs_choice="off_reset")
    assert unknown["statusCode"] == 400
    naive = api.handler(request("PUT /meals/{date}/{id}",
                                {"at": f"{today()}T09:00:00", "carbs_choice": "carb_grade_3",
                                 "vegetables": False, "fruit": False, "additions": [],
                                 "small_portion": False},
                                path_params={"date": today(), "id": meal_id}), None)
    assert naive["statusCode"] == 400


def test_update_meal_guards_missing_meals_other_dates_and_submitted_days(env):
    meal_id = body_of(add_meal())["meals"][0]["id"]
    missing = update_meal("09:10:00-abcdef")
    assert missing["statusCode"] == 404
    stale = update_meal(meal_id, date=days_before(today(), 1))
    assert stale["statusCode"] == 400
    api.handler(request("POST /days", {"answers": ANSWERS}), None)
    closed = update_meal(meal_id)
    assert closed["statusCode"] == 409


def test_get_day_returns_any_past_days_meals_and_derived(env):
    from common.store import Store
    old = days_before(today(), 30)
    Store("days", "meals", "state", "weights").add_meal("u1", old, meal_body(
        "carb_grade_3", True, False, [], "09:10:00", False, None) | {"at": f"{old}T09:10:00+03:00"})
    payload = body_of(api.handler(request("GET /days/{date}", path_params={"date": old}), None))
    assert payload["date"] == old
    assert [m["carbs_choice"] for m in payload["meals"]] == ["carb_grade_3"]
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


def get_weight():
    return body_of(api.handler(request("GET /weight"), None))


def record_weight(kg):
    return api.handler(request("PUT /weight", {"kg": kg}), None)


def set_target(kg):
    return api.handler(request("PUT /weight/target", {"kg": kg}), None)


def test_weight_starts_empty_with_no_target(env):
    assert get_weight() == {"target": None, "entries": []}


def test_recording_a_weight_returns_the_whole_payload(env):
    payload = body_of(record_weight(76.5))
    assert payload == {"target": None,
                       "entries": [{"date": today(), "kg": 76.5, "at": WEIGH_IN_AT}]}


def test_re_recording_today_corrects_the_value_rather_than_adding_a_point(env):
    record_weight(765)
    payload = body_of(record_weight(76.5))
    assert payload["entries"] == [{"date": today(), "kg": 76.5, "at": WEIGH_IN_AT}]


def test_the_target_rides_in_every_weight_payload(env):
    assert body_of(set_target(72))["target"] == 72
    assert body_of(record_weight(76.5))["target"] == 72
    assert get_weight()["target"] == 72


def test_entries_come_back_oldest_first(env):
    from common.store import Store
    store = Store("days", "meals", "state", "weights")
    for day_offset, kg in ((14, 78), (7, 77), (0, 76)):
        store.put_weight("u1", days_before(today(), day_offset), kg, "07:30")
    assert [e["date"] for e in get_weight()["entries"]] == [
        days_before(today(), 14), days_before(today(), 7), today()]


def test_a_recorded_weight_carries_the_clock_time_it_was_taken_at(env):
    """The weigh-in time is stamped from the server clock rather than taken from the body: the
    weighing and the recording are the same moment, and the time is what makes the weekly rhythm
    readable. test_dates covers the stamp's own format."""
    entry = body_of(record_weight(76.5))["entries"][-1]
    assert entry["date"] == today()
    assert entry["at"] == WEIGH_IN_AT


def test_a_weight_stored_before_times_were_kept_reads_with_none(env):
    from common.store import Store
    old = days_before(today(), 30)
    boto3.resource("dynamodb").Table("weights").put_item(
        Item={"pk": "u1", "sk": old, "kg": Decimal("80")})
    assert body_of(record_weight(76.5))["entries"][0] == {"date": old, "kg": 80, "at": None}


def test_weight_bodies_outside_the_plausible_range_are_rejected(env):
    for kg in (7.65, 765, "76", True, None):
        assert record_weight(kg)["statusCode"] == 400
        assert set_target(kg)["statusCode"] == 400
    assert get_weight() == {"target": None, "entries": []}


def test_deleting_a_weight_works_at_any_date_unlike_a_day_or_a_meal(env):
    from common.store import Store
    old = days_before(today(), 200)
    Store("days", "meals", "state", "weights").put_weight("u1", old, 80, "07:30")
    payload = body_of(api.handler(request("DELETE /weight/{date}", path_params={"date": old}), None))
    assert payload["entries"] == []


def test_deleting_a_date_holding_no_weight_is_a_404(env):
    response = api.handler(request("DELETE /weight/{date}", path_params={"date": today()}), None)
    assert response["statusCode"] == 404


def test_deleting_a_malformed_date_is_a_400(env):
    response = api.handler(request("DELETE /weight/{date}", path_params={"date": "not-a-date"}), None)
    assert response["statusCode"] == 400


def test_weights_are_scoped_to_the_authenticated_user(env):
    record_weight(76.5)
    set_target(72)
    other = {**request("GET /weight"), "requestContext":
             {"authorizer": {"jwt": {"claims": {"sub": "u2", "email": "b@gmail.com"}}}}}
    assert body_of(api.handler(other, None)) == {"target": None, "entries": []}


def test_notifications_route_mutes_and_unmutes_the_account(env):
    assert body_of(api.handler(request("PUT /notifications", {"muted": True}), None)) == {"muted": True}
    assert body_of(api.handler(request("GET /days"), None))["muted"] is True
    assert body_of(api.handler(request("PUT /notifications", {"muted": False}), None)) == {"muted": False}
    assert body_of(api.handler(request("GET /days"), None))["muted"] is False


def test_notifications_route_rejects_a_non_boolean(env):
    response = api.handler(request("PUT /notifications", {"muted": "yes"}), None)
    assert response["statusCode"] == 400


