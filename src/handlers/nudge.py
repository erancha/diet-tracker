"""Scheduled nudge jobs: fill reminders, nightly rule evaluation, weekly digest, weekly weigh-in.

EventBridge Scheduler invokes this handler with {"job": ...}; each job iterates every user in
the pool. NudgeEnv gathers all AWS-derived inputs once so job logic stays pure and testable."""

import os
from dataclasses import dataclass

import boto3

from common import appconfig, digest, notify, rules, users, weight
from common.dates import days_before, today
from common.log import get_logger
from common.rules import LOOKBACK_DAYS
from common.store import Store

logger = get_logger(__name__)


@dataclass(frozen=True)
class NudgeEnv:
    store: object
    questionnaire: object
    users: list
    telegram: tuple | None  # (bot_token, chat_map) when the Telegram channel is active, else None
    ses: object
    sender: str


def handler(event, context):
    jobs = {"reminder": _reminder, "rules": _rules_job, "weekly": _weekly,
            "weigh_in": _weigh_in}
    env = _build_env()
    logger.info("job=%s starting users=%d", event["job"], len(env.users))
    jobs[event["job"]](env)
    logger.info("job=%s completed", event["job"])


def _build_env() -> NudgeEnv:
    ssm = boto3.client("ssm")
    return NudgeEnv(
        store=Store(os.environ["DAYS_TABLE"], os.environ["MEALS_TABLE"], os.environ["STATE_TABLE"],
                    os.environ["WEIGHTS_TABLE"]),
        questionnaire=appconfig.load(os.environ["APP_CONFIG_PATH"]).questionnaire,
        users=users.list_users(boto3.client("cognito-idp"), os.environ["USER_POOL_ID"]),
        telegram=notify.telegram_config(ssm, os.environ["BOT_TOKEN_PARAM"], os.environ["CHAT_MAP_PARAM"]),
        ses=boto3.client("ses"),
        sender=os.environ["SES_SENDER"],
    )


def _send(env, user, subject, text):
    if env.telegram is not None:
        bot_token, chat_map = env.telegram
        notify.send_telegram(bot_token, users.chat_id_for(chat_map, user.email), text)
    notify.send_email(env.ses, env.sender, user.email, subject, text)


def _reminder(env):
    day = today()
    for user in env.users:
        if not env.store.has_day(user.sub, day):
            _send(env, user, "תזכורת — שאלון תזונה", "עדיין לא מילאת את שאלון התזונה של היום 🕗")


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
        if violations:
            _send(env, user, notify.ALERT_SUBJECT, notify.violation_text(violations))
            env.store.put_nudge_state(user.sub, rules.mark_alerted(state, violations, as_of))


def _weekly(env):
    day = today()
    for user in env.users:
        history = env.store.get_days_range(user.sub, days_before(day, 6), day)
        _send(env, user, f"סיכום שבועי — {notify.APP_NAME}",
              digest.weekly_text(env.questionnaire, history))


def _weigh_in(env):
    """Weekly weigh-in reminder. Someone who already stepped on the scale within the week has
    done the thing being asked of them, so the schedule's own week is the window that decides."""
    day = today()
    for user in env.users:
        if env.store.get_weights_range(user.sub, days_before(day, 6), day):
            continue
        _send(env, user, weight.REMINDER_SUBJECT, weight.REMINDER_TEXT)
