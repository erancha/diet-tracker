from pathlib import Path

import boto3
import pytest
from moto import mock_aws

from common.questionnaire import parse

# The repo's own app config, loaded by the tests that assert on what the app actually ships.
APP_CONFIG = Path(__file__).parent.parent / "config" / "app.json"


def _table(ddb, name, with_sort_key=True):
    key_schema = [{"AttributeName": "pk", "KeyType": "HASH"}]
    attrs = [{"AttributeName": "pk", "AttributeType": "S"}]
    if with_sort_key:
        key_schema.append({"AttributeName": "sk", "KeyType": "RANGE"})
        attrs.append({"AttributeName": "sk", "AttributeType": "S"})
    ddb.create_table(TableName=name, KeySchema=key_schema, AttributeDefinitions=attrs,
                     BillingMode="PAY_PER_REQUEST")


@pytest.fixture
def ddb():
    """Mocked DynamoDB resource with the app's tables pre-created (days, meals, weights, and
    chat_history keyed by pk+sk, state by pk only). The AWS mock stays active for the whole test,
    so code under test may also build its own boto3 clients."""
    with mock_aws():
        resource = boto3.resource("dynamodb", region_name="eu-central-1")
        _table(resource, "days")
        _table(resource, "meals")
        _table(resource, "state", with_sort_key=False)
        _table(resource, "weights")
        _table(resource, "chat_history")
        yield resource


@pytest.fixture
def numeric_questionnaire():
    """A minimal two-question numeric questionnaire, independent of the repo config, with
    one at_least rule and one below rule so both comparators stay under test."""
    raw = {
        "version": 1,
        "questions": [
            {
                "id": "carbs", "type": "points", "text": "carbs", "max": 30, "heavy_meal": 4,
                "choices": [
                    {"id": "no_carbs", "label": "no carbs", "value": 0},
                    {"id": "grade3", "label": "grade3", "value": 3},
                    {"id": "grade7_heavy", "label": "heavy", "value": 8},
                ],
            },
            {
                "id": "drinking", "type": "single", "text": "drinking",
                "choices": [
                    {"id": "l2", "label": "2 liters", "value": 2},
                    {"id": "l3", "label": "3 liters", "value": 3},
                ],
            },
        ],
        "rules": [
            {"id": "heavy_day", "question_id": "carbs", "at_least": 8,
             "consecutive_days": 2, "message": "carbs {value} and up {days} days in a row"},
            {"id": "low_drinking", "question_id": "drinking", "below": 2.5,
             "consecutive_days": 2, "message": "low drinking {days} days in a row"},
        ],
    }
    return parse(raw)
