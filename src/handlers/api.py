"""HTTP API handler: day submission with meal-derived floors and synchronous rule alerts,
history, day deletion, and intraday meal reporting.

The caller's identity comes exclusively from the JWT claims the API Gateway authorizer
verified — the request body never names a user."""

import json
import os
from dataclasses import asdict
from datetime import datetime

import boto3

from common import notify, rules, users
from common.dates import days_before, now_iso, today
from common.derive import derive
from common.log import get_logger
from common.questionnaire import load
from common.rules import LOOKBACK_DAYS
from common.store import Store

logger = get_logger(__name__)


def handler(event, context):
    claims = event["requestContext"]["authorizer"]["jwt"]["claims"]
    route = event["routeKey"]
    sub = claims["sub"]
    email = claims["email"].lower()
    logger.info("request route=%s sub=%s", route, sub)
    if route == "POST /days":
        return _submit(sub, email, json.loads(event["body"]))
    if route == "GET /days":
        return _history(sub)
    if route == "DELETE /days/{date}":
        return _delete_day(sub, event["pathParameters"]["date"])
    if route == "POST /meals":
        return _add_meal(sub, json.loads(event["body"]))
    if route == "DELETE /meals/{date}/{id}":
        return _delete_meal(sub, event["pathParameters"]["date"], event["pathParameters"]["id"])
    raise ValueError(f"unhandled route {route!r}")


def _questionnaire():
    return load(os.environ["QUESTIONNAIRE_PATH"])


def _store():
    return Store(os.environ["DAYS_TABLE"], os.environ["MEALS_TABLE"], os.environ["STATE_TABLE"])


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


def _day_payload(store, questionnaire, sub, day) -> dict:
    """The tracker's view of one day: its meals and the derived values, which double as the
    day-end floors."""
    meals = store.get_meals(sub, day)
    return {"date": day, "meals": meals,
            "derived": asdict(derive(meals, questionnaire.carb_weights()))}


def _submit(sub, email, body):
    questionnaire = _questionnaire()
    answers = body["answers"]
    day, allowed = _backfill_window()
    chosen = body.get("date", day)
    rejection = _reject_outside_window(chosen, allowed)
    if rejection:
        return rejection
    store = _store()
    floors = derive(store.get_meals(sub, chosen), questionnaire.carb_weights())
    try:
        questionnaire.validate_answers(answers, floors=asdict(floors))
    except ValueError as error:
        return _response(400, {"error": str(error)})
    for field, floor in asdict(floors).items():
        # 1e-9 absorbs float representation noise; a genuinely lower value still rejects.
        if answers[field] < floor - 1e-9:
            return _response(400, {
                "error": f"{field} ({answers[field]}) is below the tracked floor ({floor})"})
    store.put_day(sub, chosen, answers, questionnaire.version, now_iso())
    history = store.get_days_range(sub, days_before(chosen, LOOKBACK_DAYS), chosen)
    state = store.get_nudge_state(sub)
    violations = rules.due_alerts(questionnaire, history, chosen, state)
    if violations:
        _alert(email, violations)
        store.put_nudge_state(sub, rules.mark_alerted(state, violations, chosen))
    return _response(200, {
        "date": chosen,
        "violations": [{"rule_id": v.rule_id, "message": v.message} for v in violations],
    })


def _delete_day(sub, chosen):
    _, allowed = _backfill_window()
    rejection = _reject_outside_window(chosen, allowed)
    if rejection:
        return rejection
    try:
        _store().delete_day(sub, chosen)
    except KeyError:
        return _response(404, {"error": f"no record for {chosen}"})
    return _response(200, {"date": chosen})


def _history(sub):
    store = _store()
    questionnaire = _questionnaire()
    day = today()
    yesterday = days_before(day, 1)
    history = store.get_days_range(sub, days_before(day, LOOKBACK_DAYS), day)
    return _response(200, {
        "days": [{"date": d, "answers": a} for d, a in sorted(history.items(), reverse=True)],
        "today": _day_payload(store, questionnaire, sub, day),
        # Yesterday's floors matter only while yesterday can still be submitted.
        "yesterday": None if yesterday in history
        else _day_payload(store, questionnaire, sub, yesterday),
    })


def _add_meal(sub, body):
    day = today()
    try:
        at = datetime.fromisoformat(body["at"])
    except ValueError:
        return _response(400, {"error": f"at ({body['at']!r}) is not a valid ISO timestamp"})
    if at.tzinfo is None:
        return _response(400, {"error": f"at ({body['at']!r}) must include a UTC offset"})
    if at.date().isoformat() != day:
        return _response(400, {"error": f"meals can only be recorded for today ({day})"})
    questionnaire = _questionnaire()
    if body["carbs_choice"] not in questionnaire.carb_weights():
        return _response(400, {"error": f"unknown carbs choice {body['carbs_choice']!r}"})
    if not isinstance(body["vegetables"], bool):
        return _response(400, {"error": "vegetables must be a boolean"})
    store = _store()
    if store.has_day(sub, day):
        return _response(409, {"error": f"{day} is already submitted"})
    store.add_meal(sub, day, body["at"], body["carbs_choice"], body["vegetables"])
    return _response(200, _day_payload(store, questionnaire, sub, day))


def _delete_meal(sub, date, meal_id):
    day = today()
    if date != day:
        return _response(400, {"error": f"meals can only be corrected for today ({day})"})
    store = _store()
    if store.has_day(sub, day):
        return _response(409, {"error": f"{day} is already submitted"})
    try:
        store.delete_meal(sub, day, meal_id)
    except KeyError:
        return _response(404, {"error": f"no meal {meal_id!r} for {day}"})
    return _response(200, _day_payload(store, _questionnaire(), sub, day))


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
