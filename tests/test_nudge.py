import dataclasses
import logging
import urllib.error

import boto3
import pytest

from conftest import APP_CONFIG

from common import appconfig, chat_history, undelivered
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
    monkeypatch.setattr(nudge.notify, "send_email",
                        lambda ses, sender, to, subject, body, app_url: sent.append(("mail", to, body)))
    monkeypatch.setattr(nudge.chat, "ask",
                        lambda url, key, question, timeout: {"answer": "תובנה", "sources": []})
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
        # A real (mocked) SES client, not a stub: _send classifies a refusal by the client's own
        # MessageRejected exception class, so the tests must raise the genuine one.
        ses=boto3.client("ses", region_name="eu-central-1"),
        undelivered=ddb.Table("undelivered"),
        chat_history=ddb.Table("chat_history"),
        sender="me@x.com", app_url="https://app.example",
        rag_url="https://rag.example", rag_key="K",
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
                        lambda ses, sender, to, subject, body, app_url: mails.append((subject, body)))
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
    e.store.put_day("u1", days_before(today(), 1), CLEAN, 1, "t")
    nudge._weekly(e)
    targets = [target for _, target, _ in sent]
    assert targets == ["111", "a@gmail.com", "222", "b@gmail.com"]
    assert any("נסגרו 1 מתוך 7 ימים" in text for _, _, text in sent)
    assert any("לא נסגרו ימים השבוע" in text for _, _, text in sent)


def test_weekly_reports_the_week_that_ended_yesterday_not_the_day_it_runs_in(env):
    # The job fires in the small hours of Sunday, past the last chance to close Saturday. Counting
    # its own day would report six closed days out of seven however diligent the user was.
    e, sent = env
    for offset in range(1, 8):
        e.store.put_day("u1", days_before(today(), offset), CLEAN, 1, "t")
    e.store.put_day("u1", days_before(today(), 1), CLEAN, 1, "t")
    nudge._weekly(e)
    body = next(text for _, target, text in sent if target == "a@gmail.com")
    assert "נסגרו 7 מתוך 7 ימים" in body


def test_weekly_appends_the_llm_summary_after_the_numeric_digest(env, monkeypatch):
    e, sent = env
    asked = []

    def fake_ask(url, key, question, timeout):
        asked.append((url, key, question))
        return {"answer": "היה שבוע מאוזן", "sources": []}

    monkeypatch.setattr(nudge.chat, "ask", fake_ask)
    yesterday = days_before(today(), 1)
    e.store.put_day("u1", yesterday, CLEAN, 1, "t")
    nudge._weekly(e)
    expected_question = nudge.digest.weekly_summary_question(e.questionnaire, {yesterday: CLEAN},
                                                             {}, None)
    assert asked == [("https://rag.example", "K", expected_question)]
    body = next(text for _, target, text in sent if target == "a@gmail.com")
    assert body.index("נסגרו") < body.index("היה שבוע מאוזן")


def test_weekly_question_carries_the_asking_user_own_weigh_ins_and_target(env, monkeypatch):
    e, sent = env
    asked = []

    def fake_ask(url, key, question, timeout):
        asked.append(question)
        return {"answer": "א", "sources": []}

    monkeypatch.setattr(nudge.chat, "ask", fake_ask)
    e.store.put_day("u1", days_before(today(), 1), CLEAN, 1, "t")
    e.store.put_day("u2", days_before(today(), 1), CLEAN, 1, "t")
    e.store.put_weight("u1", days_before(today(), 7), 84, "07:20")
    e.store.put_weight("u1", today(), 83.2, "07:20")
    e.store.put_target("u1", 78)
    e.store.put_weight("u2", today(), 61, "07:20")
    nudge._weekly(e)
    assert "83.2" in asked[0] and '"יעד": 78' in asked[0]
    # Each user's recap sees only their own measurements.
    assert "83.2" not in asked[1] and "61" in asked[1]


def test_weekly_stores_the_recap_as_a_chat_titled_for_the_transcript(env, monkeypatch):
    e, sent = env
    monkeypatch.setattr(nudge.chat, "ask",
                        lambda url, key, question, timeout: {
                            "answer": "היה שבוע מאוזן",
                            "sources": [{"fileName": "f", "score": 0.4}]})
    e.store.put_day("u1", days_before(today(), 1), CLEAN, 1, "t")
    nudge._weekly(e)
    stored = chat_history.turns(e.chat_history, "u1")
    # The title names the week the recap covers — the Sunday it opened on — so a transcript of
    # weekly recaps is not a column of identical rows.
    week_start = days_before(today(), 7)
    assert [turn["question"] for turn in stored] == [nudge.digest.recap_chat_title(week_start)]
    assert stored[0]["answer"] == "היה שבוע מאוזן"
    assert stored[0]["sources"] == [{"fileName": "f", "score": 0.4}]
    # The recap is the app's own writing, not a question the user asked.
    assert stored[0]["app"] is True


def test_weekly_stores_no_chat_when_the_llm_call_fails(env, monkeypatch):
    e, sent = env

    def failing_ask(url, key, question, timeout):
        raise urllib.error.URLError("service down")

    monkeypatch.setattr(nudge.chat, "ask", failing_ask)
    e.store.put_day("u1", days_before(today(), 1), CLEAN, 1, "t")
    nudge._weekly(e)
    assert chat_history.turns(e.chat_history, "u1") == []


def test_weekly_skips_the_llm_for_an_empty_week(env, monkeypatch):
    e, sent = env
    monkeypatch.setattr(nudge.chat, "ask", lambda url, key, question, timeout:
                        pytest.fail("asked the LLM with no data"))
    nudge._weekly(e)
    assert all("לא נסגרו ימים השבוע" in text for _, _, text in sent)


def test_weekly_falls_back_to_the_plain_digest_when_the_llm_call_fails(env, monkeypatch, caplog):
    e, sent = env

    def failing_ask(url, key, question, timeout):
        raise urllib.error.URLError("service down")

    monkeypatch.setattr(nudge.chat, "ask", failing_ask)
    e.store.put_day("u1", days_before(today(), 1), CLEAN, 1, "t")
    with caplog.at_level(logging.WARNING):
        nudge._weekly(e)
    body = next(text for _, target, text in sent if target == "a@gmail.com")
    assert "נסגרו 1 מתוך 7 ימים" in body
    assert "weekly summary" in caplog.text


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
                             "portion": None, "second_source": None})


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


def _message_rejected(ses):
    """The error SES raises when it refuses a send outright — what an address the sending account
    may not write to earns while the account sits in the sandbox."""
    return ses.exceptions.MessageRejected(
        {"Error": {"Code": "MessageRejected", "Message": "Email address is not verified"}},
        "SendEmail")


def test_a_failing_address_does_not_starve_the_rest_of_the_pool(env, monkeypatch, caplog):
    e, sent = env

    def rejecting_send(ses, sender, to, subject, body, app_url):
        if to == "a@gmail.com":
            raise RuntimeError("connection reset")
        sent.append(("mail", to, body))

    monkeypatch.setattr(nudge.notify, "send_email", rejecting_send)
    with caplog.at_level(logging.ERROR):
        nudge._last_call(e)
    assert [target for kind, target, _ in sent if kind == "mail"] == ["b@gmail.com"]
    assert "a@gmail.com" in caplog.text


def test_a_refused_message_is_kept_for_its_recipient_to_read_in_the_app(env, monkeypatch):
    e, sent = env

    def rejecting_send(ses, sender, to, subject, body, app_url):
        if to == "a@gmail.com":
            raise _message_rejected(ses)
        sent.append(("mail", to, body))

    monkeypatch.setattr(nudge.notify, "send_email", rejecting_send)
    nudge._last_call(e)

    kept = undelivered.messages(e.undelivered, "u1")
    assert [(m["subject"], m["body"]) for m in kept] == [
        (nudge.REMINDER_SUBJECT, nudge.REMINDER_TEXT)]
    # The refusal is one recipient's; the rest of the pool is delivered to as usual and keeps
    # nothing.
    assert [target for kind, target, _ in sent if kind == "mail"] == ["b@gmail.com"]
    assert undelivered.messages(e.undelivered, "u2") == []


def test_a_transient_failure_keeps_no_message(env, monkeypatch):
    """Only SES refusing the message outright is worth surfacing: a failure the next run may well
    get through is left to the logs, so the bell does not fill with messages that did arrive."""
    e, _ = env

    def failing_send(ses, sender, to, subject, body, app_url):
        raise RuntimeError("connection reset")

    monkeypatch.setattr(nudge.notify, "send_email", failing_send)
    nudge._last_call(e)
    assert undelivered.messages(e.undelivered, "u1") == []


def test_rules_job_keeps_the_alert_pending_when_delivery_fails(env, monkeypatch):
    e, sent = env
    for offset in (2, 1, 0):
        e.store.put_day("u1", days_before(today(), offset), VIOLATING, 1, "t")

    def failing_send(ses, sender, to, subject, body, app_url):
        raise RuntimeError("connection reset")

    monkeypatch.setattr(nudge.notify, "send_email", failing_send)
    nudge._rules_job(e)
    sent.clear()

    monkeypatch.setattr(nudge.notify, "send_email",
                        lambda ses, sender, to, subject, body, app_url: sent.append(("mail", to, body)))
    nudge._rules_job(e)
    assert [target for kind, target, _ in sent if kind == "mail"] == ["a@gmail.com"]


def test_muted_users_are_dropped_from_every_jobs_audience(env):
    e, _ = env
    e.store.set_muted("u1", True)
    assert nudge._notifiable(e.store, e.users) == [User("u2", "b@gmail.com")]


def test_weekly_sends_the_plain_digest_when_no_answering_service_is_configured(env, monkeypatch):
    e, sent = env
    e = dataclasses.replace(e, rag_url="", rag_key=None)
    monkeypatch.setattr(nudge.chat, "ask", lambda url, key, question, timeout:
                        pytest.fail("asked the LLM with no service configured"))
    e.store.put_day("u1", days_before(today(), 1), CLEAN, 1, "t")
    nudge._weekly(e)
    body = next(text for _, target, text in sent if target == "a@gmail.com")
    assert "נסגרו 1 מתוך 7 ימים" in body
    assert chat_history.turns(e.chat_history, "u1") == []


def test_build_env_reads_no_rag_key_when_no_answering_service_is_configured(monkeypatch, ddb):
    monkeypatch.setenv("AWS_DEFAULT_REGION", "eu-central-1")
    for name in ("DAYS_TABLE", "MEALS_TABLE", "STATE_TABLE", "WEIGHTS_TABLE"):
        monkeypatch.setenv(name, name.split("_")[0].lower())
    monkeypatch.setenv("APP_CONFIG_PATH", str(APP_CONFIG))
    monkeypatch.setenv("USER_POOL_ID", "pool")
    monkeypatch.setenv("BOT_TOKEN_PARAM", "/bot")
    monkeypatch.setenv("CHAT_MAP_PARAM", "/map")
    monkeypatch.setenv("UNDELIVERED_TABLE", "undelivered")
    monkeypatch.setenv("CHAT_HISTORY_TABLE", "chat_history")
    monkeypatch.setenv("SES_SENDER", "me@x.com")
    monkeypatch.setenv("APP_URL", "https://app.example")
    monkeypatch.setenv("RAG_API_URL", "")
    monkeypatch.setenv("RAG_API_KEY_PARAM", "/diet-tracker/rag/api-key")
    monkeypatch.setattr(nudge.users, "list_users", lambda client, pool: [])
    monkeypatch.setattr(nudge.notify, "telegram_config", lambda ssm, token, chat_map: None)
    monkeypatch.setattr(nudge.chat, "api_key", lambda ssm, param:
                        pytest.fail("read the RAG key with no service configured"))
    assert nudge._build_env().rag_key is None
