"""Chat endpoint: answers knowledge-base questions by proxying to the external Summaries.AI
RAG service behind a per-user daily quota. Chat is the only feature that spends money per use,
so the quota is consumed before the upstream call and a request crossing the limit is refused
without spending; the day's first refusal is emailed to the admin.

The caller's identity comes exclusively from the JWT claims the API Gateway authorizer
verified — the request body never names a user. That verified identity is also what selects
the asker's own tracked data, sent upstream as a context block beside the question, so answers can
ground in it without the data steering retrieval. Asking and storing the reply is
common.chat_question, shared with the weekly recap's follow-up; what stays here is the quota and
the HTTP shape.

Each answered chat is stored per user (common.chat_history) and served back by GET /chat, so
it survives reloads and follows the user across devices. A POST naming a stored chat's
timestamp (`at`) is a follow-up: the answered chat replaces it under a fresh timestamp —
one stored chat per conversation, risen to the top — and the response's `at` is the chat's
new identity. A POST flagged `app` stores the chat as one the app composed rather than one the
user typed, which is what the transcript's origin filter reads; a follow-up has to repeat the
flag, since it rewrites the stored chat whole. POST /chat/{at}/summary replaces one chat with a
digest of its conversation, answered by the same upstream service and so counted against the
same quota. DELETE /chat/{at} permanently removes one of the caller's own chats by its
timestamp; the quota already spent on its questions is unaffected.

POST /chat/source-url fetches, at the moment a reader presses a cited source, a short-lived link
to that document from the same upstream service. The link is never stored — a transcript keeps
only the file names its answers cited — and no LLM runs, so the call is outside the quota."""

import json
import os
import urllib.error

import boto3

from common import appconfig, chat, chat_history, chat_question, notify, quota
from common.dates import today
from common.log import get_logger
from common.store import Store
from common.webapi import response

logger = get_logger(__name__)

# Asks the answering service for the digest rather than an answer; the conversation itself rides
# as the request's context block.
SUMMARY_INSTRUCTION = ("סכם בעברית את השיחה המצורפת בהקשר: מה נשאל ומה עלה בתשובות. "
                       "עד חמישה משפטים, בלי פתיח ובלי הפניה למסמכים.")


# The routes that reach the answering service. The transcript routes are outside it, so a
# deployment without the service still serves and deletes what earlier ones stored.
UPSTREAM_ROUTES = {"POST /chat", "POST /chat/{at}/summary", "POST /chat/source-url"}


def handler(event, context):
    claims = event["requestContext"]["authorizer"]["jwt"]["claims"]
    route = event["routeKey"]
    sub = claims["sub"]
    logger.info("request route=%s sub=%s", route, sub)
    if route in UPSTREAM_ROUTES and not chat.configured(_rag_url()):
        return _service_unconfigured()
    if route == "POST /chat":
        return _ask(sub, claims["email"], json.loads(event["body"]))
    if route == "GET /chat":
        return response(200, {"turns": chat_history.turns(_history_table(), sub)})
    if route == "POST /chat/{at}/summary":
        return _summarize(sub, claims["email"], event["pathParameters"]["at"])
    if route == "POST /chat/source-url":
        return _source_url(json.loads(event["body"]))
    if route == "DELETE /chat/{at}":
        return _delete_turn(sub, event["pathParameters"]["at"])
    raise ValueError(f"unhandled route {route!r}")


def _history_table():
    return boto3.resource("dynamodb").Table(os.environ["CHAT_HISTORY_TABLE"])


def _rag_url():
    return os.environ["RAG_API_URL"]


def _rag_key():
    """The answering service's API key, read per call so rotating the stored value takes effect
    without a redeploy."""
    return chat.api_key(boto3.client("ssm"), os.environ["RAG_API_KEY_PARAM"])


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
    app = body.get("app", False)
    if not isinstance(app, bool):
        return response(400, {"error": "app must be a boolean"})

    refusal = _quota_refusal(sub, email)
    if refusal is not None:
        return refusal

    store = Store(os.environ["DAYS_TABLE"], os.environ["MEALS_TABLE"], os.environ["STATE_TABLE"],
                  os.environ["WEIGHTS_TABLE"])
    questionnaire = appconfig.load(os.environ["APP_CONFIG_PATH"]).questionnaire
    try:
        stored = chat_question.answer(_rag_url(), _rag_key(), store, questionnaire,
                                      _history_table(), sub, question.strip(),
                                      at=at, app=app)
    except (urllib.error.URLError, TimeoutError) as error:
        return _upstream_unavailable(error)
    except KeyError:
        return response(404, {"error": f"no turn stored at {at}"})
    return response(200, stored)


def _source_url(body):
    file_name = body.get("fileName")
    if not isinstance(file_name, str) or not file_name.strip():
        return response(400, {"error": "fileName is required"})
    key = _rag_key()
    try:
        url = chat.document_url(_rag_url(), key, file_name)
    except chat.DocumentNotFound:
        return response(404, {"error": "המסמך אינו זמין"})
    except (urllib.error.URLError, TimeoutError) as error:
        return _upstream_unavailable(error)
    return response(200, {"url": url})


def _quota_refusal(sub, email):
    """Counts one upstream call against the caller's day and returns the response refusing it
    once the limit is crossed, or None while the day still has room. Every path that spends money
    upstream goes through here, so questions and summaries draw on the one allowance."""
    table = boto3.resource("dynamodb").Table(os.environ["CHAT_QUOTA_TABLE"])
    count = quota.consume(table, sub, today())
    limit = _daily_limit(email)
    if count > limit:
        if count == limit + 1:
            _notify_admin_quota_reached(email, limit)
        return response(429, {"error": "מכסת השאלות היומית נוצלה — אפשר לשאול שוב מחר"})
    return None


def _service_unconfigured():
    """The 503 a deployment with no answering service gives the routes that would call one,
    before the quota is touched, so a question nobody can answer costs no allowance."""
    logger.warning("chat requested on a deployment with no answering service configured")
    return response(503, {"error": "שירות המענה אינו מוגדר בגרסה הזו"})


def _upstream_unavailable(error):
    """The 502 an unreachable or hung answering service becomes, logged with what went wrong."""
    logger.error("rag service call failed: %s", error)
    return response(502, {"error": "שירות המענה אינו זמין כרגע — נסו שוב מאוחר יותר"})


def _summarize(sub, email, at):
    """Replaces one of the caller's chats with a digest of its conversation. The chat is read
    before the quota is spent, so naming a chat the caller does not hold costs nothing; the
    digest is written only once the service has answered, so a failed call leaves the
    conversation intact and re-summarizing stays possible."""
    table = _history_table()
    try:
        turn = chat_history.get(table, sub, at)
    except KeyError:
        return response(404, {"error": f"no turn stored at {at}"})

    refusal = _quota_refusal(sub, email)
    if refusal is not None:
        return refusal

    key = _rag_key()
    try:
        digest = chat.ask(_rag_url(), key, SUMMARY_INSTRUCTION, _conversation(turn))
    except (urllib.error.URLError, TimeoutError) as error:
        return _upstream_unavailable(error)

    question = _original_question(turn["question"])
    chat_history.summarize(table, sub, at, question, digest["answer"])
    return response(200, {"question": question, "answer": digest["answer"], "sources": [],
                          "summarized": True, "app": turn["app"], "at": at})


def _conversation(turn):
    """A stored chat as the text the digest is made from. It stays within the service's context
    cap because every follow-up that grew the chain was itself sent under the smaller question
    cap."""
    return chat_history.conversation(turn["question"], turn["answer"])


def _original_question(question):
    """The question a conversation opened with: everything a chain holds before its first answer,
    without the opening label, or the whole question of a chat that was never followed up. The
    answer label ends the opening rather than the first newline, so a question asked over several
    lines survives summarizing whole."""
    if not question.startswith(chat_history.ORIGINAL_QUESTION_LABEL):
        return question
    opening = question.split(f"\n{chat_history.ANSWER_LABEL}", 1)[0]
    return opening[len(chat_history.ORIGINAL_QUESTION_LABEL):].strip()


def _notify_admin_quota_reached(email, limit):
    """Emails the admin on the day's first refused request — refused attempts keep counting, so
    exactly one request arrives with count == limit + 1 and the notice cannot repeat within the
    day. The notice is observability, not a gate: a send failure is logged and never changes the
    refusal itself."""
    try:
        notify.send_plain_email(
            boto3.client("ses"), os.environ["SES_SENDER"], os.environ["ADMIN_EMAIL"],
            f"מכסת שאלות נוצלה — {notify.APP_NAME}",
            f"המשתמש {email} ניצל את מכסת השאלות היומית ({limit}) וניסה לשאול שאלה נוספת.")
    except Exception:
        logger.exception("admin quota notice failed for %s", email)


def _delete_turn(sub, at):
    """Removes one of the caller's chats by its timestamp. The conditional delete is scoped to
    the caller's key, so someone else's timestamp reads as a chat that does not exist."""
    try:
        chat_history.delete(_history_table(), sub, at)
    except KeyError:
        return response(404, {"error": f"no turn stored at {at}"})
    return response(200, {"at": at})
