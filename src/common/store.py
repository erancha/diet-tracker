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

# Grades that priced as light — merged rather than summed, no helping recorded — under every
# questionnaire version that wrote second sources in the flag shape. Frozen ids, like
# _RETIRED_GRADES: they describe records already written, not the current config's boundary.
_LEGACY_LIGHT_SECOND_GRADES = frozenset({"carb_grade_1", "carb_grade_2"})

# The attributes one stored meal carries beside its keys. Named once so the record written and the
# API body it is projected from cannot drift apart.
MEAL_ATTRIBUTES = ("at", "carbs_choice", "vegetables", "fruit", "additions", "small_portion",
                   "second_source")

# Sort key of the weights table's target item. It sorts past every ISO date, keeping the single
# target and the dated measurements in one key space without a date range ever returning it.
TARGET_KEY = "target"


def _current_grade(choice, additions) -> tuple:
    """One recorded grade as the current questionnaire expresses it, with the addition making up
    the difference — where the retirement declares one — folded into the meal's additions."""
    if choice not in _RETIRED_GRADES:
        return choice, additions
    choice, addition = _RETIRED_GRADES[choice]
    return choice, additions if addition is None else [*additions, addition]


def _meal_from_item(item) -> dict:
    """One stored meal in the shape the app reads it.

    Meals recorded before an attribute existed legally lack it: meals predate the fruit flag,
    predate the small-portion flag in turn, and predate the second carb source after that, while
    additions supersede the boolean sweet flag, so a legacy sweet meal reads as a single sweet
    addition. A meal recorded under a grade the questionnaire has since retired reads as its
    current equivalent — either of its sources — so nothing downstream is handed an id the config
    no longer knows.

    A second source recorded before helpings carried a small-portion flag instead of a portion
    id. Such a record reads under the current contract: a light second grade carries no portion,
    and a heavier one reads as the half helping — the flagged helping was exactly that, and a
    full helping has no expression anymore, so half is the nearest the contract still speaks."""
    additions = item.get("additions", ["sweet"] if item.get("sweet", False) else [])
    carbs_choice, additions = _current_grade(item["carbs_choice"], additions)
    second = item.get("second_source")
    if second is not None:
        second_choice, additions = _current_grade(second["carbs_choice"], additions)
        if "portion" in second:
            portion = second["portion"]
        else:
            portion = None if second_choice in _LEGACY_LIGHT_SECOND_GRADES else "half"
        second = {"carbs_choice": second_choice, "portion": portion}
    return {"id": item["sk"].split("#", 1)[1], "at": item["at"], "carbs_choice": carbs_choice,
            "vegetables": item["vegetables"], "fruit": item.get("fruit", False),
            "additions": additions, "small_portion": item.get("small_portion", False),
            "second_source": second}


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

    def count_days_range(self, user_sub, start_day, end_day) -> int:
        """Recorded days across the inclusive range, counted inside DynamoDB so record content
        never leaves the table."""
        return self._count(self._days, Key("pk").eq(user_sub)
                           & Key("sk").between(start_day, end_day))

    def count_meals_range(self, user_sub, start_day, end_day) -> int:
        """Recorded meals across the inclusive day range, counted inside DynamoDB. Meal sort keys
        are '{day}#{id}', so the upper bound closes past every id of the range's last day."""
        return self._count(self._meals, Key("pk").eq(user_sub)
                           & Key("sk").between(f"{start_day}#", f"{end_day}#\xff"))

    @staticmethod
    def _count(table, key_condition) -> int:
        return table.query(Select="COUNT", KeyConditionExpression=key_condition)["Count"]

    def add_meal(self, user_sub, day, meal) -> str:
        """Stores one meal, returning its id. The meal is a mapping over MEAL_ATTRIBUTES, which is
        also the shape the API validates a request body into: projecting through that tuple keeps
        anything else a caller happens to carry out of the record."""
        # Time-of-day prefix keeps sort-key order chronological; the random suffix separates
        # same-second reports.
        meal_id = f"{meal['at'][11:19]}-{secrets.token_hex(3)}"
        self._meals.put_item(Item={
            "pk": user_sub, "sk": f"{day}#{meal_id}",
            **{name: meal[name] for name in MEAL_ATTRIBUTES},
        })
        return meal_id

    def get_meals(self, user_sub, day) -> list:
        response = self._meals.query(
            KeyConditionExpression=Key("pk").eq(user_sub) & Key("sk").begins_with(f"{day}#"))
        return [_meal_from_item(item) for item in response["Items"]]

    def replace_meal(self, user_sub, day, meal_id, meal) -> str:
        """Rewrites one meal wholesale, returning its new id; raises KeyError when no such meal
        exists. The id carries the meal's time to keep the sort key chronological, so a corrected
        time necessarily moves the meal to a new id. The replacement is written before the
        original is removed: an interrupted correction leaves a duplicate the user can delete,
        never a meal that silently disappeared."""
        if "Item" not in self._meals.get_item(Key={"pk": user_sub, "sk": f"{day}#{meal_id}"}):
            raise KeyError(meal_id)
        new_id = self.add_meal(user_sub, day, meal)
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
        """The user's notification state: which rules have already been alerted for, and whether
        the account has opted out of being notified at all.

        State written before the opt-out existed legally carries no flag and reads as subscribed,
        the same allowance the meal and weight attributes above are read under. Defaulting it here
        rather than at each call site is what lets every reader index the key directly."""
        response = self._state.get_item(Key={"pk": user_sub})
        if "Item" not in response:
            # A user who has never been alerted is a legal initial state.
            return {"rules": {}, "muted": False}
        return {"muted": False, **response["Item"]["state"]}

    def put_nudge_state(self, user_sub, state) -> None:
        self._state.put_item(Item={"pk": user_sub, "state": state})

    def set_muted(self, user_sub, muted) -> None:
        """Sets the account's notification opt-out, keeping the alert record beside it so muting
        and unmuting never rewrite which days were already alerted for."""
        self.put_nudge_state(user_sub, {**self.get_nudge_state(user_sub), "muted": muted})

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
