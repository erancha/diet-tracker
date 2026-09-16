"""Calendar arithmetic pinned to Asia/Jerusalem — the "day" a submission belongs to is the
user's local day, regardless of the Lambda's UTC clock."""

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

TZ = ZoneInfo("Asia/Jerusalem")


def today() -> str:
    return datetime.now(TZ).date().isoformat()


def now_iso() -> str:
    return datetime.now(TZ).isoformat(timespec="seconds")


def clock_time() -> str:
    """Wall-clock "HH:MM" — the time-of-day half of a moment whose date is already known from the
    key it is stored under."""
    return datetime.now(TZ).strftime("%H:%M")


def days_before(day: str, n: int) -> str:
    return (date.fromisoformat(day) - timedelta(days=n)).isoformat()


def closing_day(until: str) -> str:
    """The day still open to closing: yesterday while the clock sits before the small-hours
    "HH:MM" bound the day-close config sets, today from then on."""
    day = today()
    return days_before(day, 1) if clock_time() < until else day
