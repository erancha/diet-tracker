import pytest

from common import undelivered


@pytest.fixture
def table(ddb):
    return ddb.Table("undelivered")


def test_a_recorded_message_reads_back_whole(table):
    at = undelivered.record(table, "u1", "נושא", "גוף ההודעה")
    assert undelivered.messages(table, "u1") == [
        {"at": at, "subject": "נושא", "body": "גוף ההודעה"}]


def test_messages_read_newest_first(table):
    first = undelivered.record(table, "u1", "ראשון", "א")
    second = undelivered.record(table, "u1", "שני", "ב")
    assert [m["subject"] for m in undelivered.messages(table, "u1")] == ["שני", "ראשון"]
    assert [m["at"] for m in undelivered.messages(table, "u1")] == [second, first]


def test_a_users_messages_are_their_own(table):
    undelivered.record(table, "u1", "שלהם", "א")
    assert undelivered.messages(table, "u2") == []


def test_dismissing_removes_only_the_named_message(table):
    kept = undelivered.record(table, "u1", "נשאר", "א")
    dropped = undelivered.record(table, "u1", "נסגר", "ב")
    undelivered.dismiss(table, "u1", dropped)
    assert [m["at"] for m in undelivered.messages(table, "u1")] == [kept]


def test_dismissing_an_unknown_timestamp_raises(table):
    with pytest.raises(KeyError):
        undelivered.dismiss(table, "u1", "2026-09-07T10:00:00+00:00")


def test_a_timestamp_belonging_to_another_user_is_not_dismissable(table):
    at = undelivered.record(table, "u1", "נושא", "גוף")
    with pytest.raises(KeyError):
        undelivered.dismiss(table, "u2", at)
    assert [m["at"] for m in undelivered.messages(table, "u1")] == [at]
