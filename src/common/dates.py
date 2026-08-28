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
