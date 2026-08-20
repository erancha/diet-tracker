import boto3
import pytest
from moto import mock_aws

from common.store import Store

ANSWERS = {"drinking": 3, "vegetables": 2, "eating_window": 10.4, "meals": 3, "carbs": 12}


def _table(ddb, name, with_sort_key=True):
    key_schema = [{"AttributeName": "pk", "KeyType": "HASH"}]
    attrs = [{"AttributeName": "pk", "AttributeType": "S"}]
    if with_sort_key:
        key_schema.append({"AttributeName": "sk", "KeyType": "RANGE"})
        attrs.append({"AttributeName": "sk", "AttributeType": "S"})
    ddb.create_table(TableName=name, KeySchema=key_schema, AttributeDefinitions=attrs,
                     BillingMode="PAY_PER_REQUEST")


@pytest.fixture
def store():
    with mock_aws():
        ddb = boto3.resource("dynamodb", region_name="eu-central-1")
        _table(ddb, "days")
        _table(ddb, "meals")
        _table(ddb, "state", with_sort_key=False)
        yield Store("days", "meals", "state", dynamodb=ddb)


def test_day_roundtrip_preserves_numeric_answers_per_user(store):
    store.put_day("u1", "2026-08-19", ANSWERS, 3, "2026-08-19T21:00:00+03:00")
    store.put_day("u2", "2026-08-19", {**ANSWERS, "carbs": 1}, 3, "t")
    days = store.get_days_range("u1", "2026-08-01", "2026-08-19")
    assert days["2026-08-19"] == ANSWERS
    assert type(days["2026-08-19"]["meals"]) is int
    assert days["2026-08-19"]["eating_window"] == 10.4


def test_has_and_delete_day(store):
    assert not store.has_day("u1", "2026-08-19")
    store.put_day("u1", "2026-08-19", ANSWERS, 3, "t")
    assert store.has_day("u1", "2026-08-19")
    store.delete_day("u1", "2026-08-19")
    assert not store.has_day("u1", "2026-08-19")
    with pytest.raises(KeyError):
        store.delete_day("u1", "2026-08-19")


def test_meals_roundtrip_chronological_and_per_day(store):
    later = store.add_meal("u1", "2026-08-20", "2026-08-20T13:30:00+03:00", "grade4", True)
    earlier = store.add_meal("u1", "2026-08-20", "2026-08-20T09:10:00+03:00", "no_carbs", True)
    store.add_meal("u1", "2026-08-19", "2026-08-19T09:00:00+03:00", "grade3", False)
    meals = store.get_meals("u1", "2026-08-20")
    assert [m["id"] for m in meals] == [earlier, later]
    assert meals[0] == {"id": earlier, "at": "2026-08-20T09:10:00+03:00",
                        "carbs_choice": "no_carbs", "vegetables": True}


def test_same_second_meals_get_distinct_ids(store):
    ids = {store.add_meal("u1", "2026-08-20", "2026-08-20T12:00:00+03:00", "grade3", False)
           for _ in range(5)}
    assert len(ids) == 5
    assert len(store.get_meals("u1", "2026-08-20")) == 5


def test_delete_meal(store):
    meal_id = store.add_meal("u1", "2026-08-20", "2026-08-20T12:00:00+03:00", "grade3", False)
    store.delete_meal("u1", "2026-08-20", meal_id)
    assert store.get_meals("u1", "2026-08-20") == []
    with pytest.raises(KeyError):
        store.delete_meal("u1", "2026-08-20", meal_id)


def test_nudge_state_roundtrip_with_legal_empty_default(store):
    assert store.get_nudge_state("u1") == {"rules": {}}
    store.put_nudge_state("u1", {"rules": {"heavy_carbs": {"last_alert_for": "2026-08-19"}}})
    assert store.get_nudge_state("u1")["rules"]["heavy_carbs"]["last_alert_for"] == "2026-08-19"
