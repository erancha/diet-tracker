"""Copies one user's recorded data between deployed stacks, to rehearse the app at a larger user
count in an isolated stack pair. Run through scripts/clone-user-data.sh.

- mirror: the production account's rows land under the same address's account in the target
  stack, replacing whatever that account held there.
- fictive: that target-stack account's rows are copied to accounts created directly in the
  target pool as fictive-NNN@example.invalid. Shared chats stay shared, so the shared-chat list
  grows with the user count; each copy's notifications are muted.
- delete: removes every fictive account from the target pool together with its rows.

Every write goes to the target stack; production is only ever read.
"""

import argparse
from dataclasses import dataclass

import boto3
from boto3.dynamodb.conditions import Key

from common.paging import query_all
from common.store import Store

PRODUCTION_APP = "diet-tracker"

# pk/sk tables holding a user's rows under pk = sub. The chat quota table is left out: its rows
# are per-day counters that expire on their own, and a copied one would only cap the target's
# questions for the day.
ROW_TABLES = ("DaysTable", "MealsTable", "WeightsTable", "ChatHistoryTable", "UndeliveredTable")
# A fictive account gets no refused-email messages: those belong to the real address.
FICTIVE_ROW_TABLES = tuple(t for t in ROW_TABLES if t != "UndeliveredTable")
STATE_TABLE = "NudgeStateTable"
FICTIVE_PREFIX = "fictive-"
FICTIVE_DOMAIN = "example.invalid"


@dataclass(frozen=True)
class Stack:
    """One deployed stack pair's user tables, its Store over them, and its Cognito pool."""

    tables: dict  # logical id → boto3 Table, the row tables and the nudge-state table
    store: Store
    pool_id: str
    cognito: object

    @classmethod
    def resolve(cls, app):
        cloudformation = boto3.client("cloudformation")
        dynamodb = boto3.resource("dynamodb")

        def physical(logical):
            return cloudformation.describe_stack_resources(
                StackName=app, LogicalResourceId=logical)["StackResources"][0]["PhysicalResourceId"]

        names = {logical: physical(logical) for logical in ROW_TABLES + (STATE_TABLE,)}
        outputs = cloudformation.describe_stacks(StackName=f"{app}-cognito")["Stacks"][0]["Outputs"]
        (pool_id,) = [o["OutputValue"] for o in outputs if o["OutputKey"] == "UserPoolId"]
        return cls(tables={logical: dynamodb.Table(name) for logical, name in names.items()},
                   store=Store(names["DaysTable"], names["MealsTable"], names[STATE_TABLE],
                               names["WeightsTable"], dynamodb=dynamodb),
                   pool_id=pool_id, cognito=boto3.client("cognito-idp"))


def _sub(attributes):
    (sub,) = [a["Value"] for a in attributes if a["Name"] == "sub"]
    return sub


def sub_of(stack, email):
    """The sub of the one account the pool holds for email; anything else is an error."""
    found = stack.cognito.list_users(UserPoolId=stack.pool_id,
                                     Filter=f'email = "{email}"')["Users"]
    if len(found) != 1:
        raise LookupError(f"{len(found)} accounts for {email} in pool {stack.pool_id}")
    return _sub(found[0]["Attributes"])


def rows(table, sub):
    """Every row sub holds in table."""
    return query_all(table, KeyConditionExpression=Key("pk").eq(sub))


def replace_rows(table, sub, items):
    """Makes items, re-keyed under sub, the whole of sub's rows in table."""
    with table.batch_writer() as batch:
        for item in rows(table, sub):
            batch.delete_item(Key={"pk": item["pk"], "sk": item["sk"]})
    with table.batch_writer() as batch:
        for item in items:
            batch.put_item(Item={**item, "pk": sub})


def mirror(source, target, email):
    """Replaces email's rows in target with its rows in source, nudge state included."""
    source_sub, target_sub = sub_of(source, email), sub_of(target, email)
    for logical in ROW_TABLES:
        items = rows(source.tables[logical], source_sub)
        replace_rows(target.tables[logical], target_sub, items)
        print(f"  {logical}: {len(items)} item(s)")
    target.store.put_nudge_state(target_sub, source.store.get_nudge_state(source_sub))
    print(f"  {STATE_TABLE}: copied")


def fictive_email(n):
    return f"{FICTIVE_PREFIX}{n:03}@{FICTIVE_DOMAIN}"


def _ensure_account(stack, n):
    """The sub of fictive account n, creating it when the pool lacks it. Creation sends nothing:
    Cognito's invitation is suppressed and the sign-up trigger passes operator-made accounts."""
    username = f"{FICTIVE_PREFIX}{n:03}"
    try:
        return _sub(stack.cognito.admin_get_user(
            UserPoolId=stack.pool_id, Username=username)["UserAttributes"])
    except stack.cognito.exceptions.UserNotFoundException:
        created = stack.cognito.admin_create_user(
            UserPoolId=stack.pool_id, Username=username, MessageAction="SUPPRESS",
            UserAttributes=[{"Name": "email", "Value": fictive_email(n)},
                            {"Name": "email_verified", "Value": "true"}])
        return _sub(created["User"]["Attributes"])


def fictive(stack, email, count):
    """Gives each of count fictive accounts a copy of email's rows, muted."""
    source_sub = sub_of(stack, email)
    source = {logical: rows(stack.tables[logical], source_sub) for logical in FICTIVE_ROW_TABLES}
    print("  per account: " + ", ".join(f"{t} {len(items)}" for t, items in source.items()))
    for n in range(1, count + 1):
        sub = _ensure_account(stack, n)
        for logical, items in source.items():
            replace_rows(stack.tables[logical], sub, items)
        stack.store.put_nudge_state(sub, {"muted": True})
        print(f"  {fictive_email(n)}")


def delete_fictive(stack):
    """Removes every fictive account from the pool, with its rows and nudge state."""
    pages = stack.cognito.get_paginator("list_users").paginate(
        UserPoolId=stack.pool_id, Filter=f'email ^= "{FICTIVE_PREFIX}"')
    accounts = [user for page in pages for user in page["Users"]]
    for user in accounts:
        sub = _sub(user["Attributes"])
        for logical in ROW_TABLES:
            replace_rows(stack.tables[logical], sub, [])
        stack.tables[STATE_TABLE].delete_item(Key={"pk": sub})
        stack.cognito.admin_delete_user(UserPoolId=stack.pool_id, Username=user["Username"])
    print(f"  {len(accounts)} fictive account(s) deleted")


def main():
    """Parses the action and the target stack suffix, then runs the action against it."""
    parser = argparse.ArgumentParser(prog="clone-user-data.sh")
    parser.add_argument("action", choices=("mirror", "fictive", "delete"))
    parser.add_argument("email", nargs="?")
    parser.add_argument("--count", type=int, default=100)
    parser.add_argument("--env", required=True,
                        help="suffix of the target stack pair, as deploy.sh takes it")
    args = parser.parse_args()
    if args.action != "delete" and args.email is None:
        parser.error(f"{args.action} needs an email")
    target = Stack.resolve(f"{PRODUCTION_APP}-{args.env}")
    if args.action == "mirror":
        mirror(Stack.resolve(PRODUCTION_APP), target, args.email.lower())
    elif args.action == "fictive":
        fictive(target, args.email.lower(), args.count)
    else:
        delete_fictive(target)


if __name__ == "__main__":
    main()
