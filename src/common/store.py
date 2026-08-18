"""Single-table DynamoDB access for answers and nudge state.

All of a user's data lives under one partition key derived from their Cognito sub, so history
is a single key-range query and users cannot address each other's items. The state item's sort
key "STATE#NUDGE" sorts after every "YYYY-MM-DD" value, keeping date-range queries clean.
"""

import boto3
from boto3.dynamodb.conditions import Key

STATE_SK = "STATE#NUDGE"


class Store:
    def __init__(self, table_name: str, dynamodb=None):
        self._table = (dynamodb or boto3.resource("dynamodb")).Table(table_name)

    @staticmethod
    def _pk(user_sub: str) -> str:
        return f"USER#{user_sub}"

    def put_answers(self, user_sub, day, answers, version, submitted_at) -> None:
        self._table.put_item(Item={
            "pk": self._pk(user_sub), "sk": day,
            "answers": answers, "questionnaire_version": version, "submitted_at": submitted_at,
        })

    def has_answers(self, user_sub, day) -> bool:
        return "Item" in self._table.get_item(Key={"pk": self._pk(user_sub), "sk": day})

    def get_answers_range(self, user_sub, start_day, end_day) -> dict:
        response = self._table.query(
            KeyConditionExpression=Key("pk").eq(self._pk(user_sub)) & Key("sk").between(start_day, end_day)
        )
        return {item["sk"]: dict(item["answers"]) for item in response["Items"]}

    def get_nudge_state(self, user_sub) -> dict:
        response = self._table.get_item(Key={"pk": self._pk(user_sub), "sk": STATE_SK})
        if "Item" not in response:
            # A user who has never been alerted is a legal initial state.
            return {"rules": {}}
        return response["Item"]["state"]

    def put_nudge_state(self, user_sub, state) -> None:
        self._table.put_item(Item={"pk": self._pk(user_sub), "sk": STATE_SK, "state": state})
