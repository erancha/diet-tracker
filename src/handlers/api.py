"""HTTP API handler: day submission with meal-derived floors, history with per-day read-only
lookups, day deletion, intraday meal reporting with whole-meal corrections, the weight log —
measurements and the target the chart reads them against — the account's own opt-out from
being notified at all, and the admin's per-user activity overview.

Submission reports the day's tripped rules in the reply for the UI alone; outbound alerting
belongs exclusively to the nightly rules job, so a violating day raises at most one message,
at the job's scheduled hour.

The caller's identity comes exclusively from the JWT claims the API Gateway authorizer
verified — the request body never names a user."""

import json
import os
from dataclasses import asdict
from datetime import date, datetime

import boto3

from common import appconfig, chat_history, rules, users, weight
from common.dates import clock_time, days_before, now_iso, today
from common.derive import derive
from common.log import get_logger
from common.rules import LOOKBACK_DAYS
from common.store import Store
from common.webapi import response as _response

logger = get_logger(__name__)


def handler(event, context):
    claims = event["requestContext"]["authorizer"]["jwt"]["claims"]
    route = event["routeKey"]
    sub = claims["sub"]
    logger.info("request route=%s sub=%s", route, sub)
    if route == "POST /days":
        return _submit(sub, json.loads(event["body"]))
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
    if route == "PUT /notifications":
        return _set_muted(sub, json.loads(event["body"]))
    if route == "GET /admin/activity":
        return _admin_activity(claims["email"])
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


def _grace_window(until):
    """The days a write may target: today always, and yesterday while the clock still sits before
    the given small-hours "HH:MM" bound — the stretch just after midnight in which the prior day
    may still be closed, its meals corrected, or (under the earlier bound) its record deleted."""
    day = today()
    if clock_time() < until:
        return day, {day, days_before(day, 1)}
    return day, {day}


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
                                     questionnaire.portions(),
                                     questionnaire.second_source()))}


def _submit(sub, body):
    config = _config()
    questionnaire = config.questionnaire
    answers = body["answers"]
    day, allowed = _grace_window(config.day_close.close_until)
    chosen = body.get("date", day)
    rejection = _reject_outside_window(chosen, allowed)
    if rejection:
        return rejection
    store = _store()
    floors = derive(store.get_meals(sub, chosen), questionnaire.carb_weights(),
                    questionnaire.addition_values(), questionnaire.portions(),
                    questionnaire.second_source())
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
    # The alerted-state stays untouched here: the nightly rules job owns both the outbound
    # message and the mark_alerted write, so submitting never suppresses the day's one alert.
    violations = rules.due_alerts(questionnaire, history, chosen, store.get_nudge_state(sub))
    return _response(200, {
        "date": chosen,
        "violations": [{"rule_id": v.rule_id, "message": v.message} for v in violations],
    })


def _delete_day(sub, chosen):
    # Deletion shuts earlier than closing, so a deleted yesterday can always still be re-closed.
    _, allowed = _grace_window(_config().day_close.delete_until)
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
        # Yesterday rides along for the small-hours grace window, in which the tracker still
        # targets it: its meals and floors are what that view records and closes against.
        "yesterday": _day_payload(store, questionnaire, sub, yesterday),
        "muted": store.get_nudge_state(sub)["muted"],
    })


def _get_day(sub, chosen):
    """Read-only tracker payload for any stored day, however old — fetched on demand when a
    history row is opened."""
    rejection = _reject_malformed_date(chosen)
    if rejection is not None:
        return rejection
    return _response(200, _day_payload(_store(), _questionnaire(), sub, chosen))


# A plate drawing on no carb source says so by carrying none at all, so the plain no-carb grade is
# never a second one. Mirrors NO_CARBS_CHOICE in frontend/src/components/DayTracker.tsx, which
# keeps it out of the second grade group.
NO_CARBS_CHOICE = "no_carbs"


def _second_source_rejection(body, questionnaire):
    """The 400 a meal's second carb source earns, or None when it is storable. A second source
    rides only on a light primary grade; a light second grade merges and carries no portion,
    while a heavier one must carry one of the declared helping sizes."""
    second = body["second_source"]
    rule = questionnaire.second_source()
    weights = questionnaire.carb_weights()
    if not isinstance(second, dict) or set(second) != {"carbs_choice", "portion"}:
        return _response(400, {
            "error": "second_source must carry exactly a carbs_choice and a portion"})
    if second["carbs_choice"] not in weights:
        return _response(400, {"error": f"unknown carbs choice {second['carbs_choice']!r}"})
    if second["carbs_choice"] == NO_CARBS_CHOICE:
        return _response(400, {"error": f"{NO_CARBS_CHOICE!r} is not a second carb source"})
    if not rule.allows_primary(weights[body["carbs_choice"]]):
        return _response(400, {
            "error": "a second source is allowed only beside a light primary grade"})
    if rule.is_light(weights[second["carbs_choice"]]):
        if second["portion"] is not None:
            return _response(400, {"error": "a light second source carries no portion"})
    elif not any(portion.id == second["portion"]
                 for portion in questionnaire.portions().options):
        return _response(400, {"error": f"unknown portion {second['portion']!r}"})
    return None


def _meal_rejection(body, allowed, questionnaire):
    """The 400 response a meal body earns when a field cannot be stored, or None when the whole
    body is legal. Recording and correcting a meal take identical bodies, so they share it. The
    meal's own timestamp names the day it lands on, which must be among the allowed days."""
    try:
        at = datetime.fromisoformat(body["at"])
    except ValueError:
        return _response(400, {"error": f"at ({body['at']!r}) is not a valid ISO timestamp"})
    if at.tzinfo is None:
        return _response(400, {"error": f"at ({body['at']!r}) must include a UTC offset"})
    if at.date().isoformat() not in allowed:
        return _response(400,
                         {"error": f"meals can only be recorded for {sorted(allowed)}"})
    if body["carbs_choice"] not in questionnaire.carb_weights():
        return _response(400, {"error": f"unknown carbs choice {body['carbs_choice']!r}"})
    if not isinstance(body["vegetables"], bool):
        return _response(400, {"error": "vegetables must be a boolean"})
    if not isinstance(body["fruit"], bool):
        return _response(400, {"error": "fruit must be a boolean"})
    portion = body["portion"]
    if portion is not None:
        rule = questionnaire.portions()
        if not isinstance(portion, str) or all(p.id != portion for p in rule.options):
            return _response(400, {"error": f"unknown portion {portion!r}"})
        if not rule.offered_for(questionnaire.carb_weights()[body["carbs_choice"]]):
            return _response(400, {
                "error": "a portion is offered only from the threshold grade up"})
    if not isinstance(body["additions"], list):
        return _response(400, {"error": "additions must be a list"})
    unknown = [a for a in body["additions"] if a not in questionnaire.addition_values()]
    if unknown:
        return _response(400, {"error": f"unknown additions {unknown!r}"})
    if body["second_source"] is not None:
        return _second_source_rejection(body, questionnaire)
    return None


def _add_meal(sub, body):
    config = _config()
    _, allowed = _grace_window(config.day_close.close_until)
    rejection = _meal_rejection(body, allowed, config.questionnaire)
    if rejection is not None:
        return rejection
    day = datetime.fromisoformat(body["at"]).date().isoformat()
    store = _store()
    if store.has_day(sub, day):
        return _response(409, {"error": f"{day} is already submitted"})
    if len(store.get_meals(sub, day)) >= config.meals.max_per_day:
        return _response(409, {"error": f"{day} already holds {config.meals.max_per_day} meals"})
    store.add_meal(sub, day, body)
    return _response(200, _day_payload(store, config.questionnaire, sub, day))


def _update_meal(sub, date, meal_id, body):
    """Replaces a recorded meal with a new body: every field the tracker sets when recording,
    the time included. A corrected time re-keys the meal, so the reply carries the day's meals in
    their new order along with the re-derived values."""
    config = _config()
    _, allowed = _grace_window(config.day_close.close_until)
    outside = _reject_outside_window(date, allowed)
    if outside is not None:
        return outside
    # A corrected time stays within the meal's own day: the correction rewrites the day's record,
    # never moves the meal across the midnight boundary.
    rejection = _meal_rejection(body, {date}, config.questionnaire)
    if rejection is not None:
        return rejection
    store = _store()
    if store.has_day(sub, date):
        return _response(409, {"error": f"{date} is already submitted"})
    try:
        store.replace_meal(sub, date, meal_id, body)
    except KeyError:
        return _response(404, {"error": f"no meal {meal_id!r} for {date}"})
    return _response(200, _day_payload(store, config.questionnaire, sub, date))


def _delete_meal(sub, date, meal_id):
    _, allowed = _grace_window(_config().day_close.close_until)
    outside = _reject_outside_window(date, allowed)
    if outside is not None:
        return outside
    store = _store()
    if store.has_day(sub, date):
        return _response(409, {"error": f"{date} is already submitted"})
    try:
        store.delete_meal(sub, date, meal_id)
    except KeyError:
        return _response(404, {"error": f"no meal {meal_id!r} for {date}"})
    return _response(200, _day_payload(store, _questionnaire(), sub, date))


def _weight_payload(store, sub) -> dict:
    """The weight section's whole view: every measurement in chart order, and the target they are
    read against — null for a user who has never set one."""
    weights = store.get_weights(sub)
    return {"target": store.get_target(sub),
            "entries": [{"date": day, **measurement}
                        for day, measurement in sorted(weights.items())]}


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
    """The weighing and its recording are the same moment, so the time is stamped from the clock
    rather than taken from the body — which is also what keeps it honest as a record of the hour
    the user actually steps on the scale."""
    return _stored_weight(
        sub, body, lambda store, kg: store.put_weight(sub, today(), kg, clock_time()))


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


def _admin_activity(email):
    """Every user in the pool with their trailing-week day, meal, and chat-question counts,
    most active first — for the admin account alone. Counts and addresses only, never recorded
    content: this is an activity overview, not a data export. Chat turns are stamped in UTC
    while the week runs on local days, so the chat window's edges sit at UTC midnight, a few
    hours after the local day boundary the other counts honour."""
    if email.lower() != os.environ["ADMIN_EMAIL"].lower():
        return _response(403, {"error": "admin only"})
    store = _store()
    chats = boto3.resource("dynamodb").Table(os.environ["CHAT_HISTORY_TABLE"])
    end = today()
    start = days_before(end, 6)
    listed = [{"email": user.email,
               "days": store.count_days_range(user.sub, start, end),
               "meals": store.count_meals_range(user.sub, start, end),
               "chats": chat_history.count_range(chats, user.sub, start, end)}
              for user in users.list_users(boto3.client("cognito-idp"),
                                           os.environ["USER_POOL_ID"])]
    listed.sort(key=lambda user: user["days"] + user["meals"] + user["chats"], reverse=True)
    return _response(200, {"users": listed})


def _set_muted(sub, body):
    """Sets or clears the account's opt-out from every notification the app sends, reported back
    as stored so the caller renders the state the server holds rather than the one it assumed."""
    muted = body["muted"]
    if not isinstance(muted, bool):
        return _response(400, {"error": f"muted must be a boolean, got {muted!r}"})
    _store().set_muted(sub, muted)
    return _response(200, {"muted": muted})
