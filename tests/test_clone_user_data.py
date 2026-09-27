"""Exercises scripts/clone_user_data.py against moto tables and pools standing in for a production
and a dev stack."""

import sys
from pathlib import Path

import boto3
import pytest
from moto import mock_aws

sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))
import clone_user_data as clone  # noqa: E402
from common import users  # noqa: E402
from common.store import Store  # noqa: E402

EMAIL = "owner@gmail.com"


def make_stack(prefix):
    dynamodb = boto3.resource("dynamodb", region_name="eu-central-1")
    tables = {}
    for logical in clone.ROW_TABLES + (clone.STATE_TABLE,):
        keys = [("pk", "HASH")] + ([] if logical == clone.STATE_TABLE else [("sk", "RANGE")])
        tables[logical] = dynamodb.create_table(
            TableName=f"{prefix}-{logical}", BillingMode="PAY_PER_REQUEST",
            KeySchema=[{"AttributeName": n, "KeyType": t} for n, t in keys],
            AttributeDefinitions=[{"AttributeName": n, "AttributeType": "S"} for n, _ in keys])
    cognito = boto3.client("cognito-idp", region_name="eu-central-1")
    pool_id = cognito.create_user_pool(PoolName=prefix)["UserPool"]["Id"]
    store = Store(*(f"{prefix}-{t}" for t in
                    ("DaysTable", "MealsTable", clone.STATE_TABLE, "WeightsTable")),
                  dynamodb=dynamodb)
    return clone.Stack(tables=tables, store=store, pool_id=pool_id, cognito=cognito)


def add_account(stack, email):
    created = stack.cognito.admin_create_user(
        UserPoolId=stack.pool_id, Username=email.split("@")[0],
        UserAttributes=[{"Name": "email", "Value": email}])
    return clone._sub(created["User"]["Attributes"])


def seed(stack, sub):
    t = stack.tables
    t["DaysTable"].put_item(Item={"pk": sub, "sk": "2026-09-20", "answers": {"carbs": 3}})
    t["MealsTable"].put_item(Item={"pk": sub, "sk": "2026-09-20#09:00:00-abc", "carbs": "g1"})
    t["WeightsTable"].put_item(Item={"pk": sub, "sk": "target", "kg": 70})
    t["ChatHistoryTable"].put_item(Item={"pk": sub, "sk": "2026-09-20T08:00:00Z",
                                         "question": "q", "visibility": "public"})
    t["UndeliveredTable"].put_item(Item={"pk": sub, "sk": "2026-09-20T09:00:00Z", "body": "b"})
    stack.store.put_nudge_state(sub, {"muted": False, "verified": "Success"})


def held(stack, sub):
    return {logical: sorted((i["sk"], i.get("visibility")) for i in clone.rows(table, sub))
            for logical, table in stack.tables.items() if logical != clone.STATE_TABLE}


@pytest.fixture
def stacks():
    with mock_aws():
        yield make_stack("prod"), make_stack("dev")


def test_mirror_makes_the_dev_account_hold_exactly_the_production_rows(stacks):
    prod, dev = stacks
    prod_sub, dev_sub = add_account(prod, EMAIL), add_account(dev, EMAIL)
    seed(prod, prod_sub)
    dev.tables["DaysTable"].put_item(Item={"pk": dev_sub, "sk": "2026-01-01", "answers": {}})
    clone.mirror(prod, dev, EMAIL)
    assert held(dev, dev_sub) == held(prod, prod_sub)
    assert dev.store.get_nudge_state(dev_sub) == {"muted": False, "verified": "Success"}


def test_fictive_accounts_carry_the_rows_with_shares_kept_and_notifications_muted(stacks):
    _, dev = stacks
    seed(dev, add_account(dev, EMAIL))
    clone.fictive(dev, EMAIL, 3)
    subs = {u.email: u.sub for u in users.list_users(dev.cognito, dev.pool_id)}
    for n in (1, 2, 3):
        sub = subs[clone.fictive_email(n)]
        copy = held(dev, sub)
        assert copy["ChatHistoryTable"] == [("2026-09-20T08:00:00Z", "public")]
        assert copy["UndeliveredTable"] == []
        assert len(copy["MealsTable"]) == 1
        assert dev.store.get_nudge_state(sub) == {"muted": True}


def test_rerunning_fictive_replaces_rather_than_duplicates(stacks):
    _, dev = stacks
    seed(dev, add_account(dev, EMAIL))
    clone.fictive(dev, EMAIL, 2)
    clone.fictive(dev, EMAIL, 2)
    assert len(users.list_users(dev.cognito, dev.pool_id)) == 3


def test_delete_removes_fictive_accounts_and_rows_but_not_the_owner(stacks):
    _, dev = stacks
    owner = add_account(dev, EMAIL)
    seed(dev, owner)
    clone.fictive(dev, EMAIL, 2)
    fictive_subs = [u.sub for u in users.list_users(dev.cognito, dev.pool_id)
                    if u.sub != owner]
    clone.delete_fictive(dev)
    assert [u.sub for u in users.list_users(dev.cognito, dev.pool_id)] == [owner]
    for sub in fictive_subs:
        assert all(rows == [] for rows in held(dev, sub).values())
        assert "Item" not in dev.tables[clone.STATE_TABLE].get_item(Key={"pk": sub})
    assert held(dev, owner)["MealsTable"]


def test_the_target_stack_must_be_named(monkeypatch):
    monkeypatch.setattr(sys, "argv", ["clone", "fictive", EMAIL])
    with pytest.raises(SystemExit):
        clone.main()
