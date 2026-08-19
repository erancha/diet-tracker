"""HTTP API handler: questionnaire submission with synchronous rule alerts, history, and
deletion of a recent day's record.

The caller's identity comes exclusively from the JWT claims the API Gateway authorizer
verified — the request body never names a user."""

import json
import os

import boto3

from common import notify, rules, users
from common.dates import days_before, now_iso, today
from common.questionnaire import load
from common.rules import LOOKBACK_DAYS
from common.store import Store


def handler(event, context):
    claims = event["requestContext"]["authorizer"]["jwt"]["claims"]
    route = event["routeKey"]
    sub = claims["sub"]
    email = claims["email"].lower()
    if route == "POST /answers":
        return _submit(sub, email, json.loads(event["body"]))
    if route == "GET /answers":
        return _history(sub)
    if route == "DELETE /answers/{date}":
        return _delete(sub, event["pathParameters"]["date"])
    raise ValueError(f"unhandled route {route!r}")


def _backfill_window():
    """The days a record may be written or deleted for — today and yesterday, so after-midnight
    corrections can still target the prior day."""
    day = today()
    return day, {day, days_before(day, 1)}


def _reject_outside_window(chosen, allowed):
    """Returns the 400 response for a date outside the backfill window, or None when it is legal."""
    if chosen in allowed:
        return None
    return _response(400, {"error": f"date must be one of {sorted(allowed)}"})


def _recent_history(sub):
    store = Store(os.environ["TABLE_NAME"])
    day = today()
    history = store.get_answers_range(sub, days_before(day, LOOKBACK_DAYS), day)
    return store, day, history


def _submit(sub, email, body):
    questionnaire = load(os.environ["QUESTIONNAIRE_PATH"])
    answers = body["answers"]
    try:
        questionnaire.validate_answers(answers)
    except ValueError as error:
        return _response(400, {"error": str(error)})
    day, allowed = _backfill_window()
    chosen = body.get("date", day)
    rejection = _reject_outside_window(chosen, allowed)
    if rejection:
        return rejection
    store = Store(os.environ["TABLE_NAME"])
    store.put_answers(sub, chosen, answers, questionnaire.version, now_iso())
    history = store.get_answers_range(sub, days_before(chosen, LOOKBACK_DAYS), chosen)
    state = store.get_nudge_state(sub)
    violations = rules.due_alerts(questionnaire, history, chosen, state)
    if violations:
        _alert(email, violations)
        store.put_nudge_state(sub, rules.mark_alerted(state, violations, chosen))
    return _response(200, {
        "date": chosen,
        "violations": [{"rule_id": v.rule_id, "message": v.message} for v in violations],
    })


def _delete(sub, chosen):
    _, allowed = _backfill_window()
    rejection = _reject_outside_window(chosen, allowed)
    if rejection:
        return rejection
    try:
        Store(os.environ["TABLE_NAME"]).delete_answers(sub, chosen)
    except KeyError:
        return _response(404, {"error": f"no record for {chosen}"})
    return _response(200, {"date": chosen})


def _history(sub):
    _, _, history = _recent_history(sub)
    return _response(200, {
        "days": [{"date": d, "answers": a} for d, a in sorted(history.items(), reverse=True)],
    })


def _alert(email, violations):
    text = "התראות תזונה:\n" + "\n".join(f"• {v.message}" for v in violations)
    ssm = boto3.client("ssm")
    telegram = notify.telegram_config(ssm, os.environ["BOT_TOKEN_PARAM"], os.environ["CHAT_MAP_PARAM"])
    if telegram is not None:
        token, chat_map = telegram
        notify.send_telegram(token, users.chat_id_for(chat_map, email), text)
    notify.send_email(boto3.client("ses"), os.environ["SES_SENDER"], email, "התראת תזונה — מעקב תזונה", text)


def _response(status, body):
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body, ensure_ascii=False),
    }
