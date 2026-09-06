"""The knowledge-base app guide quotes values that live in config/app.json — the meal cap,
grade scale, addition points, portion percents, thresholds and day-close bounds. The chat's RAG
service answers from an uploaded copy of the guide, so a doc that drifts from config becomes
confidently wrong answers. Each test pins a quoted value to its config source; a config change
that fails here is the reminder to update docs/kb/app-guide-he.md and re-upload it."""

import json
from pathlib import Path

ROOT = Path(__file__).parent.parent
DOC = (ROOT / "docs" / "kb" / "app-guide-he.md").read_text()
CONFIG = json.loads((ROOT / "config" / "app.json").read_text())
CARBS = next(q for q in CONFIG["questionnaire"]["questions"] if q["id"] == "carbs")
RULES = {rule["id"]: rule for rule in CONFIG["questionnaire"]["rules"]}


def _doc_line(fragment) -> str:
    """The single doc line containing the fragment — the row a value must sit on."""
    lines = [line for line in DOC.splitlines() if fragment in line]
    assert len(lines) == 1, f"expected exactly one doc line with {fragment!r}, got {lines}"
    return lines[0]


def test_questionnaire_version_stamp():
    assert f"גרסת שאלון {CONFIG['questionnaire']['version']}" in DOC


def test_meal_cap():
    assert f"עד {CONFIG['meals']['max_per_day']} ארוחות ביום" in DOC


def test_grade_scale_span_and_rows():
    values = [choice["value"] for choice in CARBS["choices"]]
    assert f"בסולם של {min(values)} עד {max(values)}" in DOC
    for choice in CARBS["choices"]:
        row = _doc_line(f"| {choice['value']} | ")
        for example in choice["examples"].split(", "):
            assert example in row, f"grade {choice['value']} row is missing {example!r}"


def test_addition_points():
    for addition in CARBS["additions"]:
        label = addition["label"].split(" (")[0]
        assert f"| +{addition['value']} |" in _doc_line(f"| {label} |")


def test_portion_choices():
    portions = CARBS["portions"]
    assert f"מדרגה {portions['from_value']} ומעלה" in DOC
    for option in portions["options"]:
        assert option["label"] in DOC
        assert f"{option['percent']}%" in DOC


def test_second_source_light_bound():
    assert f"דרגה 1 או {CARBS['second_source']['light_grade_max']}" in DOC


def test_score_bounds():
    assert f"ציון יומי מקסימלי לרישום: {CARBS['max']}" in DOC
    assert f"היא **{CARBS['heavy_meal']} ומעלה**" in DOC
    assert f"**{RULES['heavy_day']['at_least']} ומעלה**" in DOC


def test_alert_thresholds_and_cadences():
    rows = {
        "heavy_day": "ציון פחמימות יומי גבוה",
        "low_drinking": f"פחות מ־{RULES['low_drinking']['below']} ליטר",
        "no_vegetables": "אף ארוחה עם ירקות",
        "long_eating_window": f"מעל {RULES['long_eating_window']['above']} שעות",
        "too_many_meals": f"מעל {RULES['too_many_meals']['at_least'] - 1} ארוחות",
    }
    for rule_id, fragment in rows.items():
        assert f"| {RULES[rule_id]['consecutive_days']} |" in _doc_line(fragment)


def test_day_close_bounds():
    day_close = CONFIG["day_close"]
    assert f"עד {day_close['close_until']} בלילה" in DOC
    assert f"עד {day_close['delete_until']}" in DOC
    assert f"{day_close['min_window_hours']} שעות" in _doc_line("משתרעות על")
