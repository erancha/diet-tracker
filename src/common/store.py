"""DynamoDB access across the three app tables — days, meals, and nudge state — each holding one
kind of item under plain keys (pk = user sub). Numbers cross the boundary as float/int in app
code and as Decimal inside DynamoDB; the conversion lives here and nowhere else."""

import secrets
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key


def _to_dynamo(value):
    return Decimal(str(value)) if isinstance(value, float) else value


def _from_dynamo(value):
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    return value


class Store:
    def __init__(self, days_table, meals_table, state_table, dynamodb=None):
        resource = dynamodb or boto3.resource("dynamodb")
        self._days = resource.Table(days_table)
        self._meals = resource.Table(meals_table)
        self._state = resource.Table(state_table)

    def put_day(self, user_sub, day, answers, version, submitted_at) -> None:
        self._days.put_item(Item={
            "pk": user_sub, "sk": day,
            "answers": {k: _to_dynamo(v) for k, v in answers.items()},
            "questionnaire_version": version, "submitted_at": submitted_at,
        })

    def delete_day(self, user_sub, day) -> None:
        """Removes the day's record; raises KeyError when the user has no record for that day."""
        try:
            self._days.delete_item(Key={"pk": user_sub, "sk": day},
                                   ConditionExpression="attribute_exists(pk)")
        except self._days.meta.client.exceptions.ConditionalCheckFailedException:
            raise KeyError(day)

    def has_day(self, user_sub, day) -> bool:
        return "Item" in self._days.get_item(Key={"pk": user_sub, "sk": day})

    def get_days_range(self, user_sub, start_day, end_day) -> dict:
        response = self._days.query(
            KeyConditionExpression=Key("pk").eq(user_sub) & Key("sk").between(start_day, end_day))
        return {item["sk"]: {k: _from_dynamo(v) for k, v in item["answers"].items()}
                for item in response["Items"]}

    def add_meal(self, user_sub, day, at, carbs_choice, vegetables, fruit) -> str:
        # Time-of-day prefix keeps sort-key order chronological; the random suffix separates
        # same-second reports.
        meal_id = f"{at[11:19]}-{secrets.token_hex(3)}"
        self._meals.put_item(Item={
            "pk": user_sub, "sk": f"{day}#{meal_id}",
            "at": at, "carbs_choice": carbs_choice, "vegetables": vegetables, "fruit": fruit,
        })
        return meal_id

    def get_meals(self, user_sub, day) -> list:
        response = self._meals.query(
            KeyConditionExpression=Key("pk").eq(user_sub) & Key("sk").begins_with(f"{day}#"))
        # Meals recorded before the fruit flag existed legally lack the attribute.
        return [{"id": item["sk"].split("#", 1)[1], "at": item["at"],
                 "carbs_choice": item["carbs_choice"], "vegetables": item["vegetables"],
                 "fruit": item.get("fruit", False)}
                for item in response["Items"]]

    def delete_meal(self, user_sub, day, meal_id) -> None:
        """Removes one meal; raises KeyError when no such meal exists."""
        try:
            self._meals.delete_item(Key={"pk": user_sub, "sk": f"{day}#{meal_id}"},
                                    ConditionExpression="attribute_exists(pk)")
        except self._meals.meta.client.exceptions.ConditionalCheckFailedException:
            raise KeyError(meal_id)

    def get_nudge_state(self, user_sub) -> dict:
        response = self._state.get_item(Key={"pk": user_sub})
        if "Item" not in response:
            # A user who has never been alerted is a legal initial state.
            return {"rules": {}}
        return response["Item"]["state"]

    def put_nudge_state(self, user_sub, state) -> None:
        self._state.put_item(Item={"pk": user_sub, "state": state})
