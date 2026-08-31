import time

import pytest

from common import quota


@pytest.fixture
def quota_table(ddb):
    ddb.create_table(TableName="chat_quota",
                     KeySchema=[{"AttributeName": "pk", "KeyType": "HASH"}],
                     AttributeDefinitions=[{"AttributeName": "pk", "AttributeType": "S"}],
                     BillingMode="PAY_PER_REQUEST")
    return ddb.Table("chat_quota")


def test_first_message_of_a_day_counts_one(quota_table):
    assert quota.consume(quota_table, "u1", "2026-08-31") == 1


def test_messages_accumulate_within_the_same_day(quota_table):
    quota.consume(quota_table, "u1", "2026-08-31")
    quota.consume(quota_table, "u1", "2026-08-31")
    assert quota.consume(quota_table, "u1", "2026-08-31") == 3


def test_users_and_days_count_independently(quota_table):
    quota.consume(quota_table, "u1", "2026-08-31")
    assert quota.consume(quota_table, "u2", "2026-08-31") == 1
    assert quota.consume(quota_table, "u1", "2026-09-01") == 1


def test_every_write_stamps_a_future_expiry_for_the_table_ttl(quota_table):
    quota.consume(quota_table, "u1", "2026-08-31")
    item = quota_table.get_item(Key={"pk": "u1#2026-08-31"})["Item"]
    assert int(item["expires_at"]) > time.time()
