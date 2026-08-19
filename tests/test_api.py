import json
from pathlib import Path

import boto3
import pytest
from moto import mock_aws

from common.dates import days_before, today
from handlers import api

CONFIG = str(Path(__file__).parent.parent / "config" / "questionnaire.json")
ANSWERS = {
    "drinking": "l3", "vegetables": "meals2", "eating_window": "over_12",
    "meals": "m3", "carbs": "grade3",
}


@pytest.fixture
def env(monkeypatch):
    with mock_aws():
        ddb = boto3.resource("dynamodb", region_name="eu-central-1")
        ddb.create_table(
            TableName="diet",
            KeySchema=[{"AttributeName": "pk", "KeyType": "HASH"},
                       {"AttributeName": "sk", "KeyType": "RANGE"}],
            AttributeDefinitions=[{"AttributeName": "pk", "AttributeType": "S"},
                                  {"AttributeName": "sk", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )
        monkeypatch.setenv("AWS_DEFAULT_REGION", "eu-central-1")
        monkeypatch.setenv("TABLE_NAME", "diet")
        monkeypatch.setenv("QUESTIONNAIRE_PATH", CONFIG)
        alerts = []
        monkeypatch.setattr(api, "_alert", lambda email, violations: alerts.append((email, violations)))
        yield alerts


def request(route, body=None):
    return {
        "routeKey": route,
        "body": json.dumps(body) if body else None,
        "requestContext": {"authorizer": {"jwt": {"claims": {"sub": "u1", "email": "a@gmail.com"}}}},
    }


def test_submit_stores_and_reports_no_violations(env):
    response = api.handler(request("POST /answers", {"answers": ANSWERS}), None)
    assert response["statusCode"] == 200
    payload = json.loads(response["body"])
    assert payload["date"] == today()
    assert payload["violations"] == []
    assert env == []


def test_submit_alerts_when_streak_reaches_threshold(env):
    from common.store import Store
    store = Store("diet")
    for offset in (2, 1):
        store.put_answers("u1", days_before(today(), offset), ANSWERS, 1, "t")
    response = api.handler(request("POST /answers", {"answers": ANSWERS}), None)
    payload = json.loads(response["body"])
    assert [v["rule_id"] for v in payload["violations"]] == ["long_eating_window"]
    assert env[0][0] == "a@gmail.com"


def test_submit_rejects_invalid_answers_with_400(env):
    response = api.handler(request("POST /answers", {"answers": {"meals": "m3"}}), None)
    assert response["statusCode"] == 400
    assert "missing" in json.loads(response["body"])["error"]


def test_history_returns_days_newest_first(env):
    api.handler(request("POST /answers", {"answers": ANSWERS}), None)
    response = api.handler(request("GET /answers"), None)
    payload = json.loads(response["body"])
    assert payload["days"][0] == {"date": today(), "answers": ANSWERS}


def test_submit_with_explicit_yesterday_date_stores_under_yesterday(env):
    from common.store import Store
    yesterday = days_before(today(), 1)
    response = api.handler(request("POST /answers", {"answers": ANSWERS, "date": yesterday}), None)
    assert response["statusCode"] == 200
    payload = json.loads(response["body"])
    assert payload["date"] == yesterday
    store = Store("diet")
    assert store.has_answers("u1", yesterday)
    assert not store.has_answers("u1", today())


def test_backfilling_yesterday_completes_streak_ending_yesterday(env):
    from common.store import Store
    store = Store("diet")
    day = today()
    for offset in (3, 2):
        store.put_answers("u1", days_before(day, offset), ANSWERS, 1, "t")
    yesterday = days_before(day, 1)
    response = api.handler(request("POST /answers", {"answers": ANSWERS, "date": yesterday}), None)
    payload = json.loads(response["body"])
    assert payload["date"] == yesterday
    assert [v["rule_id"] for v in payload["violations"]] == ["long_eating_window"]
    assert env[0][0] == "a@gmail.com"


def test_submit_rejects_date_two_days_ago_with_400(env):
    two_days_ago = days_before(today(), 2)
    response = api.handler(request("POST /answers", {"answers": ANSWERS, "date": two_days_ago}), None)
    assert response["statusCode"] == 400


def test_submit_rejects_malformed_date_with_400(env):
    response = api.handler(request("POST /answers", {"answers": ANSWERS, "date": "not-a-date"}), None)
    assert response["statusCode"] == 400


def test_submit_rejects_future_date_with_400(env):
    tomorrow = days_before(today(), -1)
    response = api.handler(request("POST /answers", {"answers": ANSWERS, "date": tomorrow}), None)
    assert response["statusCode"] == 400


def delete_request(date):
    event = request("DELETE /answers/{date}")
    event["pathParameters"] = {"date": date}
    return event


def test_delete_removes_todays_record(env):
    api.handler(request("POST /answers", {"answers": ANSWERS}), None)
    response = api.handler(delete_request(today()), None)
    assert response["statusCode"] == 200
    assert json.loads(response["body"])["date"] == today()
    history = json.loads(api.handler(request("GET /answers"), None)["body"])
    assert history["days"] == []


def test_delete_removes_yesterdays_record(env):
    from common.store import Store
    yesterday = days_before(today(), 1)
    api.handler(request("POST /answers", {"answers": ANSWERS, "date": yesterday}), None)
    response = api.handler(delete_request(yesterday), None)
    assert response["statusCode"] == 200
    assert not Store("diet").has_answers("u1", yesterday)


def test_delete_rejects_date_before_window_with_400(env):
    response = api.handler(delete_request(days_before(today(), 2)), None)
    assert response["statusCode"] == 400


def test_delete_returns_404_when_no_record_exists(env):
    response = api.handler(delete_request(today()), None)
    assert response["statusCode"] == 404
