import re

from common.dates import clock_time, days_before, now_iso, today


def test_today_is_iso_date():
    assert re.fullmatch(r"\d{4}-\d{2}-\d{2}", today())


def test_now_iso_carries_jerusalem_offset():
    assert now_iso().endswith(("+02:00", "+03:00"))


def test_clock_time_is_a_wall_clock_hour_and_minute():
    assert re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", clock_time())


def test_days_before():
    assert days_before("2026-08-18", 30) == "2026-07-19"
    assert days_before("2026-01-01", 1) == "2025-12-31"
