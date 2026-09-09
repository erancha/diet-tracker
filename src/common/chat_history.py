"""Per-user chat transcript: one DynamoDB item per chat — the whole conversation in one item,
its question text carrying the chain of questions and answers, its answer attribute the latest
reply. A summarized chat holds a digest in place of that chain, under a mark that stands until a
follow-up rewrites the item. A second mark records that the app wrote the chat rather than the
user asking it, so a transcript can be read as one side or the other. The partition key is the
user's sub and the sort key is the UTC ISO timestamp of the chat's last answer, so a key-ordered
query reads the transcript newest activity first; a follow-up replaces the item whole with a
fresh sort key, moving the chat to the top.

Source scores are floats, which the DynamoDB document layer refuses, so the sources list rides
as a JSON string attribute and is parsed back on read."""

import json
from datetime import datetime, timezone

from boto3.dynamodb.conditions import Key

from common.paging import query_all


def append(table, sub, question, answer, sources, at=None, app=False):
    """Stores one answered chat for the user, stamped now (UTC), and returns that stamp — the
    chat's identity for a later delete or follow-up. With `at`, one transaction replaces the
    named chat with the fresh-stamped one, so the chat cannot be lost or doubled between the
    two writes; naming a missing chat raises KeyError rather than resurrecting a deleted one.

    `app` marks a chat the app itself wrote. A follow-up writes the item whole, so it has to
    re-state the mark to keep it."""
    sk = datetime.now(timezone.utc).isoformat()
    item = {
        "pk": sub,
        "sk": sk,
        "question": question,
        "answer": answer,
        "sources": json.dumps(sources, ensure_ascii=False),
    }
    if app:
        item["app"] = True
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


def get(table, sub, at):
    """One stored chat of the user's, by its timestamp; raises KeyError when the user holds no
    such chat — including a timestamp that exists only for another user."""
    stored = table.get_item(Key={"pk": sub, "sk": at})
    if "Item" not in stored:
        raise KeyError(at)
    return _turn(stored["Item"])


def summarize(table, sub, at, question, summary):
    """Replaces the user's chat at the given timestamp with its digest: the conversation's
    original question, the summary as the answer, and no sources — the chain, its follow-ups and
    the citations they were answered from are gone for good. The key is untouched, so a
    summarized chat keeps its place in the transcript. The digest mark it leaves behind stands
    until the chat moves on: a follow-up rewrites the item whole and so drops the mark with the
    digest it described. Raises KeyError when the user holds no chat at that timestamp."""
    try:
        table.update_item(
            Key={"pk": sub, "sk": at},
            UpdateExpression=("SET #question = :question, #answer = :answer, "
                              "#sources = :sources, #summarized = :summarized"),
            ExpressionAttributeNames={"#question": "question", "#answer": "answer",
                                      "#sources": "sources", "#summarized": "summarized"},
            ExpressionAttributeValues={":question": question, ":answer": summary, ":sources": "[]",
                                       ":summarized": True},
            ConditionExpression="attribute_exists(pk)")
    except table.meta.client.exceptions.ConditionalCheckFailedException:
        raise KeyError(at)


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
    return [_turn(item) for item in query_all(table, KeyConditionExpression=Key("pk").eq(sub),
                                              ScanIndexForward=False)]


def _turn(item):
    return {
        "question": item["question"],
        "answer": item["answer"],
        "sources": json.loads(item["sources"]),
        # Written only by summarize, so a chat that was answered rather than digested carries no
        # such attribute at all.
        "summarized": "summarized" in item,
        # Likewise written only for a chat the app wrote, so one carrying no such attribute is
        # one the user asked.
        "app": "app" in item,
        "at": item["sk"],
    }
