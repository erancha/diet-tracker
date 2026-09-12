"""Per-user chat transcript: one DynamoDB item per chat, keyed by the user's sub and the UTC
timestamp of the last answer, so a key-ordered query reads newest first. The item holds the
whole conversation — the question text carries the chain of questions and answers — and a
follow-up replaces it whole under a fresh timestamp. Sparse marks record a digest in place of
the chain (`summarized`), a chat the app wrote (`app`), and who else may read it
(`visibility`, "public" so far); the visibility is the partition key of an index over the same
timestamp, so the chats shared under one visibility are one query across every user.

Source scores are floats, which the DynamoDB document layer refuses, so the sources list rides
as a JSON string attribute and is parsed back on read."""

import json
from datetime import datetime, timezone

from boto3.dynamodb.conditions import Attr, Key

from common.paging import query_all

# The labels a conversation is chained under inside the stored question. Chat.tsx composes the
# same chain when the user follows a chat up, so the wording is a cross-runtime contract rather
# than presentation.
ORIGINAL_QUESTION_LABEL = "השאלה המקורית:"
ANSWER_LABEL = "התשובה:"
FOLLOW_UP_LABEL = "שאלת המשך:"

# The visibility index, declared under this name in scripts/template.yaml.
VISIBILITY_INDEX = "ChatsByVisibility"
# The one visibility the app offers: every signed-in user may read the chat.
PUBLIC = "public"


def conversation(question, answer) -> str:
    """One stored chat as the labeled question-and-answer text a further request carries it in.
    An already-chained question keeps the chain it holds; a standalone one gets the opening label,
    so both read alike upstream."""
    chain = (question if question.startswith(ORIGINAL_QUESTION_LABEL)
             else f"{ORIGINAL_QUESTION_LABEL} {question}")
    return f"{chain}\n{ANSWER_LABEL} {answer}"


def follow_up(question, answer, asked) -> str:
    """The question text a follow-up on a stored chat is sent as: the chat's conversation so far,
    then the new question under its own label."""
    return f"{conversation(question, answer)}\n{FOLLOW_UP_LABEL} {asked}"


def append(table, sub, question, answer, sources, at=None, app=False):
    """Stores one answered chat for the user, stamped now (UTC), and returns that stamp — the
    chat's identity for a later delete or follow-up. With `at`, one transaction replaces the
    named chat with the fresh-stamped one, so the chat cannot be lost or doubled between the
    two writes; naming a missing chat raises KeyError rather than resurrecting a deleted one.

    `app` marks a chat the app itself wrote; a follow-up writes the item whole, so it has to
    re-state the mark. The replaced chat's visibility is read off it and carried over."""
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
    replaced = table.get_item(Key={"pk": sub, "sk": at})
    if "Item" not in replaced:
        raise KeyError(at)
    if "visibility" in replaced["Item"]:
        item["visibility"] = replaced["Item"]["visibility"]
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


def find(table, sub, title) -> str | None:
    """The stamp of the user's chat opened under title — stored as that question, or since
    answered as the original question of a follow-up on it — or None when the transcript holds
    none. The oldest such chat when the transcript holds several."""
    opening = f"{ORIGINAL_QUESTION_LABEL} {title}\n"
    for item in query_all(table, KeyConditionExpression=Key("pk").eq(sub)):
        if item["question"] == title or item["question"].startswith(opening):
            return item["sk"]
    return None


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
    _update_own(table, sub, at,
                UpdateExpression=("SET #question = :question, #answer = :answer, "
                                  "#sources = :sources, #summarized = :summarized"),
                ExpressionAttributeNames={"#question": "question", "#answer": "answer",
                                          "#sources": "sources", "#summarized": "summarized"},
                ExpressionAttributeValues={":question": question, ":answer": summary,
                                           ":sources": "[]", ":summarized": True})


def set_visibility(table, sub, at, visibility):
    """Shares the user's chat at the given timestamp under the named visibility; raises
    KeyError when the user holds no such chat."""
    _update_own(table, sub, at, UpdateExpression="SET #visibility = :visibility",
                ExpressionAttributeNames={"#visibility": "visibility"},
                ExpressionAttributeValues={":visibility": visibility})


def clear_visibility(table, sub, at):
    """Makes the user's chat at the given timestamp private again, which drops it from the
    visibility index; raises KeyError when the user holds no such chat."""
    _update_own(table, sub, at, UpdateExpression="REMOVE #visibility",
                ExpressionAttributeNames={"#visibility": "visibility"})


def _update_own(table, sub, at, **update):
    """One update conditioned on the user holding the chat, so another user's timestamp raises
    KeyError instead of creating an item under the caller's key."""
    try:
        table.update_item(Key={"pk": sub, "sk": at}, ConditionExpression="attribute_exists(pk)",
                          **update)
    except table.meta.client.exceptions.ConditionalCheckFailedException:
        raise KeyError(at)


def public(table, reader_sub) -> list:
    """Every chat other users shared as public, newest first, each with its asker's sub."""
    items = query_all(table, IndexName=VISIBILITY_INDEX,
                      KeyConditionExpression=Key("visibility").eq(PUBLIC),
                      ScanIndexForward=False)
    return [{"sub": item["pk"], **_turn(item)} for item in items if item["pk"] != reader_sub]


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


def count_app(table, sub) -> int:
    """The chats of the user's transcript that the app wrote, counted inside DynamoDB."""
    return _count(table, Key("pk").eq(sub), FilterExpression=Attr("app").exists())


def count_public(table, reader_sub) -> int:
    """The chats other users shared as public, counted inside DynamoDB on the visibility index."""
    return _count(table, Key("visibility").eq(PUBLIC), IndexName=VISIBILITY_INDEX,
                  FilterExpression=Attr("pk").ne(reader_sub))


def _count(table, key_condition, **query) -> int:
    return table.query(Select="COUNT", KeyConditionExpression=key_condition, **query)["Count"]


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
        # Absent on a private chat.
        "visibility": item["visibility"] if "visibility" in item else None,
        "at": item["sk"],
    }
