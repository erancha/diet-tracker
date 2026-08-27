"""HTTP API handler: day submission with meal-derived floors and synchronous rule alerts,
history with per-day read-only lookups, day deletion, intraday meal reporting with whole-meal
corrections, and the weight log — measurements and the target the chart reads them against.

The caller's identity comes exclusively from the JWT claims the API Gateway authorizer
verified — the request body never names a user."""

import json
import os
from dataclasses import asdict
from datetime import date, datetime

import boto3

from common import appconfig, notify, rules, users, weight
from common.dates import days_before, now_iso, today
from common.derive import derive
from common.log import get_logger
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
    if route == "GET /days/{date}":
        return _get_day(sub, event["pathParameters"]["date"])
    if route == "DELETE /days/{date}":
        return _delete_day(sub, event["pathParameters"]["date"])
    if route == "POST /meals":
        return _add_meal(sub, json.loads(event["body"]))
    if route == "PUT /meals/{date}/{id}":
        return _update_meal(sub, event["pathParameters"]["date"], event["pathParameters"]["id"],
                            json.loads(event["body"]))
    if route == "DELETE /meals/{date}/{id}":
        return _delete_meal(sub, event["pathParameters"]["date"], event["pathParameters"]["id"])
    if route == "GET /weight":
        return _weight(sub)
    if route == "PUT /weight":
        return _record_weight(sub, json.loads(event["body"]))
    if route == "PUT /weight/target":
        return _set_target(sub, json.loads(event["body"]))
    if route == "DELETE /weight/{date}":
        return _delete_weight(sub, event["pathParameters"]["date"])
    raise ValueError(f"unhandled route {route!r}")


def _config():
    return appconfig.load(os.environ["APP_CONFIG_PATH"])


def _questionnaire():
    return _config().questionnaire


def _store():
    return Store(os.environ["DAYS_TABLE"], os.environ["MEALS_TABLE"], os.environ["STATE_TABLE"],
                 os.environ["WEIGHTS_TABLE"])


def _reject_malformed_date(chosen):
    """The 400 response for a path date that is not an ISO calendar date, or None when it is."""
    try:
        date.fromisoformat(chosen)
    except ValueError:
        return _response(400, {"error": f"{chosen!r} is not a valid ISO date"})
    return None


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
            "derived": asdict(derive(meals, questionnaire.carb_weights(),
                                     questionnaire.addition_values(),
                                     questionnaire.small_portion()))}


def _submit(sub, email, body):
    questionnaire = _questionnaire()
    answers = body["answers"]
    day, allowed = _backfill_window()
    chosen = body.get("date", day)
    rejection = _reject_outside_window(chosen, allowed)
    if rejection:
        return rejection
    store = _store()
    floors = derive(store.get_meals(sub, chosen), questionnaire.carb_weights(),
                    questionnaire.addition_values(), questionnaire.small_portion())
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
        # Yesterday stays within the backfill window whether or not it was recorded, and a
        # recorded day reopens for resubmission, so its floors are needed either way.
        "yesterday": _day_payload(store, questionnaire, sub, yesterday),
    })


def _get_day(sub, chosen):
    """Read-only tracker payload for any stored day, however old — fetched on demand when a
    history row is opened."""
    rejection = _reject_malformed_date(chosen)
    if rejection is not None:
        return rejection
    return _response(200, _day_payload(_store(), _questionnaire(), sub, chosen))


def _meal_rejection(body, day, questionnaire):
    """The 400 response a meal body earns when a field cannot be stored, or None when the whole
    body is legal. Recording and correcting a meal take identical bodies, so they share it."""
    try:
        at = datetime.fromisoformat(body["at"])
    except ValueError:
        return _response(400, {"error": f"at ({body['at']!r}) is not a valid ISO timestamp"})
    if at.tzinfo is None:
        return _response(400, {"error": f"at ({body['at']!r}) must include a UTC offset"})
    if at.date().isoformat() != day:
        return _response(400, {"error": f"meals can only be recorded for today ({day})"})
    if body["carbs_choice"] not in questionnaire.carb_weights():
        return _response(400, {"error": f"unknown carbs choice {body['carbs_choice']!r}"})
    if not isinstance(body["vegetables"], bool):
        return _response(400, {"error": "vegetables must be a boolean"})
    if not isinstance(body["fruit"], bool):
        return _response(400, {"error": "fruit must be a boolean"})
    if not isinstance(body["small_portion"], bool):
        return _response(400, {"error": "small_portion must be a boolean"})
    if not isinstance(body["additions"], list):
        return _response(400, {"error": "additions must be a list"})
    unknown = [a for a in body["additions"] if a not in questionnaire.addition_values()]
    if unknown:
        return _response(400, {"error": f"unknown additions {unknown!r}"})
    return None


def _wrong_correction_day(date, day):
    """The 400 response for correcting a meal outside today, or None. A meal is stored under the
    day it belongs to, and only the running day may still be corrected."""
    return None if date == day \
        else _response(400, {"error": f"meals can only be corrected for today ({day})"})


def _add_meal(sub, body):
    day = today()
    questionnaire = _questionnaire()
    rejection = _meal_rejection(body, day, questionnaire)
    if rejection is not None:
        return rejection
    store = _store()
    if store.has_day(sub, day):
        return _response(409, {"error": f"{day} is already submitted"})
    store.add_meal(sub, day, body["at"], body["carbs_choice"], body["vegetables"], body["fruit"],
                   body["additions"], body["small_portion"])
    return _response(200, _day_payload(store, questionnaire, sub, day))


def _update_meal(sub, date, meal_id, body):
    """Replaces a recorded meal with a new body: every field the tracker sets when recording,
    the time included. A corrected time re-keys the meal, so the reply carries the day's meals in
    their new order along with the re-derived values."""
    day = today()
    wrong_day = _wrong_correction_day(date, day)
    if wrong_day is not None:
        return wrong_day
    questionnaire = _questionnaire()
    rejection = _meal_rejection(body, day, questionnaire)
    if rejection is not None:
        return rejection
    store = _store()
    if store.has_day(sub, day):
        return _response(409, {"error": f"{day} is already submitted"})
    try:
        store.replace_meal(sub, day, meal_id, body["at"], body["carbs_choice"],
                           body["vegetables"], body["fruit"], body["additions"],
                           body["small_portion"])
    except KeyError:
        return _response(404, {"error": f"no meal {meal_id!r} for {day}"})
    return _response(200, _day_payload(store, questionnaire, sub, day))


def _delete_meal(sub, date, meal_id):
    day = today()
    wrong_day = _wrong_correction_day(date, day)
    if wrong_day is not None:
        return wrong_day
    store = _store()
    if store.has_day(sub, day):
        return _response(409, {"error": f"{day} is already submitted"})
    try:
        store.delete_meal(sub, day, meal_id)
    except KeyError:
        return _response(404, {"error": f"no meal {meal_id!r} for {day}"})
    return _response(200, _day_payload(store, _questionnaire(), sub, day))


def _weight_payload(store, sub) -> dict:
    """The weight section's whole view: every measurement in chart order, and the target they are
    read against — null for a user who has never set one."""
    weights = store.get_weights(sub)
    return {"target": store.get_target(sub),
            "entries": [{"date": day, "kg": kg} for day, kg in sorted(weights.items())]}


def _weight(sub):
    return _response(200, _weight_payload(_store(), sub))


def _stored_weight(sub, body, store_value):
    """Validates a weight body and writes it through store_value, replying with the whole weight
    payload. Recording a measurement and setting the target differ only in where the kilograms
    land, so they share the rejection and the reply."""
    rejection = weight.rejection(body["kg"], _config().weight.limits)
    if rejection is not None:
        return _response(400, {"error": rejection})
    store = _store()
    store_value(store, body["kg"])
    return _response(200, _weight_payload(store, sub))


def _record_weight(sub, body):
    return _stored_weight(sub, body, lambda store, kg: store.put_weight(sub, today(), kg))


def _set_target(sub, body):
    return _stored_weight(sub, body, lambda store, kg: store.put_target(sub, kg))


def _delete_weight(sub, chosen):
    """Removes one measurement, at any date. Unlike a day record or a meal, a weight feeds no
    derivation and no rule streak, so removing an old one restates nothing."""
    rejection = _reject_malformed_date(chosen)
    if rejection is not None:
        return rejection
    store = _store()
    try:
        store.delete_weight(sub, chosen)
    except KeyError:
        return _response(404, {"error": f"no weight recorded for {chosen}"})
    return _response(200, _weight_payload(store, sub))


def _alert(email, violations):
    text = notify.violation_text(violations)
    ssm = boto3.client("ssm")
    telegram = notify.telegram_config(ssm, os.environ["BOT_TOKEN_PARAM"], os.environ["CHAT_MAP_PARAM"])
    if telegram is not None:
        token, chat_map = telegram
        notify.send_telegram(token, users.chat_id_for(chat_map, email), text)
    notify.send_email(boto3.client("ses"), os.environ["SES_SENDER"], email, notify.ALERT_SUBJECT, text)


def _response(status, body):
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body, ensure_ascii=False),
    }
