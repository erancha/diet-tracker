"""Loads config/app.json — the app's single versioned config, holding the questionnaire beside
the weight, meals, day-close, treat-day and morning-notification settings, and shared by the
Lambdas and the frontend.

Every value the file declares is required. A malformed config is a deployment fault that must
surface at load, before the first schedule fires or the first request is served."""

import json
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from common.questionnaire import Questionnaire, parse

# EventBridge Scheduler's day-of-week tokens; the recap schedule's cron expression is built from
# the configured treat day at deploy time, and the morning job reads the day it runs on in them.
WEEKDAYS = ("SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT")

# Each token's Hebrew name, as the app writes a weekday wherever a day is named to a reader.
WEEKDAY_NAMES = {"SUN": "ראשון", "MON": "שני", "TUE": "שלישי", "WED": "רביעי", "THU": "חמישי",
                 "FRI": "שישי", "SAT": "שבת"}

# Spans the weight chart's range selector offers, in months. None is the whole series. The
# configured opening span must name one of them, or the chart would open on a range the reader
# has no control to return to.
CHART_SPANS = (1, 3, 12, None)


@dataclass(frozen=True)
class DebriefConfig:
    """When a closed day earns the morning's debrief: its score at or past the heavy-day bound
    times score_factor, or times treat_day_score_factor when the day was the treat day, whose
    treat meal is expected to cost. Both are at least 1, since a day under the bound is not heavy
    and has nothing to debrief."""
    score_factor: float
    treat_day_score_factor: float


@dataclass(frozen=True)
class MorningConfig:
    """The daily morning notifications, fired at `hour` in Asia/Jerusalem: the weekly weigh-in
    reminder on the treat day, and the debrief of a heavy yesterday for whoever earned one."""
    hour: int
    debrief: DebriefConfig


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
    without either restating the times. The tracker offers closing once a day's recorded meals
    span min_window_hours, or once the clock passes close_from, an evening "HH:MM" that lies
    after close_until so the two readings of the clock never overlap. From highlight_from, no
    earlier than close_from, the offer to close is drawn to the eye."""
    close_until: str
    delete_until: str
    min_window_hours: float
    close_from: str
    highlight_from: str


@dataclass(frozen=True)
class TreatDayConfig:
    """The weekday the program's week turns on, in the three-letter form the config writes: the
    day the treat meal is aimed at, the day the weekly weigh-in reminder goes out on, and so the
    day the weekly recap goes out on.

    No day is scored differently for it and no recorded day is marked as one. It names the day
    the weekly recap never counts as a flours-and-sugars finding, and the column the trend chart
    frames."""
    weekday: str


@dataclass(frozen=True)
class AppConfig:
    questionnaire: Questionnaire
    weight: WeightConfig
    meals: MealsConfig
    day_close: DayCloseConfig
    treat_day: TreatDayConfig
    morning_notifications: MorningConfig


def _parse_weight(raw: dict) -> WeightConfig:
    if "weigh_in" in raw:
        raise ValueError("weight declares weigh_in; the weigh-in reminder goes out at "
                         "morning_notifications.hour on treat_day's weekday")
    chart_months = raw["chart_months"]
    if chart_months not in CHART_SPANS:
        raise ValueError(f"chart_months {chart_months!r} is not one of {list(CHART_SPANS)}")
    limits = Limits(min_kg=raw["limits"]["min_kg"], max_kg=raw["limits"]["max_kg"])
    if limits.min_kg >= limits.max_kg:
        raise ValueError(f"weight limits {limits.min_kg}..{limits.max_kg} span no range")
    return WeightConfig(chart_months=chart_months, limits=limits)


def _score_factor(raw: dict, key) -> float:
    factor = raw[key]
    if isinstance(factor, bool) or not isinstance(factor, (int, float)) or factor < 1:
        raise ValueError(f"debrief {key} {factor!r} must be a number of at least 1")
    return factor


def _parse_morning(raw: dict) -> MorningConfig:
    hour = raw["hour"]
    if isinstance(hour, bool) or not isinstance(hour, int) or not 0 <= hour <= 23:
        raise ValueError(f"morning_notifications hour {hour!r} must be an integer hour of the day")
    debrief = raw["debrief"]
    return MorningConfig(hour=hour, debrief=DebriefConfig(
        score_factor=_score_factor(debrief, "score_factor"),
        treat_day_score_factor=_score_factor(debrief, "treat_day_score_factor")))


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
                            min_window_hours=hours, close_from=_wall_clock(raw, "close_from"),
                            highlight_from=_wall_clock(raw, "highlight_from"))
    if config.delete_until > config.close_until:
        raise ValueError(f"delete_until {config.delete_until} may not outlive "
                         f"close_until {config.close_until}")
    if config.close_from <= config.close_until:
        raise ValueError(f"close_from {config.close_from} must fall after "
                         f"close_until {config.close_until}")
    if config.highlight_from < config.close_from:
        raise ValueError(f"highlight_from {config.highlight_from} may not precede "
                         f"close_from {config.close_from}")
    return config


def _parse_treat_day(raw: dict) -> TreatDayConfig:
    weekday = raw["weekday"]
    if weekday not in WEEKDAYS:
        raise ValueError(f"treat_day weekday {weekday!r} is not one of {list(WEEKDAYS)}")
    return TreatDayConfig(weekday=weekday)


def load(path) -> AppConfig:
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    return AppConfig(questionnaire=parse(raw["questionnaire"]),
                     weight=_parse_weight(raw["weight"]),
                     meals=_parse_meals(raw["meals"]), day_close=_parse_day_close(raw["day_close"]),
                     treat_day=_parse_treat_day(raw["treat_day"]),
                     morning_notifications=_parse_morning(raw["morning_notifications"]))
