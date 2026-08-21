import dataclasses
import logging
from pathlib import Path

import boto3
import pytest
from moto import mock_aws

from common.dates import days_before, today
from common.questionnaire import load
from common.store import Store
from common.users import User
from handlers import nudge

CONFIG = Path(__file__).parent.parent / "config" / "questionnaire.json"
VIOLATING = {"drinking": 3, "vegetables": 2, "eating_window": 13, "meals": 3, "carbs": 3}
CLEAN = {"drinking": 3, "vegetables": 2, "eating_window": 10, "meals": 3, "carbs": 3}


def _table(ddb, name, with_sort_key=True):
    key_schema = [{"AttributeName": "pk", "KeyType": "HASH"}]
    attrs = [{"AttributeName": "pk", "AttributeType": "S"}]
    if with_sort_key:
        key_schema.append({"AttributeName": "sk", "KeyType": "RANGE"})
        attrs.append({"AttributeName": "sk", "AttributeType": "S"})
    ddb.create_table(TableName=name, KeySchema=key_schema, AttributeDefinitions=attrs,
                     BillingMode="PAY_PER_REQUEST")


@pytest.fixture
def env(monkeypatch):
    sent = []
    monkeypatch.setattr(nudge.notify, "send_telegram", lambda token, chat, text: sent.append(("tg", chat, text)))
    monkeypatch.setattr(nudge.notify, "send_email", lambda ses, sender, to, subject, body: sent.append(("mail", to, body)))
    with mock_aws():
        ddb = boto3.resource("dynamodb", region_name="eu-central-1")
        _table(ddb, "days")
        _table(ddb, "meals")
        _table(ddb, "state", with_sort_key=False)
        monkeypatch.setenv("AWS_DEFAULT_REGION", "eu-central-1")
        monkeypatch.setenv("DAYS_TABLE", "days")
        monkeypatch.setenv("MEALS_TABLE", "meals")
        monkeypatch.setenv("STATE_TABLE", "state")
        e = nudge.NudgeEnv(
            store=Store("days", "meals", "state"), questionnaire=load(CONFIG),
            users=[User("u1", "a@gmail.com"), User("u2", "b@gmail.com")],
            telegram=("TOKEN", {"a@gmail.com": "111", "b@gmail.com": "222"}),
            ses=None, sender="me@x.com",
        )
        yield e, sent


def test_handler_logs_job_start_and_completion(env, monkeypatch, caplog):
    e, sent = env
    monkeypatch.setattr(nudge, "_build_env", lambda: e)
    with caplog.at_level(logging.INFO):
        nudge.handler({"job": "reminder"}, None)
    assert "job=reminder" in caplog.text
    assert "users=2" in caplog.text
    assert "completed" in caplog.text


def test_reminder_targets_only_users_missing_today(env):
    e, sent = env
    e.store.put_day("u1", today(), CLEAN, 1, "t")
    nudge._reminder(e)
    assert [(kind, target) for kind, target, _ in sent] == [("tg", "222"), ("mail", "b@gmail.com")]


def test_reminder_sends_only_email_when_telegram_disabled(env):
    e, sent = env
    e = dataclasses.replace(e, telegram=None)
    nudge._reminder(e)
    assert [kind for kind, _, _ in sent] == ["mail", "mail"]


def test_rules_job_alerts_on_streak_and_dedups(env):
    e, sent = env
    for offset in (2, 1, 0):
        e.store.put_day("u1", days_before(today(), offset), VIOLATING, 1, "t")
    nudge._rules_job(e)
    assert {target for _, target, _ in sent} == {"111", "a@gmail.com"}
    sent.clear()
    nudge._rules_job(e)
    assert sent == []


def test_rules_job_evaluates_as_of_latest_submitted_day(env):
    e, sent = env
    # Streak completed yesterday; today unsubmitted. The nightly job must still catch it.
    for offset in (3, 2, 1):
        e.store.put_day("u1", days_before(today(), offset), VIOLATING, 1, "t")
    nudge._rules_job(e)
    assert any("חלון אכילה" in text for _, _, text in sent)


def test_weekly_sends_digest_to_every_user(env):
    e, sent = env
    e.store.put_day("u1", today(), CLEAN, 1, "t")
    nudge._weekly(e)
    targets = [target for _, target, _ in sent]
    assert targets == ["111", "a@gmail.com", "222", "b@gmail.com"]
    assert any("סיכום שבועי" in text for _, _, text in sent)
    assert any("ממוצע" in text for _, _, text in sent)
    assert any("לא מולאו שאלונים השבוע" in text for _, _, text in sent)
