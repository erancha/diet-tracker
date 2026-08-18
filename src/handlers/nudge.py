"""Scheduled nudge jobs: fill reminders, nightly rule evaluation, weekly digest.

EventBridge Scheduler invokes this handler with {"job": ...}; each job iterates every user in
the pool. NudgeEnv gathers all AWS-derived inputs once so job logic stays pure and testable."""

import os
from dataclasses import dataclass

import boto3

from common import digest, notify, rules, users
from common.dates import days_before, today
from common.questionnaire import load
from common.rules import LOOKBACK_DAYS
from common.store import Store


@dataclass(frozen=True)
class NudgeEnv:
    store: object
    questionnaire: object
    users: list
    telegram: tuple | None  # (bot_token, chat_map) when the Telegram channel is active, else None
    ses: object
    sender: str


def handler(event, context):
    jobs = {"reminder": _reminder, "rules": _rules_job, "weekly": _weekly}
    jobs[event["job"]](_build_env())


def _build_env() -> NudgeEnv:
    ssm = boto3.client("ssm")
    return NudgeEnv(
        store=Store(os.environ["TABLE_NAME"]),
        questionnaire=load(os.environ["QUESTIONNAIRE_PATH"]),
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
        if not env.store.has_answers(user.sub, day):
            _send(env, user, "תזכורת — שאלון תזונה", "עדיין לא מילאת את שאלון התזונה של היום 🕗")


def _rules_job(env):
    day = today()
    for user in env.users:
        history = env.store.get_answers_range(user.sub, days_before(day, LOOKBACK_DAYS), day)
        if not history:
            # A user who never submitted in the window has nothing to evaluate;
            # the reminder job owns that situation.
            continue
        as_of = max(history)
        state = env.store.get_nudge_state(user.sub)
        violations = rules.due_alerts(env.questionnaire, history, as_of, state)
        if violations:
            text = "התראות תזונה:\n" + "\n".join(f"• {v.message}" for v in violations)
            _send(env, user, "התראת תזונה — מעקב תזונה", text)
            env.store.put_nudge_state(user.sub, rules.mark_alerted(state, violations, as_of))


def _weekly(env):
    day = today()
    for user in env.users:
        history = env.store.get_answers_range(user.sub, days_before(day, 6), day)
        _send(env, user, "סיכום שבועי — מעקב תזונה", digest.weekly_text(env.questionnaire, history))
