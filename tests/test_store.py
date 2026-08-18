import boto3
import pytest
from moto import mock_aws

from common.store import Store


@pytest.fixture
def store():
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
        yield Store("diet", dynamodb=ddb)


ANSWERS = {
    "drinking": "l3", "vegetables": "meals2", "eating_window": "h10",
    "meals": "m3", "carbs": "grade3",
}


def test_put_and_range_query_are_per_user(store):
    store.put_answers("u1", "2026-08-17", ANSWERS, 1, "2026-08-17T20:00:00+03:00")
    store.put_answers("u1", "2026-08-18", ANSWERS, 1, "2026-08-18T20:00:00+03:00")
    store.put_answers("u2", "2026-08-18", ANSWERS, 1, "2026-08-18T20:00:00+03:00")
    assert set(store.get_answers_range("u1", "2026-08-01", "2026-08-18")) == {"2026-08-17", "2026-08-18"}
    assert store.get_answers_range("u1", "2026-08-01", "2026-08-18")["2026-08-18"] == ANSWERS
    assert set(store.get_answers_range("u2", "2026-08-01", "2026-08-18")) == {"2026-08-18"}


def test_put_and_get_roundtrips_a_multi_select_list_value(store):
    answers = {**ANSWERS, "carbs": ["grade3", "grade1_2"]}
    store.put_answers("u1", "2026-08-18", answers, 2, "2026-08-18T20:00:00+03:00")
    assert store.get_answers_range("u1", "2026-08-01", "2026-08-18")["2026-08-18"]["carbs"] == ["grade3", "grade1_2"]


def test_has_answers(store):
    assert not store.has_answers("u1", "2026-08-18")
    store.put_answers("u1", "2026-08-18", ANSWERS, 1, "2026-08-18T20:00:00+03:00")
    assert store.has_answers("u1", "2026-08-18")


def test_nudge_state_roundtrip_and_default(store):
    assert store.get_nudge_state("u1") == {"rules": {}}
    state = {"rules": {"long_eating_window": {"last_alert_for": "2026-08-18"}}}
    store.put_nudge_state("u1", state)
    assert store.get_nudge_state("u1") == state


def test_state_item_excluded_from_answer_range(store):
    store.put_nudge_state("u1", {"rules": {}})
    store.put_answers("u1", "2026-08-18", ANSWERS, 1, "2026-08-18T20:00:00+03:00")
    assert set(store.get_answers_range("u1", "0000-01-01", "9999-12-31")) == {"2026-08-18"}
