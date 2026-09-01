"""Chat endpoint: answers questions about the diet knowledge base by proxying to the external
Summaries.AI RAG service, behind a per-user daily quota — chat is the only feature that spends
money per use, so the quota is consumed before the upstream call and the request that crosses
the limit is refused without spending anything.

The caller's identity comes exclusively from the JWT claims the API Gateway authorizer
verified — the request body never names a user. That verified identity is also what selects
the asker's own tracked data, which rides with the question upstream (common.chat_context) so
answers can ground in it.

Each answered turn is stored per user (common.chat_history) and served back by GET /chat, so
the conversation survives reloads and follows the user across devices. A POST naming an
existing turn's timestamp (`at`) is a follow-up: the answered turn replaces that turn in
place, keeping a whole conversation as one stored turn whose question text carries the chain.
DELETE /chat/{at} permanently removes one of the caller's own turns by its timestamp; the
quota already spent on the deleted question is unaffected."""

import json
import os
import urllib.error

import boto3

from common import appconfig, chat, chat_context, chat_history, quota
from common.dates import today
from common.log import get_logger
from common.store import Store
from common.webapi import response

logger = get_logger(__name__)


def handler(event, context):
    claims = event["requestContext"]["authorizer"]["jwt"]["claims"]
    route = event["routeKey"]
    sub = claims["sub"]
    logger.info("request route=%s sub=%s", route, sub)
    if route == "POST /chat":
        return _ask(sub, claims["email"], json.loads(event["body"]))
    if route == "GET /chat":
        return response(200, {"turns": chat_history.turns(_history_table(), sub)})
    if route == "DELETE /chat/{at}":
        return _delete_turn(sub, event["pathParameters"]["at"])
    raise ValueError(f"unhandled route {route!r}")


def _history_table():
    return boto3.resource("dynamodb").Table(os.environ["CHAT_HISTORY_TABLE"])


def _daily_limit(email):
    """Questions this user may ask today: an entry in the overrides map (email → limit, keyed
    lowercase like the sign-up allowlist) replaces the shared default for that user."""
    overrides = json.loads(os.environ["CHAT_DAILY_LIMIT_OVERRIDES"])
    email = email.lower()
    if email in overrides:
        return int(overrides[email])
    return int(os.environ["CHAT_DAILY_LIMIT"])


def _ask(sub, email, body):
    question = body.get("question")
    if not isinstance(question, str) or not question.strip():
        return response(400, {"error": "question is required"})
    at = body.get("at")
    if at is not None and (not isinstance(at, str) or not at.strip()):
        return response(400, {"error": "at must be the timestamp of a stored turn"})

    table = boto3.resource("dynamodb").Table(os.environ["CHAT_QUOTA_TABLE"])
    count = quota.consume(table, sub, today())
    if count > _daily_limit(email):
        return response(429, {"error": "מכסת השאלות היומית נוצלה — אפשר לשאול שוב מחר"})

    # Only the upstream question carries the asker's tracked data; the stored turn keeps the
    # bare question, so the transcript stays readable and a follow-up re-attaches fresh data
    # instead of accumulating stale copies in the chain.
    store = Store(os.environ["DAYS_TABLE"], os.environ["MEALS_TABLE"], os.environ["STATE_TABLE"],
                  os.environ["WEIGHTS_TABLE"])
    questionnaire = appconfig.load(os.environ["APP_CONFIG_PATH"]).questionnaire
    upstream_question = chat_context.with_user_context(question.strip(), store, questionnaire,
                                                       sub, today())
    key = chat.api_key(boto3.client("ssm"), os.environ["RAG_API_KEY_PARAM"])
    try:
        answer = chat.ask(os.environ["RAG_API_URL"], key, upstream_question)
    except (urllib.error.URLError, TimeoutError) as error:
        logger.error("rag service call failed: %s", error)
        return response(502, {"error": "שירות המענה אינו זמין כרגע — נסו שוב מאוחר יותר"})
    try:
        at = chat_history.append(_history_table(), sub, question.strip(), answer["answer"],
                                 answer["sources"], at=at)
    except KeyError:
        return response(404, {"error": f"no turn stored at {at}"})
    return response(200, {"answer": answer["answer"], "sources": answer["sources"], "at": at})


def _delete_turn(sub, at):
    """Removes one of the caller's turns by its timestamp. The conditional delete is scoped to
    the caller's key, so someone else's timestamp reads as a turn that does not exist."""
    try:
        chat_history.delete(_history_table(), sub, at)
    except KeyError:
        return response(404, {"error": f"no turn stored at {at}"})
    return response(200, {"at": at})
