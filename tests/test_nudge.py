import dataclasses
import logging
import pytest

from conftest import APP_CONFIG

from common import appconfig
from common.dates import days_before, today
from common.store import Store
from common.users import User
from handlers import nudge

VIOLATING = {"drinking": 3, "vegetables": 2, "eating_window": 13, "meals": 3, "carbs": 3}
CLEAN = {"drinking": 3, "vegetables": 2, "eating_window": 10, "meals": 3, "carbs": 3}


@pytest.fixture
def env(monkeypatch, ddb):
    sent = []
    monkeypatch.setattr(nudge.notify, "send_telegram", lambda token, chat, text: sent.append(("tg", chat, text)))
    monkeypatch.setattr(nudge.notify, "send_email", lambda ses, sender, to, subject, body: sent.append(("mail", to, body)))
    monkeypatch.setenv("AWS_DEFAULT_REGION", "eu-central-1")
    monkeypatch.setenv("DAYS_TABLE", "days")
    monkeypatch.setenv("MEALS_TABLE", "meals")
    monkeypatch.setenv("STATE_TABLE", "state")
    monkeypatch.setenv("WEIGHTS_TABLE", "weights")
    e = nudge.NudgeEnv(
        store=Store("days", "meals", "state", "weights"),
        questionnaire=appconfig.load(APP_CONFIG).questionnaire,
        users=[User("u1", "a@gmail.com"), User("u2", "b@gmail.com")],
        telegram=("TOKEN", {"a@gmail.com": "111", "b@gmail.com": "222"}),
        ses=None, sender="me@x.com",
    )
    return e, sent


def test_handler_logs_job_start_and_completion(env, monkeypatch, caplog):
    e, sent = env
    monkeypatch.setattr(nudge, "_build_env", lambda: e)
    with caplog.at_level(logging.INFO):
        nudge.handler({"job": "last_call"}, None)
    assert "job=last_call" in caplog.text
    assert "users=2" in caplog.text
    assert "completed" in caplog.text


def test_last_call_targets_only_users_missing_today(env):
    e, sent = env
    e.store.put_day("u1", today(), CLEAN, 1, "t")
    nudge._last_call(e)
    assert [(kind, target) for kind, target, _ in sent] == [("tg", "222"), ("mail", "b@gmail.com")]


def test_last_call_sends_only_email_when_telegram_disabled(env):
    e, sent = env
    e = dataclasses.replace(e, telegram=None)
    nudge._last_call(e)
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


def test_rules_job_sends_the_shared_alert_subject_and_body(env, monkeypatch):
    e, _ = env
    mails = []
    monkeypatch.setattr(nudge.notify, "send_email",
                        lambda ses, sender, to, subject, body: mails.append((subject, body)))
    for offset in (2, 1, 0):
        e.store.put_day("u1", days_before(today(), offset), VIOLATING, 1, "t")

    nudge._rules_job(e)

    subject, body = mails[0]
    assert subject == nudge.notify.ALERT_SUBJECT
    assert body.startswith("התראות תזונה:\n•")


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


def test_weigh_in_targets_only_users_who_have_not_weighed_on_the_day(env):
    e, sent = env
    e.store.put_weight("u1", today(), 77.4, "07:20")
    nudge._weigh_in(e)
    assert [(kind, target) for kind, target, _ in sent] == [("tg", "222"), ("mail", "b@gmail.com")]
    assert sent[0][2] == nudge.weight.REMINDER_TEXT


def test_a_weighing_earlier_in_the_week_no_longer_excuses_the_reminder(env):
    """The job runs on the weigh-in weekday, so weighing on some other day is the drift the
    reminder exists to pull back — it silences nothing."""
    e, sent = env
    e.store.put_weight("u1", days_before(today(), 1), 77.4, "07:30")
    e.store.put_weight("u2", days_before(today(), 6), 90, "21:00")
    nudge._weigh_in(e)
    assert [target for _, target, _ in sent] == ["111", "a@gmail.com", "222", "b@gmail.com"]


def test_the_weigh_in_job_is_dispatchable_by_name(env, monkeypatch):
    e, sent = env
    monkeypatch.setattr(nudge, "_build_env", lambda: e)
    nudge.handler({"job": "weigh_in"}, None)
    assert len(sent) == 4


def record_meal(store, sub, day, at_time="09:10:00"):
    store.add_meal(sub, day, {"at": f"{day}T{at_time}+03:00", "carbs_choice": "carb_grade_3",
                             "vegetables": True, "fruit": False, "additions": [],
                             "small_portion": False, "second_source": None})


def test_last_call_tells_a_user_who_recorded_meals_that_the_day_is_still_open(env):
    e, sent = env
    record_meal(e.store, "u1", today())
    e.store.put_day("u2", today(), CLEAN, 1, "t")
    nudge._last_call(e)
    assert [(target, text) for _, target, text in sent] == [
        ("111", nudge.OPEN_DAY_TEXT), ("a@gmail.com", nudge.OPEN_DAY_TEXT)]


def test_last_call_keeps_the_plain_fill_reminder_for_a_day_with_nothing_recorded(env):
    e, sent = env
    e.store.put_day("u2", today(), CLEAN, 1, "t")
    nudge._last_call(e)
    assert [text for _, _, text in sent] == [nudge.REMINDER_TEXT, nudge.REMINDER_TEXT]


def test_last_call_leaves_a_submitted_day_alone(env):
    e, sent = env
    record_meal(e.store, "u1", today())
    e.store.put_day("u1", today(), CLEAN, 1, "t")
    e.store.put_day("u2", today(), CLEAN, 1, "t")
    nudge._last_call(e)
    assert sent == []


def test_the_last_call_job_is_dispatchable_by_name(env, monkeypatch):
    e, sent = env
    monkeypatch.setattr(nudge, "_build_env", lambda: e)
    e.store.put_day("u2", today(), CLEAN, 1, "t")
    nudge.handler({"job": "last_call"}, None)
    assert [target for _, target, _ in sent] == ["111", "a@gmail.com"]


def test_muted_users_are_dropped_from_every_jobs_audience(env):
    e, _ = env
    e.store.set_muted("u1", True)
    assert nudge._notifiable(e.store, e.users) == [User("u2", "b@gmail.com")]
