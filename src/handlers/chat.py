"""Chat endpoint: answers questions about the diet knowledge base by proxying to the external
Summaries.AI RAG service, behind a per-user daily quota — chat is the only feature that spends
money per use, so the quota is consumed before the upstream call and the request that crosses
the limit is refused without spending anything.

The caller's identity comes exclusively from the JWT claims the API Gateway authorizer
verified — the request body never names a user."""

import json
import os
import urllib.error

import boto3

from common import chat, quota
from common.dates import today
from common.log import get_logger
from common.webapi import response

logger = get_logger(__name__)


def handler(event, context):
    claims = event["requestContext"]["authorizer"]["jwt"]["claims"]
    route = event["routeKey"]
    sub = claims["sub"]
    logger.info("request route=%s sub=%s", route, sub)
    if route == "POST /chat":
        return _ask(sub, json.loads(event["body"]))
    raise ValueError(f"unhandled route {route!r}")


def _ask(sub, body):
    question = body.get("question")
    if not isinstance(question, str) or not question.strip():
        return response(400, {"error": "question is required"})

    table = boto3.resource("dynamodb").Table(os.environ["CHAT_QUOTA_TABLE"])
    count = quota.consume(table, sub, today())
    if count > int(os.environ["CHAT_DAILY_LIMIT"]):
        return response(429, {"error": "מכסת השאלות היומית נוצלה — אפשר לשאול שוב מחר"})

    key = chat.api_key(boto3.client("ssm"), os.environ["RAG_API_KEY_PARAM"])
    try:
        answer = chat.ask(os.environ["RAG_API_URL"], key, question.strip())
    except (urllib.error.URLError, TimeoutError) as error:
        logger.error("rag service call failed: %s", error)
        return response(502, {"error": "שירות המענה אינו זמין כרגע — נסו שוב מאוחר יותר"})
    return response(200, {"answer": answer["answer"], "sources": answer["sources"]})
