"""Scheduled nudge jobs: the night's last call, nightly rule evaluation, weekly recap,
weekly weigh-in.

Two entry points, each deployed as a Lambda function of its own from this one module. The nudge
function's handler is invoked by EventBridge Scheduler with {"job": ...}, and the named job
addresses every user in the pool who has not opted out of notifications — except the weekly
job, which only puts one SQS message per user on the recap queue. The weekly-recap function's
recap_handler is invoked by that queue with one message, and produces that one user's recap:
the week's findings, the answering service's reading of them, the email. NudgeEnv gathers all
AWS-derived inputs once so job logic stays pure and testable."""

import json
import os
import urllib.error
from dataclasses import dataclass

import boto3

from common import (appconfig, chat, chat_history, chat_question, derive, notify, rules,
                    undelivered, users, weekly_recap, weight)
from common.dates import days_before, today
from common.log import get_logger
from common.rules import LOOKBACK_DAYS
from common.store import Store

logger = get_logger(__name__)

REMINDER_SUBJECT = "תזכורת — רישום ארוחות"
REMINDER_TEXT = "עדיין לא רשמת ארוחות היום 🌙"

# What the last call says to a day whose meals are logged: closing it in the tracker is all that
# is left, so the nudge names that rather than repeating the reminder above.
OPEN_DAY_SUBJECT = "תזכורת — היום עדיין פתוח"
OPEN_DAY_TEXT = "רשמת היום ארוחות ולא סגרת את היום 🌙 אפשר לסגור אותו עכשיו ביומן"

# How long the weekly recap waits for its reading of the week: just under the 60s the answering
# service's API Gateway and the Lambda behind it both allow. The follow-up carries the whole recap
# in its question, and composing the reading runs past the client's default wait. No browser waits
# on this job; the budget it spends is the recap consumer's own timeout, one user per invocation.
RECAP_TIMEOUT_SECONDS = 55

@dataclass(frozen=True)
class NudgeEnv:
    store: object
    questionnaire: object
    users: list  # already narrowed to the pool members who accept notifications
    telegram: tuple | None  # (bot_token, chat_map) when the Telegram channel is active, else None
    ses: object
    undelivered: object  # table the messages SES refuses are kept in, for the app to show
    chat_history: object  # transcript table the weekly recap is stored in, as a chat the app wrote
    treat_weekday: str  # the week's treat day, left out of the recap's clean-day count
    sender: str
    app_url: str  # the deployed frontend, cited in every email's mute footnote
    rag_url: str  # empty when the deployment configures no answering service
    rag_key: str | None  # None exactly when rag_url is empty
    recap_queue: object  # SQS queue the weekly job hands one message per user to


def handler(event, context):
    jobs = {"last_call": _last_call, "rules": _rules_job,
            "weekly": _weekly, "weigh_in": _weigh_in}
    env = _build_env(_notifiable_pool)
    logger.info("job=%s starting users=%d", event["job"], len(env.users))
    jobs[event["job"]](env)
    logger.info("job=%s completed", event["job"])


def recap_handler(event, context):
    """One user's weekly recap, from the message the weekly job queued for them.

    The event source mapping hands over one message per invocation, so a slow reading of one
    user's week is that invocation's alone and a crash dead-letters that one message. The night
    the job ran on rides in the message, so every user's week is measured from the same night
    however late their message is answered."""
    (record,) = event["Records"]
    message = json.loads(record["body"])
    user = users.User(message["sub"], message["email"])
    env = _build_env(lambda store: [user])
    logger.info("recap starting user=%s day=%s", user.email, message["day"])
    _recap(env, user, message["day"])
    logger.info("recap completed user=%s", user.email)


def _notifiable(store, pool) -> list:
    """The pool members a job may message: everyone who has not opted out.

    The opt-out is account-wide, so narrowing the audience once here is what silences every job
    for a muted user — including the weekly recap, which is otherwise unconditional."""
    return [user for user in pool if not store.get_nudge_state(user.sub)["muted"]]


def _notifiable_pool(store) -> list:
    return _notifiable(store, users.list_users(boto3.client("cognito-idp"),
                                               os.environ["USER_POOL_ID"]))


def _build_env(audience) -> NudgeEnv:
    """audience: given the store, the users this invocation addresses — the whole notifiable pool
    for a scheduled job, the one user a queued recap names for its consumer."""
    ssm = boto3.client("ssm")
    dynamodb = boto3.resource("dynamodb")
    store = Store(os.environ["DAYS_TABLE"], os.environ["MEALS_TABLE"], os.environ["STATE_TABLE"],
                  os.environ["WEIGHTS_TABLE"])
    config = appconfig.load(os.environ["APP_CONFIG_PATH"])
    # Only the weekly recap's follow-up asks the answering service; every other job runs whether
    # or not the deployment configures one.
    rag_url = os.environ["RAG_API_URL"]
    return NudgeEnv(
        store=store,
        questionnaire=config.questionnaire,
        treat_weekday=config.treat_day.weekday,
        users=audience(store),
        telegram=notify.telegram_config(ssm, os.environ["BOT_TOKEN_PARAM"], os.environ["CHAT_MAP_PARAM"]),
        ses=boto3.client("ses"),
        undelivered=dynamodb.Table(os.environ["UNDELIVERED_TABLE"]),
        chat_history=dynamodb.Table(os.environ["CHAT_HISTORY_TABLE"]),
        sender=os.environ["SES_SENDER"],
        app_url=os.environ["APP_URL"],
        rag_url=rag_url,
        rag_key=chat.api_key(ssm, os.environ["RAG_API_KEY_PARAM"])
                if chat.configured(rag_url) else None,
        recap_queue=boto3.resource("sqs").Queue(os.environ["WEEKLY_RECAP_QUEUE_URL"]),
    )


def _send(env, user, subject, text) -> bool:
    """Delivers one nudge over the active channels and reports whether delivery happened.

    A delivery failure is logged and absorbed here, at the single choke point every job sends
    through, so one unreachable user — a missing Telegram binding, an SES call that fails —
    cannot starve the rest of the pool.

    SES refusing the message outright is the one failure retrying cannot mend, so the message is
    kept for the recipient to read in the app instead of ending in the logs alone. The body is
    kept as the job wrote it, before send_email closes it with the mute footnote and the app's
    address — in the app, both are already at hand."""
    try:
        if env.telegram is not None:
            bot_token, chat_map = env.telegram
            notify.send_telegram(bot_token, users.chat_id_for(chat_map, user.email), text)
        notify.send_email(env.ses, env.sender, user.email, subject, text, env.app_url)
    except env.ses.exceptions.MessageRejected:
        logger.exception("SES refused the message to %s; keeping it for the app", user.email)
        undelivered.record(env.undelivered, user.sub, subject, text)
        return False
    except Exception:
        logger.exception("delivery to %s failed; continuing with the remaining users", user.email)
        return False
    return True


def _unsubmitted(env, day) -> list:
    """The users whose day holds no closed record — the ones the last call addresses."""
    return [user for user in env.users if not env.store.has_day(user.sub, day)]


def _last_call(env):
    """The evening tracking reminder, fired by each of the evening schedules; the last firing is
    late enough that the day it asks about is over in practice — and still inside it, so what
    gets recorded is the day the user is living.

    It nudges every user whose day remains open, and tells one whose meals are already logged
    that the day awaits its closing rather than its meals: everything but the water is recorded,
    and the tracker's close button is what seals it. A day carrying no meals gets the plain
    record-your-meals reminder — and with the tracker the only way a day closes, one that stays
    untracked simply goes unrecorded."""
    day = today()
    for user in _unsubmitted(env, day):
        if env.store.get_meals(user.sub, day):
            _send(env, user, OPEN_DAY_SUBJECT, OPEN_DAY_TEXT)
        else:
            _send(env, user, REMINDER_SUBJECT, REMINDER_TEXT)


def _rules_job(env):
    day = today()
    for user in env.users:
        history = env.store.get_days_range(user.sub, days_before(day, LOOKBACK_DAYS), day)
        if not history:
            # A user who never submitted in the window has nothing to evaluate;
            # the reminder job owns that situation.
            continue
        as_of = max(history)
        state = env.store.get_nudge_state(user.sub)
        violations = rules.due_alerts(env.questionnaire, history, as_of, state)
        # An alert counts as raised only once delivered; a failed send leaves it pending so the
        # next nightly run retries instead of deduplicating it away.
        if violations and _send(env, user, notify.ALERT_SUBJECT, notify.violation_text(violations)):
            env.store.put_nudge_state(user.sub, rules.mark_alerted(state, violations, as_of))


def _weekly(env):
    """Queues one recap per user, for recap_handler to answer each in an invocation of its own.

    The message names the user and the night the job ran on: the consumer reads the week itself,
    so the payload stays small, and the night fixes the window however late the message is
    answered."""
    day = today()
    for user in env.users:
        env.recap_queue.send_message(MessageBody=json.dumps(
            {"sub": user.sub, "email": user.email, "day": day}))


def _recap(env, user, day):
    """One user's recap: the seven days ending on their last closed day of the night the job ran
    on and the day before it.

    The schedule fires late on the weigh-in night, when the day is over in practice but may still
    be open in the tracker. A day closed by then belongs to the week it ends, so the window takes
    it; one still open would be counted as missing however diligent the user was, so the window
    ends the day before it instead. Each user's own days decide, so the week reported is whatever
    seven days they have most recently had the chance to close."""
    week_end = day if env.store.has_day(user.sub, day) else days_before(day, 1)
    week_start = days_before(week_end, 6)
    history = env.store.get_days_range(user.sub, week_start, week_end)
    # The clean-day count reads the meals themselves: what a day cost in flours and sugars is
    # derived on read, never stored with the day.
    excluded = derive.excluded_by_day(
        env.questionnaire, env.store.get_meals_range(user.sub, week_start, week_end))
    _send(env, user, f"{weekly_recap.TITLE} — {notify.APP_NAME}",
          _weekly_body(env, user, history, excluded, week_start))


def _weekly_body(env, user, history, excluded, week_start) -> str:
    """The week's findings, and under them the answering service's reading of them.

    The findings are stored as a chat of the user's under the recap's short title, and the reading
    is asked for as a follow-up on that chat — the same path the user's own follow-up takes, so the
    service is asked in the shape a user asks in and the answered conversation lands in the
    transcript ready to be continued. Retrieval reads the question, which now carries the week's
    actual findings, so the guidance that comes back is about what the week did.

    A week with no closed day has nothing to recap, and is neither stored nor asked about. A week
    whose chat the transcript already holds — a run that crashed after storing it, then redriven —
    is followed up on that chat rather than stored again, so a week never has two."""
    findings = weekly_recap.text(env.questionnaire, history, excluded, env.treat_weekday)
    if not history:
        return findings
    title = weekly_recap.chat_title(week_start)
    at = chat_history.find(env.chat_history, user.sub, title)
    if at is None:
        at = chat_history.append(env.chat_history, user.sub, title, findings, [], app=True)
    insights = _insights(env, user, week_start, findings, at)
    if insights is None:
        return findings
    return weekly_recap.text(env.questionnaire, history, excluded, env.treat_weekday, insights)


def _insights(env, user, week_start, findings, at) -> str | None:
    """The answering service's reading of the week, or None when there is none to be had — a
    deployment configuring no service, or a service that failed to answer.

    A failed call costs only the reading: the findings are the app's own and go out either way,
    and the stored recap stays the chat it was, so the user can ask the same follow-up in the app.
    The wait is spent inside the consumer's own budget, one user per invocation."""
    if not chat.configured(env.rag_url):
        return None
    question = chat_history.follow_up(weekly_recap.chat_title(week_start), findings,
                                      weekly_recap.INSIGHTS_QUESTION)
    try:
        return chat_question.answer(env.rag_url, env.rag_key, env.store, env.questionnaire,
                                    env.chat_history, user.sub, question, at=at, app=True,
                                    timeout=RECAP_TIMEOUT_SECONDS)["answer"]
    except (urllib.error.URLError, TimeoutError):
        logger.warning("weekly insights failed for %s; sending the findings alone", user.email,
                       exc_info=True)
        return None


def _weigh_in(env):
    """Weekly weigh-in reminder. The schedule fires on the configured weigh-in weekday, so the day
    this job runs is that weekday — and weighing on it is the thing being asked for. A weighing on
    any other day is the drift the weekly rhythm loses itself to, so only the day's own weighing
    excuses the reminder."""
    day = today()
    for user in env.users:
        if env.store.get_weights_range(user.sub, day, day):
            continue
        _send(env, user, weight.REMINDER_SUBJECT, weight.REMINDER_TEXT)
