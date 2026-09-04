"""Loads config/app.json — the app's single versioned config, holding the questionnaire alongside
the weight settings, and read by the API Lambda, the nudge jobs, and the frontend alike.

Every value the file declares is required. A malformed config is a deployment fault that must
surface at load, before the first schedule fires or the first request is served."""

import json
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from common.questionnaire import Questionnaire, parse

# EventBridge Scheduler's day-of-week tokens; the weigh-in schedule's cron expression is built
# from the configured one at deploy time.
WEEKDAYS = ("SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT")

# Spans the weight chart's range selector offers, in months. None is the whole series. The
# configured opening span must name one of them, or the chart would open on a range the reader
# has no control to return to.
CHART_SPANS = (1, 3, 6, 12, None)


@dataclass(frozen=True)
class WeighIn:
    """When the weekly weigh-in reminder fires, in Asia/Jerusalem."""
    weekday: str
    hour: int


@dataclass(frozen=True)
class Limits:
    """Kilogram bounds a recorded weight must fall within — wide enough to admit any real user,
    narrow enough that a misplaced decimal point is rejected at the edge instead of flattening the
    chart's scale for good. Declared in the config so the API and the frontend's input constrain
    the same range without either restating it."""
    min_kg: float
    max_kg: float


@dataclass(frozen=True)
class WeightConfig:
    weigh_in: WeighIn
    # Months the chart opens on; one of CHART_SPANS.
    chart_months: int
    limits: Limits


@dataclass(frozen=True)
class MealsConfig:
    """Ceiling on the meals one day may hold. Declared in the config so the API's rejection and
    the frontend's folded-away recording inputs enforce the same count without either restating
    it."""
    max_per_day: int


@dataclass(frozen=True)
class DayCloseConfig:
    """Small-hours grace bounds for the previous day, as zero-padded "HH:MM" wall-clock times
    compared as strings against the Asia/Jerusalem clock. Until close_until, yesterday may still
    be closed and its meals written; until delete_until, its day record may still be deleted.
    The delete bound never outlives the close bound, so a deleted yesterday can always be
    re-closed. Declared in the config so the API's windows and the frontend's controls agree
    without either restating the times. min_window_hours is the eating window a day's recorded
    meals must span before the tracker offers closing at all."""
    close_until: str
    delete_until: str
    min_window_hours: float


@dataclass(frozen=True)
class AppConfig:
    questionnaire: Questionnaire
    weight: WeightConfig
    meals: MealsConfig
    day_close: DayCloseConfig


def _parse_weight(raw: dict) -> WeightConfig:
    weigh_in = raw["weigh_in"]
    weekday = weigh_in["weekday"]
    if weekday not in WEEKDAYS:
        raise ValueError(f"weigh_in weekday {weekday!r} is not one of {list(WEEKDAYS)}")
    hour = weigh_in["hour"]
    if isinstance(hour, bool) or not isinstance(hour, int) or not 0 <= hour <= 23:
        raise ValueError(f"weigh_in hour {hour!r} must be an integer hour of the day")
    chart_months = raw["chart_months"]
    if chart_months not in CHART_SPANS:
        raise ValueError(f"chart_months {chart_months!r} is not one of {list(CHART_SPANS)}")
    limits = Limits(min_kg=raw["limits"]["min_kg"], max_kg=raw["limits"]["max_kg"])
    if limits.min_kg >= limits.max_kg:
        raise ValueError(f"weight limits {limits.min_kg}..{limits.max_kg} span no range")
    return WeightConfig(weigh_in=WeighIn(weekday=weekday, hour=hour), chart_months=chart_months,
                        limits=limits)


def _parse_meals(raw: dict) -> MealsConfig:
    cap = raw["max_per_day"]
    if isinstance(cap, bool) or not isinstance(cap, int) or cap < 1:
        raise ValueError(f"max_per_day {cap!r} must be a positive integer")
    return MealsConfig(max_per_day=cap)


def _wall_clock(raw, key) -> str:
    value = raw[key]
    try:
        canonical = datetime.strptime(value, "%H:%M").strftime("%H:%M")
    except (TypeError, ValueError) as error:
        raise ValueError(f"{key} {value!r} must be a zero-padded HH:MM wall-clock time") from error
    if canonical != value:
        raise ValueError(f"{key} {value!r} must be a zero-padded HH:MM wall-clock time")
    return value


def _parse_day_close(raw: dict) -> DayCloseConfig:
    hours = raw["min_window_hours"]
    if isinstance(hours, bool) or not isinstance(hours, (int, float)) or hours <= 0:
        raise ValueError(f"min_window_hours {hours!r} must be a positive number of hours")
    config = DayCloseConfig(close_until=_wall_clock(raw, "close_until"),
                            delete_until=_wall_clock(raw, "delete_until"),
                            min_window_hours=hours)
    if config.delete_until > config.close_until:
        raise ValueError(f"delete_until {config.delete_until} may not outlive "
                         f"close_until {config.close_until}")
    return config


def load(path) -> AppConfig:
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    return AppConfig(questionnaire=parse(raw["questionnaire"]), weight=_parse_weight(raw["weight"]),
                     meals=_parse_meals(raw["meals"]), day_close=_parse_day_close(raw["day_close"]))
