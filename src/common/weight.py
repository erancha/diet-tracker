"""The weight log's domain vocabulary: what counts as a recordable weight, and what the weekly
weigh-in reminder says.

Weight is measured, not scored. It enters no day derivation, no questionnaire floor, and no
threshold alert, so this module holds no evaluation — only the check against the configured bounds
and the text the reminder carries."""

from common.notify import APP_NAME

REMINDER_SUBJECT = f"שקילה שבועית — {APP_NAME}"
REMINDER_TEXT = "זמן לשקילה השבועית ⚖️ אפשר לרשום את המשקל באפליקציה"


def rejection(kg, limits) -> str | None:
    """Why this value cannot be stored as a weight, or None when it can. bool is an int subtype
    and is never a legal weight."""
    if isinstance(kg, bool) or not isinstance(kg, (int, float)):
        return "kg must be a number"
    if not limits.min_kg <= kg <= limits.max_kg:
        return f"kg ({kg:g}) must be between {limits.min_kg:g} and {limits.max_kg:g}"
    return None
