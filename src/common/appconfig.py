"""Loads config/app.json — the app's single versioned config, holding the questionnaire alongside
the weight settings, and read by the API Lambda, the nudge jobs, and the frontend alike.

Every value the file declares is required. A malformed config is a deployment fault that must
surface at load, before the first schedule fires or the first request is served."""

import json
from dataclasses import dataclass
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
class AppConfig:
    questionnaire: Questionnaire
    weight: WeightConfig


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


def load(path) -> AppConfig:
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    return AppConfig(questionnaire=parse(raw["questionnaire"]), weight=_parse_weight(raw["weight"]))
