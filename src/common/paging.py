"""Reading a whole query result across the pages a table hands it back in."""


def _pages(table, **query):
    """Every page a key query returns, following the pagination cursor to the end. Reading the
    first page and stopping would drop the rest silently, which in a user's own records reads as
    content that was deleted."""
    while True:
        page = table.query(**query)
        yield page
        if "LastEvaluatedKey" not in page:
            return
        query["ExclusiveStartKey"] = page["LastEvaluatedKey"]


def query_all(table, **query) -> list:
    """Every item a key query selects, across all its pages."""
    return [item for page in _pages(table, **query) for item in page["Items"]]


def count_all(table, **query) -> int:
    """How many items a key query selects, counted inside DynamoDB across all its pages."""
    return sum(page["Count"] for page in _pages(table, Select="COUNT", **query))
