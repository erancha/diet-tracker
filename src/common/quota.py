"""Per-user daily chat allowance: one DynamoDB item per user per day, keyed '{sub}#{day}'.

The day inside the key replaces reset logic — there is no stored day to compare and no
first-message-of-the-day branch. A single atomic ADD both creates the item and counts against
it, so concurrent requests cannot lose one another's writes, and the TTL attribute lets
DynamoDB delete yesterday's rows on its own."""

import time

SECONDS_IN_DAY = 86400


def consume(table, sub, day) -> int:
    """Counts one message against the user's day and returns the new count. The caller compares
    the returned count to the limit, so the request that crosses the line is refused before any
    money is spent. Expiry is stamped on every write, two days out so the running day's item
    never expires mid-day."""
    response = table.update_item(
        Key={"pk": f"{sub}#{day}"},
        UpdateExpression="SET expires_at = :expires ADD #c :one",
        ExpressionAttributeNames={"#c": "count"},
        ExpressionAttributeValues={":one": 1, ":expires": int(time.time()) + 2 * SECONDS_IN_DAY},
        ReturnValues="ALL_NEW",
    )
    return int(response["Attributes"]["count"])
