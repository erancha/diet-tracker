"""Messages SES refused to deliver, kept per user so the app can show what never reached them.

One DynamoDB item per refused message — its subject and body under the partition key of the
recipient's sub and the sort key of the UTC ISO timestamp it was refused at, so a key-ordered
query reads the newest first. Nothing expires an item: a message leaves only when the user
dismisses it, because a notice that disappeared unread would restore the very silence this
store exists to break."""

from datetime import datetime, timezone

from boto3.dynamodb.conditions import Key

from common.paging import query_all


def record(table, sub, subject, body) -> str:
    """Keeps one refused message for the user, stamped now (UTC), and returns that stamp — the
    message's identity for a later dismissal."""
    at = datetime.now(timezone.utc).isoformat()
    table.put_item(Item={"pk": sub, "sk": at, "subject": subject, "body": body})
    return at


def messages(table, sub) -> list:
    """Every refused message still kept for the user, newest first."""
    return [{"at": item["sk"], "subject": item["subject"], "body": item["body"]}
            for item in query_all(table, KeyConditionExpression=Key("pk").eq(sub),
                                  ScanIndexForward=False)]


def dismiss(table, sub, at) -> None:
    """Permanently removes one kept message; raises KeyError when the user holds none under that
    timestamp — including one that exists only for another user."""
    try:
        table.delete_item(Key={"pk": sub, "sk": at},
                          ConditionExpression="attribute_exists(pk)")
    except table.meta.client.exceptions.ConditionalCheckFailedException:
        raise KeyError(at)
