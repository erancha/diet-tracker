"""Per-user chat transcript: one DynamoDB item per Q&A turn, keyed by the user's sub with the
UTC ISO timestamp as the sort key, so a plain key-ordered query reads a user's conversation.

Source scores are floats, which the DynamoDB document layer refuses, so the sources list rides
as a JSON string attribute and is parsed back on read."""

import json
from datetime import datetime, timezone

from boto3.dynamodb.conditions import Key


def append(table, sub, question, answer, sources):
    """Stores one answered turn under the user, stamped with the current UTC time as its sort
    key, and returns that stamp — the turn's identity for a later delete. The caller supplies
    the content, not the position."""
    at = datetime.now(timezone.utc).isoformat()
    table.put_item(Item={
        "pk": sub,
        "sk": at,
        "question": question,
        "answer": answer,
        "sources": json.dumps(sources, ensure_ascii=False),
    })
    return at


def delete(table, sub, at):
    """Permanently removes the user's turn stored under the given timestamp; raises KeyError
    when the user holds no such turn — including a timestamp that exists only under someone
    else's key."""
    try:
        table.delete_item(Key={"pk": sub, "sk": at},
                          ConditionExpression="attribute_exists(pk)")
    except table.meta.client.exceptions.ConditionalCheckFailedException:
        raise KeyError(at)


def turns(table, sub):
    """The user's full transcript, newest first. Reads every page: a silently truncated history
    would read as deleted conversation once a transcript outgrows one query page."""
    query = {"KeyConditionExpression": Key("pk").eq(sub), "ScanIndexForward": False}
    collected = []
    while True:
        page = table.query(**query)
        collected.extend({
            "question": item["question"],
            "answer": item["answer"],
            "sources": json.loads(item["sources"]),
            "at": item["sk"],
        } for item in page["Items"])
        if "LastEvaluatedKey" not in page:
            return collected
        query["ExclusiveStartKey"] = page["LastEvaluatedKey"]
