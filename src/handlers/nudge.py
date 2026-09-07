"""Scheduled nudge jobs: the night's last call, nightly rule evaluation, weekly digest,
weekly weigh-in.

EventBridge Scheduler invokes this handler with {"job": ...}; each job iterates every user in
the pool who has not opted out of notifications. NudgeEnv gathers all AWS-derived inputs once so
job logic stays pure and testable."""

import os
import urllib.error
from dataclasses import dataclass

import boto3

from common import appconfig, chat, digest, notify, rules, undelivered, users, weight
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

SUMMARY_HEADING = "תובנות והמלצות לשבוע הבא:"


@dataclass(frozen=True)
class NudgeEnv:
    store: object
    questionnaire: object
    users: list  # already narrowed to the pool members who accept notifications
    telegram: tuple | None  # (bot_token, chat_map) when the Telegram channel is active, else None
    ses: object
    undelivered: object  # table the messages SES refuses are kept in, for the app to show
    sender: str
    app_url: str  # the deployed frontend, cited in every email's mute footnote
    rag_url: str
    rag_key: str


def handler(event, context):
    jobs = {"last_call": _last_call, "rules": _rules_job,
            "weekly": _weekly, "weigh_in": _weigh_in}
    env = _build_env()
    logger.info("job=%s starting users=%d", event["job"], len(env.users))
    jobs[event["job"]](env)
    logger.info("job=%s completed", event["job"])


def _notifiable(store, pool) -> list:
    """The pool members a job may message: everyone who has not opted out.

    The opt-out is account-wide, so narrowing the audience once here is what silences every job
    for a muted user — including the weekly digest, which is otherwise unconditional."""
    return [user for user in pool if not store.get_nudge_state(user.sub)["muted"]]


def _build_env() -> NudgeEnv:
    ssm = boto3.client("ssm")
    store = Store(os.environ["DAYS_TABLE"], os.environ["MEALS_TABLE"], os.environ["STATE_TABLE"],
                  os.environ["WEIGHTS_TABLE"])
    return NudgeEnv(
        store=store,
        questionnaire=appconfig.load(os.environ["APP_CONFIG_PATH"]).questionnaire,
        users=_notifiable(store, users.list_users(boto3.client("cognito-idp"),
                                                  os.environ["USER_POOL_ID"])),
        telegram=notify.telegram_config(ssm, os.environ["BOT_TOKEN_PARAM"], os.environ["CHAT_MAP_PARAM"]),
        ses=boto3.client("ses"),
        undelivered=boto3.resource("dynamodb").Table(os.environ["UNDELIVERED_TABLE"]),
        sender=os.environ["SES_SENDER"],
        app_url=os.environ["APP_URL"],
        rag_url=os.environ["RAG_API_URL"],
        rag_key=chat.api_key(ssm, os.environ["RAG_API_KEY_PARAM"]),
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
    day = today()
    for user in env.users:
        history = env.store.get_days_range(user.sub, days_before(day, 6), day)
        _send(env, user, f"סיכום שבועי — {notify.APP_NAME}", _weekly_body(env, history))


def _weekly_body(env, history) -> str:
    """The numeric digest, followed for a submitted week by an LLM-written recap and tips.

    The recap paragraph is an optional garnish: when the RAG service is unreachable or slow the
    plain digest still goes out, because losing the whole weekly send over it would be worse.
    An empty week has nothing to recap, so the service is not asked."""
    text = digest.weekly_text(env.questionnaire, history)
    if not history:
        return text
    try:
        answer = chat.ask(env.rag_url, env.rag_key,
                          digest.weekly_summary_question(env.questionnaire, history))["answer"]
    except (urllib.error.URLError, TimeoutError):
        logger.warning("weekly summary generation failed; sending the plain digest", exc_info=True)
        return text
    return f"{text}\n\n{SUMMARY_HEADING}\n{answer}"


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
