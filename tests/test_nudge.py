import dataclasses
import json
import logging
import urllib.error

import boto3
import pytest

from conftest import APP_CONFIG, meal

from common import appconfig, chat_history, rules, undelivered
from common.dates import days_before, today
from common.store import Store
from common.users import User
from handlers import nudge

VIOLATING = {"drinking": 3, "vegetables": 2, "eating_window": 13, "meals": 3, "carbs": 3}
CLEAN = {"drinking": 3, "vegetables": 2, "eating_window": 10, "meals": 3, "carbs": 3}

INSIGHTS = "לשבוע הבא: להקדים את הארוחה האחרונה בשעה."
SOURCES = [{"fileName": "week.pdf", "score": 0.51}]


@pytest.fixture
def answering(monkeypatch):
    """The answering service, stubbed for every job in this module: records what it was asked and
    replies with a fixed reading of the week, so no test reaches the real one."""
    asked = []

    def ask(api_url, key, question, context=None, timeout=None):
        asked.append({"question": question, "context": context, "timeout": timeout})
        return {"answer": INSIGHTS, "sources": SOURCES}

    monkeypatch.setattr(nudge.chat, "ask", ask)
    return asked


@pytest.fixture
def env(monkeypatch, ddb, answering):
    sent = []
    monkeypatch.setattr(nudge.notify, "send_telegram", lambda token, chat, text: sent.append(("tg", chat, text)))
    monkeypatch.setattr(nudge.notify, "send_email",
                        lambda ses, sender, to, subject, body, app_url: sent.append(("mail", to, body)))
    monkeypatch.setenv("AWS_DEFAULT_REGION", "eu-central-1")
    monkeypatch.setenv("DAYS_TABLE", "days")
    monkeypatch.setenv("MEALS_TABLE", "meals")
    monkeypatch.setenv("STATE_TABLE", "state")
    monkeypatch.setenv("WEIGHTS_TABLE", "weights")
    e = nudge.NudgeEnv(
        store=Store("days", "meals", "state", "weights"),
        questionnaire=appconfig.load(APP_CONFIG).questionnaire,
        treat_weekday=appconfig.load(APP_CONFIG).treat_day.weekday,
        users=[User("u1", "a@gmail.com"), User("u2", "b@gmail.com")],
        telegram=("TOKEN", {"a@gmail.com": "111", "b@gmail.com": "222"}),
        # A real (mocked) SES client, not a stub: _send classifies a refusal by the client's own
        # MessageRejected exception class, so the tests must raise the genuine one.
        ses=boto3.client("ses", region_name="eu-central-1"),
        undelivered=ddb.Table("undelivered"),
        chat_history=ddb.Table("chat_history"),
        sender="me@x.com", app_url="https://app.example",
        rag_url="https://rag.example", rag_key="the-key",
        recap_queue=boto3.resource("sqs", region_name="eu-central-1").create_queue(
            QueueName="weekly-recap"),
    )
    return e, sent


def _run_weekly(e):
    """The weekly job end to end: the scheduler's half queues one message per user, then each
    message is answered the way the consumer answers it, one user at a time."""
    nudge._weekly(e)
    for message in e.recap_queue.receive_messages(MaxNumberOfMessages=10):
        body = json.loads(message.body)
        nudge._recap(e, User(body["sub"], body["email"]), body["day"])


def test_handler_logs_job_start_and_completion(env, monkeypatch, caplog):
    e, sent = env
    monkeypatch.setattr(nudge, "_build_env", lambda audience: e)
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


def test_weekly_queues_one_recap_per_user_and_sends_nothing_itself(env):
    # The scheduler's invocation returns in seconds whatever the pool size: each user's recap is
    # produced by its own invocation, off the queue, so one slow reading delays no one else.
    e, sent = env
    nudge._weekly(e)
    messages = e.recap_queue.receive_messages(MaxNumberOfMessages=10)
    queued = sorted((json.loads(m.body) for m in messages), key=lambda body: body["sub"])
    assert queued == [{"sub": "u1", "email": "a@gmail.com", "day": today()},
                      {"sub": "u2", "email": "b@gmail.com", "day": today()}]
    assert sent == []


def test_the_recap_consumer_answers_the_one_user_its_message_names(env, monkeypatch):
    e, sent = env
    monkeypatch.setattr(nudge, "_build_env",
                        lambda audience: dataclasses.replace(e, users=audience(e.store)))
    e.store.put_day("u2", days_before(today(), 1), CLEAN, 1, "t")
    nudge.recap_handler({"Records": [{"body": json.dumps(
        {"sub": "u2", "email": "b@gmail.com", "day": today()})}]}, None)
    assert [target for _, target, _ in sent] == ["222", "b@gmail.com"]
    assert "נסגרו 1 מתוך 7 ימים" in sent[1][2]


def test_the_recap_consumer_takes_exactly_one_message_per_invocation(env, monkeypatch):
    # The event source mapping is configured to hand over one message at a time; a batch would
    # make one user's crash requeue the others, so the consumer refuses to guess at one.
    e, _ = env
    monkeypatch.setattr(nudge, "_build_env", lambda audience: e)
    record = {"body": json.dumps({"sub": "u1", "email": "a@gmail.com", "day": today()})}
    with pytest.raises(ValueError):
        nudge.recap_handler({"Records": [record, record]}, None)


def test_a_rerun_follows_up_on_the_chat_a_crashed_run_left_behind(env):
    # A consumer that crashed after storing the findings leaves them in the transcript. The rerun
    # finds that chat and answers it instead of storing a second one, so the week keeps its one
    # chat and the redrive of a dead-lettered message is safe.
    e, sent = env
    e.store.put_day("u1", days_before(today(), 1), CLEAN, 1, "t")
    title = nudge.weekly_recap.chat_title(days_before(today(), 7))
    chat_history.append(e.chat_history, "u1", title, "ממצאי הריצה שקרסה", [], app=True)
    nudge._recap(e, User("u1", "a@gmail.com"), today())
    (stored,) = chat_history.turns(e.chat_history, "u1")
    assert stored["question"].startswith(f"{chat_history.ORIGINAL_QUESTION_LABEL} {title}")
    assert stored["answer"] == INSIGHTS
    assert [target for _, target, _ in sent] == ["111", "a@gmail.com"]


def test_running_the_recap_twice_leaves_the_weeks_one_chat(env):
    e, _ = env
    e.store.put_day("u1", days_before(today(), 1), CLEAN, 1, "t")
    _run_weekly(e)
    _run_weekly(e)
    assert len(chat_history.turns(e.chat_history, "u1")) == 1


def test_weekly_sends_the_recap_to_every_user(env):
    e, sent = env
    e.store.put_day("u1", days_before(today(), 1), CLEAN, 1, "t")
    _run_weekly(e)
    targets = [target for _, target, _ in sent]
    assert targets == ["111", "a@gmail.com", "222", "b@gmail.com"]
    assert any("נסגרו 1 מתוך 7 ימים" in text for _, _, text in sent)
    assert any("לא נסגרו ימים השבוע" in text for _, _, text in sent)


def test_weekly_ends_the_week_yesterday_while_the_day_it_runs_in_is_open(env):
    # Counting a day still open in the tracker would report six closed days out of seven however
    # diligent the user was, so the window stops the day before it.
    e, sent = env
    for offset in range(1, 8):
        e.store.put_day("u1", days_before(today(), offset), CLEAN, 1, "t")
    _run_weekly(e)
    body = next(text for _, target, text in sent if target == "a@gmail.com")
    assert "נסגרו 7 מתוך 7 ימים" in body
    stored = chat_history.turns(e.chat_history, "u1")
    assert nudge.weekly_recap.chat_title(days_before(today(), 7)) in stored[0]["question"]


def test_weekly_ends_the_week_today_once_the_user_has_closed_it(env):
    # A day already closed when the job runs belongs to the week it ends: the window takes it and
    # lets the day a week back go, so the week is still seven days.
    e, sent = env
    for offset in range(0, 8):
        e.store.put_day("u1", days_before(today(), offset), VIOLATING if offset in (0, 7) else CLEAN,
                        1, "t")
    _run_weekly(e)
    body = next(text for _, target, text in sent if target == "a@gmail.com")
    assert "נסגרו 7 מתוך 7 ימים" in body
    # Only today's breach is in the window; the one seven days back has fallen out of it.
    assert "חלון אכילה (שעות) — חריגה (מעל 12) ביום אחד" in body
    stored = chat_history.turns(e.chat_history, "u1")
    assert nudge.weekly_recap.chat_title(days_before(today(), 6)) in stored[0]["question"]


def test_each_user_gets_the_window_their_own_days_decide(env):
    e, sent = env
    e.store.put_day("u1", today(), CLEAN, 1, "t")
    e.store.put_day("u2", days_before(today(), 1), CLEAN, 1, "t")
    _run_weekly(e)
    titles = {sub: chat_history.turns(e.chat_history, sub)[0]["question"] for sub in ("u1", "u2")}
    assert nudge.weekly_recap.chat_title(days_before(today(), 6)) in titles["u1"]
    assert nudge.weekly_recap.chat_title(days_before(today(), 7)) in titles["u2"]


def test_weekly_stores_the_answered_follow_up_as_the_weeks_one_chat(env):
    e, _ = env
    e.store.put_day("u1", days_before(today(), 1), CLEAN, 1, "t")
    _run_weekly(e)
    stored = chat_history.turns(e.chat_history, "u1")
    # The follow-up replaces the recap it extends, so the week leaves one chat behind, holding the
    # conversation: the recap under the title that names its week, and the reading as the answer.
    week_start = days_before(today(), 7)
    assert len(stored) == 1
    assert stored[0]["question"].startswith(
        f"{chat_history.ORIGINAL_QUESTION_LABEL} {nudge.weekly_recap.chat_title(week_start)}")
    assert stored[0]["question"].endswith(
        f"{chat_history.FOLLOW_UP_LABEL} {nudge.weekly_recap.INSIGHTS_QUESTION}")
    assert stored[0]["answer"] == INSIGHTS
    assert stored[0]["sources"] == SOURCES
    # The app asked it, not the user — a follow-up keeps the mark of the chat it extends.
    assert stored[0]["app"] is True


def test_weekly_asks_the_service_the_follow_up_a_user_would_have_asked(env, answering):
    e, _ = env
    for offset in range(1, 8):
        e.store.put_day("u1", days_before(today(), offset), VIOLATING, 1, "t")
    _run_weekly(e)
    # One question per user with a week to recap; u2 closed no day, so nothing is asked for it.
    assert len(answering) == 1
    question = answering[0]["question"]
    # Retrieval reads the question alone, so the week's findings have to ride inside it.
    assert "חלון אכילה" in question
    assert question.endswith(f"{chat_history.FOLLOW_UP_LABEL} "
                             f"{nudge.weekly_recap.INSIGHTS_QUESTION}")
    # The asker's own tracked data rides beside it, as it does for a question typed in the app.
    assert "נתוני המעקב של השואל" in answering[0]["context"]
    # Composing the reading outruns the client's default wait, so the job spends its own.
    assert answering[0]["timeout"] == nudge.RECAP_TIMEOUT_SECONDS


def test_the_weekly_email_carries_the_reading_under_the_findings(env):
    e, sent = env
    e.store.put_day("u1", days_before(today(), 1), CLEAN, 1, "t")
    _run_weekly(e)
    body = next(text for _, target, text in sent if target == "a@gmail.com")
    assert "נסגרו 1 מתוך 7 ימים" in body
    # The trends pointer stays last: notify.send_email hangs the app's address off it.
    assert body.index(INSIGHTS) < body.index("הגרפים והטבלה")


def test_a_deployment_without_an_answering_service_sends_the_findings_alone(env, answering):
    e, sent = env
    e = dataclasses.replace(e, rag_url="", rag_key=None)
    e.store.put_day("u1", days_before(today(), 1), CLEAN, 1, "t")
    _run_weekly(e)
    assert answering == []
    body = next(text for _, target, text in sent if target == "a@gmail.com")
    assert INSIGHTS not in body
    # The recap still lands in the transcript, where the user can ask the follow-up themselves.
    stored = chat_history.turns(e.chat_history, "u1")
    assert [turn["question"] for turn in stored] == [
        nudge.weekly_recap.chat_title(days_before(today(), 7))]


def test_an_unreachable_service_costs_only_the_reading(env, monkeypatch, caplog):
    """The findings are the app's own arithmetic and go out either way; the recap stays in the
    transcript as the chat it was, so the user can still ask the follow-up in the app."""
    e, sent = env

    def unreachable(api_url, key, question, context=None, timeout=None):
        raise urllib.error.URLError("down")

    monkeypatch.setattr(nudge.chat, "ask", unreachable)
    e.store.put_day("u1", days_before(today(), 1), CLEAN, 1, "t")
    with caplog.at_level(logging.WARNING):
        _run_weekly(e)

    body = next(text for _, target, text in sent if target == "a@gmail.com")
    assert "נסגרו 1 מתוך 7 ימים" in body
    assert INSIGHTS not in body
    assert "a@gmail.com" in caplog.text
    stored = chat_history.turns(e.chat_history, "u1")
    assert [turn["answer"] for turn in stored] == [body]


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
    monkeypatch.setattr(nudge, "_build_env", lambda audience: e)
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
    monkeypatch.setattr(nudge, "_build_env", lambda audience: e)
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


def test_muted_users_are_dropped_from_every_jobs_audience(env):
    e, _ = env
    e.store.set_muted("u1", True)
    assert nudge._notifiable(e.store, e.users) == [User("u2", "b@gmail.com")]


def test_weekly_names_the_days_that_cost_flours_and_sugars(env):
    e, sent = env
    for back in (1, 2, 3):
        e.store.put_day("u1", days_before(today(), back), CLEAN, 1, "t")
    # Grade 7 is flour and sugar, which the program's six non-treat days leave out; grade 2 is not.
    # Whichever weekday the test runs on, the flour lands on a day that is not the treat day.
    flour_day, plain_day = [day for day in (days_before(today(), back) for back in (1, 2, 3))
                            if not rules.falls_on(day, e.treat_weekday)][:2]
    e.store.add_meal("u1", flour_day, meal(f"{flour_day}T12:00:00+03:00", "carb_grade_7"))
    e.store.add_meal("u1", plain_day, meal(f"{plain_day}T12:00:00+03:00", "carb_grade_2"))

    _run_weekly(e)

    body = next(text for _, target, text in sent if target == "a@gmail.com")
    assert "• קמחים וסוכרים ביום אחד שאינו יום פינוק" in body


def test_a_week_inside_every_bound_names_no_finding(env):
    e, sent = env
    e.store.put_day("u1", days_before(today(), 1), CLEAN, 1, "t")

    _run_weekly(e)

    body = next(text for _, target, text in sent if target == "a@gmail.com")
    assert body.startswith("סיכום שבועי — נסגרו 1 מתוך 7 ימים")
    assert "חריגה" not in body


def test_an_empty_week_stores_no_chat(env):
    e, sent = env

    _run_weekly(e)

    assert chat_history.turns(e.chat_history, "u1") == []
