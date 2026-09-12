from pathlib import Path

import boto3
import pytest
from moto import mock_aws

from common import chat_history
from common.questionnaire import parse

# The repo's own app config, loaded by the tests that assert on what the app actually ships.
APP_CONFIG = Path(__file__).parent.parent / "config" / "app.json"


class FakeSes:
    """Records send_email calls, verification lookups and address-verification requests; raises
    instead when primed with a failure. verification maps an address to the status SES reports for
    it ("Success", "Pending", ...); an address absent from it is one SES has never heard of.
    verification_lookups holds one entry per lookup, so a caller that caches its answer can be
    told apart from one that asks again."""

    def __init__(self, failure=None):
        self.sent = []
        self.failure = failure
        self.verification = {}
        self.verification_lookups = []
        self.verification_requested = []
        self.verification_failure = None

    def send_email(self, **kwargs):
        if self.failure is not None:
            raise self.failure
        self.sent.append(kwargs)

    def get_identity_verification_attributes(self, Identities):
        if self.verification_failure is not None:
            raise self.verification_failure
        self.verification_lookups.append(list(Identities))
        return {"VerificationAttributes": {
            identity: {"VerificationStatus": self.verification[identity]}
            for identity in Identities if identity in self.verification}}

    def verify_email_identity(self, EmailAddress):
        if self.verification_failure is not None:
            raise self.verification_failure
        self.verification_requested.append(EmailAddress)


def meal(at, choice="carb_grade_2", **overrides):
    """One recorded meal in the shape the API stores, with only what a test cares about named."""
    return {"at": at, "carbs_choice": choice, "vegetables": False, "fruit": False,
            "additions": [], "portion": None, "second_source": None, **overrides}


def user_pool(monkeypatch):
    """A mocked Cognito pool, its id in USER_POOL_ID; returns the client and the id for
    signed_up. Needs the AWS mock the ddb fixture keeps active."""
    cognito = boto3.client("cognito-idp", region_name="eu-central-1")
    pool_id = cognito.create_user_pool(PoolName="p")["UserPool"]["Id"]
    monkeypatch.setenv("USER_POOL_ID", pool_id)
    return cognito, pool_id


def signed_up(cognito, pool_id, email) -> str:
    """Adds one account to the mocked pool and returns its sub."""
    created = cognito.admin_create_user(
        UserPoolId=pool_id, Username=email,
        UserAttributes=[{"Name": "email", "Value": email}])
    return next(a["Value"] for a in created["User"]["Attributes"] if a["Name"] == "sub")


def _table(ddb, name, with_sort_key=True, index=None):
    """Creates one app table under the shared pk/sk key shape; `index` is (name, partition
    attribute) of a secondary index over that attribute and sk, as scripts/template.yaml
    declares."""
    key_schema = [{"AttributeName": "pk", "KeyType": "HASH"}]
    attrs = [{"AttributeName": "pk", "AttributeType": "S"}]
    if with_sort_key:
        key_schema.append({"AttributeName": "sk", "KeyType": "RANGE"})
        attrs.append({"AttributeName": "sk", "AttributeType": "S"})
    table = {"TableName": name, "KeySchema": key_schema, "AttributeDefinitions": attrs,
             "BillingMode": "PAY_PER_REQUEST"}
    if index is not None:
        index_name, partition = index
        attrs.append({"AttributeName": partition, "AttributeType": "S"})
        table["GlobalSecondaryIndexes"] = [{
            "IndexName": index_name,
            "KeySchema": [{"AttributeName": partition, "KeyType": "HASH"},
                          {"AttributeName": "sk", "KeyType": "RANGE"}],
            "Projection": {"ProjectionType": "ALL"}}]
    ddb.create_table(**table)


@pytest.fixture
def ddb():
    """Mocked DynamoDB resource with the app's tables pre-created (days, meals, weights,
    chat_history and undelivered keyed by pk+sk, state by pk only). The AWS mock stays active for
    the whole test, so code under test may also build its own boto3 clients."""
    with mock_aws():
        resource = boto3.resource("dynamodb", region_name="eu-central-1")
        _table(resource, "days")
        _table(resource, "meals")
        _table(resource, "state", with_sort_key=False)
        _table(resource, "weights")
        _table(resource, "chat_history", index=(chat_history.VISIBILITY_INDEX, "visibility"))
        _table(resource, "undelivered")
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
                "excluded_grade": 6, "excluded_additions": [],
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
            {"id": "heavy_day", "question_id": "carbs", "at_least": 8},
            {"id": "low_drinking", "question_id": "drinking", "below": 2.5},
        ],
    }
    return parse(raw)
