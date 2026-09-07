"""Reading a whole query result across the pages a table hands it back in — shared by the
per-user records that sit outside Store: the chat transcript and the kept undelivered messages."""


def query_all(table, **query) -> list:
    """Every item a key query selects, following the pagination cursor to the end. Reading the
    first page and stopping would drop the rest silently, which in a user's own records reads as
    content that was deleted."""
    collected = []
    while True:
        page = table.query(**query)
        collected.extend(page["Items"])
        if "LastEvaluatedKey" not in page:
            return collected
        query["ExclusiveStartKey"] = page["LastEvaluatedKey"]
