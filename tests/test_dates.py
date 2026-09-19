import re

from common import dates
from common.dates import clock_time, closing_day, days_before, meal_day, now_iso, today


def test_today_is_iso_date():
    assert re.fullmatch(r"\d{4}-\d{2}-\d{2}", today())


def test_now_iso_carries_jerusalem_offset():
    assert now_iso().endswith(("+02:00", "+03:00"))


def test_clock_time_is_a_wall_clock_hour_and_minute():
    assert re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", clock_time())


def test_days_before():
    assert days_before("2026-08-18", 30) == "2026-07-19"
    assert days_before("2026-01-01", 1) == "2025-12-31"


def test_closing_day_is_yesterday_until_the_bound_and_today_from_then_on(monkeypatch):
    monkeypatch.setattr(dates, "clock_time", lambda: "01:59")
    assert closing_day("02:00") == days_before(today(), 1)
    monkeypatch.setattr(dates, "clock_time", lambda: "02:00")
    assert closing_day("02:00") == today()


def test_meal_day_is_the_day_a_small_hours_meal_ran_out_of():
    assert meal_day("2026-09-20T00:30:00+03:00", "02:00") == "2026-09-19"
    assert meal_day("2026-09-20T01:59:00+03:00", "02:00") == "2026-09-19"
    assert meal_day("2026-09-20T02:00:00+03:00", "02:00") == "2026-09-20"
    assert meal_day("2026-09-20T13:30:00+03:00", "02:00") == "2026-09-20"
    assert meal_day("2026-01-01T00:30:00+02:00", "02:00") == "2025-12-31"
