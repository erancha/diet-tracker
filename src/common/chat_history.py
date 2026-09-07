"""Per-user chat transcript: one DynamoDB item per chat — the whole conversation in one item,
its question text carrying the chain of questions and answers, its answer attribute the latest
reply. The partition key is the user's sub and the sort key is the UTC ISO timestamp of the
chat's last answer, so a key-ordered query reads the transcript newest activity first; a
follow-up replaces the item whole with a fresh sort key, moving the chat to the top.

Source scores are floats, which the DynamoDB document layer refuses, so the sources list rides
as a JSON string attribute and is parsed back on read."""

import json
from datetime import datetime, timezone

from boto3.dynamodb.conditions import Key

from common.paging import query_all


def append(table, sub, question, answer, sources, at=None):
    """Stores one answered chat for the user, stamped now (UTC), and returns that stamp — the
    chat's identity for a later delete or follow-up. With `at`, one transaction replaces the
    named chat with the fresh-stamped one, so the chat cannot be lost or doubled between the
    two writes; naming a missing chat raises KeyError rather than resurrecting a deleted one."""
    sk = datetime.now(timezone.utc).isoformat()
    item = {
        "pk": sub,
        "sk": sk,
        "question": question,
        "answer": answer,
        "sources": json.dumps(sources, ensure_ascii=False),
    }
    if at is None:
        table.put_item(Item=item)
        return sk
    # The resource's client shares the table's plain-value document interface — values stay untyped.
    client = table.meta.client
    try:
        client.transact_write_items(TransactItems=[
            {"Delete": {"TableName": table.table_name,
                        "Key": {"pk": sub, "sk": at},
                        "ConditionExpression": "attribute_exists(pk)"}},
            {"Put": {"TableName": table.table_name, "Item": item}},
        ])
    except client.exceptions.TransactionCanceledException:
        raise KeyError(at)
    return sk


def delete(table, sub, at):
    """Permanently removes the user's chat keyed by the given timestamp; raises KeyError when
    the user holds no such chat — including a timestamp that exists only for another user."""
    try:
        table.delete_item(Key={"pk": sub, "sk": at},
                          ConditionExpression="attribute_exists(pk)")
    except table.meta.client.exceptions.ConditionalCheckFailedException:
        raise KeyError(at)


def count_range(table, sub, start_day, end_day) -> int:
    """Stored chats across the inclusive day range, counted inside DynamoDB so transcript
    content never leaves the table. Sort keys are ISO timestamps, so a day string sorts before
    every timestamp of that day and the upper bound closes past the last one. A chat counts
    once, however many follow-ups it folded in."""
    return _count(table, Key("pk").eq(sub) & Key("sk").between(start_day, f"{end_day}\xff"))


def count(table, sub) -> int:
    """Every stored chat of the user's transcript, counted inside DynamoDB so transcript content
    never leaves the table. A chat counts once, however many follow-ups it folded in."""
    return _count(table, Key("pk").eq(sub))


def _count(table, key_condition) -> int:
    return table.query(Select="COUNT", KeyConditionExpression=key_condition)["Count"]


def turns(table, sub):
    """The user's full transcript, newest first."""
    return [{
        "question": item["question"],
        "answer": item["answer"],
        "sources": json.loads(item["sources"]),
        "at": item["sk"],
    } for item in query_all(table, KeyConditionExpression=Key("pk").eq(sub),
                            ScanIndexForward=False)]
