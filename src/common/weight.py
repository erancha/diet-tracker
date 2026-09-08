"""The weight log's domain vocabulary: what counts as a recordable weight, what the weekly
weigh-in reminder says, and how measurements reach an answering LLM.

Weight is measured, not scored. It enters no day derivation, no questionnaire floor, and no
threshold alert, so this module holds no evaluation — only the check against the configured bounds,
the text the reminder carries, and the labeled block both LLM-facing senders share."""

from common.notify import APP_NAME

REMINDER_SUBJECT = f"שקילה שבועית — {APP_NAME}"
REMINDER_TEXT = "זמן לשקילה השבועית ⚖️ אפשר לרשום את המשקל באפליקציה"

# The heading the weight block rides under wherever tracked data is labeled for the answering LLM.
LABEL = "משקל"

# Weigh-ins are weekly, so a trend needs the last few measurements rather than one window's worth.
MEASUREMENTS = 5


def measurements_block(weights, target) -> dict:
    """The latest measurements as bare day-to-kg pairs, beside the target weight when one is set.
    An unset target is a legal quiet state and is omitted rather than sent as a null."""
    block = {"מדידות": {day: weights[day]["kg"] for day in sorted(weights)[-MEASUREMENTS:]}}
    if target is not None:
        block["יעד"] = target
    return block


def rejection(kg, limits) -> str | None:
    """Why this value cannot be stored as a weight, or None when it can. bool is an int subtype
    and is never a legal weight."""
    if isinstance(kg, bool) or not isinstance(kg, (int, float)):
        return "kg must be a number"
    if not limits.min_kg <= kg <= limits.max_kg:
        return f"kg ({kg:g}) must be between {limits.min_kg:g} and {limits.max_kg:g}"
    return None
