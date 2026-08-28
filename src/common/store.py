"""DynamoDB access across the four app tables — days, meals, nudge state, and weights — each
holding one kind of item under plain keys (pk = user sub). Numbers cross the boundary as
float/int in app code and as Decimal inside DynamoDB; the conversion lives here and nowhere
else."""

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


# Carb grades the questionnaire has retired, each mapped to the grade that now expresses it and
# the addition, if any, making up the difference — so a stored meal recorded under a retired id is
# still readable and a re-derived day keeps its score. Empty because the meals recorded under the
# grades retired so far were rewritten to the current ids in the table itself; an id retired from
# here on has a home again without one.
_RETIRED_GRADES: dict[str, tuple[str, str | None]] = {}

# Sort key of the weights table's target item. It sorts past every ISO date, keeping the single
# target and the dated measurements in one key space without a date range ever returning it.
TARGET_KEY = "target"


def _meal_from_item(item) -> dict:
    """One stored meal in the shape the app reads it.

    Meals recorded before an attribute existed legally lack it: meals predate the fruit flag, and
    predate the small-portion flag in turn, while additions supersede the boolean sweet flag, so a
    legacy sweet meal reads as a single sweet addition. A meal recorded under a grade the
    questionnaire has since retired reads as its current equivalent, so nothing downstream is
    handed an id the config no longer knows."""
    carbs_choice = item["carbs_choice"]
    additions = item.get("additions", ["sweet"] if item.get("sweet", False) else [])
    if carbs_choice in _RETIRED_GRADES:
        carbs_choice, addition = _RETIRED_GRADES[carbs_choice]
        if addition is not None:
            additions = [*additions, addition]
    return {"id": item["sk"].split("#", 1)[1], "at": item["at"], "carbs_choice": carbs_choice,
            "vegetables": item["vegetables"], "fruit": item.get("fruit", False),
            "additions": additions, "small_portion": item.get("small_portion", False)}


def _weights_by_day(items) -> dict:
    """Stored weights in the shape the app reads them, keyed by day.

    Weights predate the clock time, so an item recorded before it existed legally carries none and
    reads as at=None — the same allowance the meal attributes above are read under."""
    return {item["sk"]: {"kg": _from_dynamo(item["kg"]), "at": item.get("at")}
            for item in items}


class Store:
    def __init__(self, days_table, meals_table, state_table, weights_table, dynamodb=None):
        resource = dynamodb or boto3.resource("dynamodb")
        self._days = resource.Table(days_table)
        self._meals = resource.Table(meals_table)
        self._state = resource.Table(state_table)
        self._weights = resource.Table(weights_table)

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

    def add_meal(self, user_sub, day, at, carbs_choice, vegetables, fruit, additions,
                 small_portion) -> str:
        # Time-of-day prefix keeps sort-key order chronological; the random suffix separates
        # same-second reports.
        meal_id = f"{at[11:19]}-{secrets.token_hex(3)}"
        self._meals.put_item(Item={
            "pk": user_sub, "sk": f"{day}#{meal_id}",
            "at": at, "carbs_choice": carbs_choice, "vegetables": vegetables, "fruit": fruit,
            "additions": additions, "small_portion": small_portion,
        })
        return meal_id

    def get_meals(self, user_sub, day) -> list:
        response = self._meals.query(
            KeyConditionExpression=Key("pk").eq(user_sub) & Key("sk").begins_with(f"{day}#"))
        return [_meal_from_item(item) for item in response["Items"]]

    def replace_meal(self, user_sub, day, meal_id, at, carbs_choice, vegetables, fruit,
                     additions, small_portion) -> str:
        """Rewrites one meal wholesale, returning its new id; raises KeyError when no such meal
        exists. The id carries the meal's time to keep the sort key chronological, so a corrected
        time necessarily moves the meal to a new id. The replacement is written before the
        original is removed: an interrupted correction leaves a duplicate the user can delete,
        never a meal that silently disappeared."""
        if "Item" not in self._meals.get_item(Key={"pk": user_sub, "sk": f"{day}#{meal_id}"}):
            raise KeyError(meal_id)
        new_id = self.add_meal(user_sub, day, at, carbs_choice, vegetables, fruit, additions,
                               small_portion)
        self.delete_meal(user_sub, day, meal_id)
        return new_id

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

    def put_weight(self, user_sub, day, kg, at) -> None:
        """Records the day's weight and the wall-clock "HH:MM" it was taken at, replacing whatever
        the day held — re-recording is how a mistyped value is corrected. The date lives in the
        sort key, so the item keeps the time of day alone rather than a second copy of the day."""
        self._weights.put_item(
            Item={"pk": user_sub, "sk": day, "kg": _to_dynamo(kg), "at": at})

    def delete_weight(self, user_sub, day) -> None:
        """Removes the day's weight; raises KeyError when that day holds none."""
        try:
            self._weights.delete_item(Key={"pk": user_sub, "sk": day},
                                      ConditionExpression="attribute_exists(pk)")
        except self._weights.meta.client.exceptions.ConditionalCheckFailedException:
            raise KeyError(day)

    def get_weights(self, user_sub) -> dict:
        """Every weight the user has recorded, by day. The target sorts past every ISO date, so
        bounding the query below it selects the measurements alone."""
        response = self._weights.query(
            KeyConditionExpression=Key("pk").eq(user_sub) & Key("sk").lt(TARGET_KEY))
        return _weights_by_day(response["Items"])

    def get_weights_range(self, user_sub, start_day, end_day) -> dict:
        """Recorded weights by day across the inclusive range."""
        response = self._weights.query(
            KeyConditionExpression=Key("pk").eq(user_sub) & Key("sk").between(start_day, end_day))
        return _weights_by_day(response["Items"])

    def get_target(self, user_sub):
        """The user's target weight, or None when they have never set one."""
        response = self._weights.get_item(Key={"pk": user_sub, "sk": TARGET_KEY})
        if "Item" not in response:
            return None
        return _from_dynamo(response["Item"]["kg"])

    def put_target(self, user_sub, kg) -> None:
        self._weights.put_item(Item={"pk": user_sub, "sk": TARGET_KEY, "kg": _to_dynamo(kg)})
