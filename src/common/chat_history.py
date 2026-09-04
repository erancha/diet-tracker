"""Per-user chat transcript: one DynamoDB item per stored turn, keyed by the user's sub with a
UTC ISO timestamp as the sort key, so a plain key-ordered query reads a user's transcript. A
follow-up overwrites its target turn under the same key, so a multi-turn conversation stays a
single item holding the latest answer and the whole chain in its question text.

Source scores are floats, which the DynamoDB document layer refuses, so the sources list rides
as a JSON string attribute and is parsed back on read."""

import json
from datetime import datetime, timezone

from boto3.dynamodb.conditions import Key


def append(table, sub, question, answer, sources, at=None):
    """Stores one answered turn under the user and returns its sort key — the turn's identity
    for a later delete or follow-up. Without `at` the turn is stamped with the current UTC time,
    a fresh append. With `at` the write replaces the user's existing turn at that stamp whole —
    a follow-up folds its conversation into one item — and raises KeyError when no such turn
    exists, so a turn deleted elsewhere is not resurrected at a client-chosen key."""
    sk = datetime.now(timezone.utc).isoformat() if at is None else at
    item = {
        "pk": sub,
        "sk": sk,
        "question": question,
        "answer": answer,
        "sources": json.dumps(sources, ensure_ascii=False),
    }
    if at is None:
        table.put_item(Item=item)
    else:
        try:
            table.put_item(Item=item, ConditionExpression="attribute_exists(pk)")
        except table.meta.client.exceptions.ConditionalCheckFailedException:
            raise KeyError(at)
    return sk


def delete(table, sub, at):
    """Permanently removes the user's turn stored under the given timestamp; raises KeyError
    when the user holds no such turn — including a timestamp that exists only under someone
    else's key."""
    try:
        table.delete_item(Key={"pk": sub, "sk": at},
                          ConditionExpression="attribute_exists(pk)")
    except table.meta.client.exceptions.ConditionalCheckFailedException:
        raise KeyError(at)


def count_range(table, sub, start_day, end_day) -> int:
    """Stored turns across the inclusive day range, counted inside DynamoDB so transcript
    content never leaves the table. Sort keys are ISO timestamps, so a day string sorts before
    every timestamp of that day and the upper bound closes past the last one. A folded
    follow-up chain counts as the single turn it is stored as."""
    return table.query(
        Select="COUNT",
        KeyConditionExpression=Key("pk").eq(sub) & Key("sk").between(start_day,
                                                                     f"{end_day}\xff"),
    )["Count"]


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
