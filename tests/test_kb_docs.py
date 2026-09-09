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


def _doc_row(first_cell) -> str:
    """The single table row whose first cell is the given value. Anchored at the row's start
    because a bare number reads as a cell anywhere in the guide's tables — a grade, an amount's
    cost, a streak length — and only the leading cell names the row."""
    rows = [line for line in DOC.splitlines() if line.startswith(f"| {first_cell} | ")]
    assert len(rows) == 1, f"expected exactly one doc row starting with {first_cell!r}, got {rows}"
    return rows[0]


def _doc_section(title) -> str:
    """The guide's text under one section heading, as one whitespace-normalized string: a prose
    claim wraps across lines, so unlike the table rows above it cannot be pinned line by line."""
    lines = DOC.splitlines()
    heads = [i for i, line in enumerate(lines) if line.startswith("## ") and line.endswith(title)]
    assert len(heads) == 1, f"expected exactly one {title!r} section, got {len(heads)}"
    end = next((i for i in range(heads[0] + 1, len(lines)) if lines[i].startswith("## ")),
               len(lines))
    return " ".join(" ".join(lines[heads[0]:end]).split())


def test_questionnaire_version_stamp():
    assert f"גרסת שאלון {CONFIG['questionnaire']['version']}" in DOC


def test_meal_cap():
    assert f"עד {CONFIG['meals']['max_per_day']} ארוחות ביום" in DOC


def test_grade_scale_span_and_rows():
    values = [choice["value"] for choice in CARBS["choices"]]
    assert f"בסולם של {min(values)} עד {max(values)}" in DOC
    for choice in CARBS["choices"]:
        row = _doc_row(choice["value"])
        for example in choice["examples"].split(", "):
            assert example in row, f"grade {choice['value']} row is missing {example!r}"


def test_addition_points():
    for addition in CARBS["additions"]:
        label = addition["label"].split(" (")[0]
        assert f"| +{addition['value']} |" in _doc_line(f"| {label} |")


def test_addition_amount_scale():
    # The guide spells out what each addition costs at each amount, so the arithmetic it quotes
    # is pinned to the surcharges and percents the app actually prices with.
    amounts = CARBS["amounts"]
    default = next(o for o in amounts["options"] if o["id"] == amounts["default"])
    assert f"ברירת המחדל היא **{default['label']}**" in DOC
    for option in amounts["options"]:
        row = _doc_row(option["label"])
        assert f"| {option['percent']}% |" in row
        for addition in CARBS["additions"]:
            cost = addition["value"] * option["percent"] / 100
            assert f"| {cost:g} |" in row, f"{option['id']} row is missing {cost:g}"


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
        "heavy_day": "ציון יומי גבוה",
        "low_drinking": f"פחות מ־{RULES['low_drinking']['below']} ליטר",
        "no_vegetables": "אף ארוחה עם ירקות",
        "long_eating_window": f"מעל {RULES['long_eating_window']['above']} שעות",
        "too_many_meals": f"מעל {RULES['too_many_meals']['at_least'] - 1} ארוחות",
    }
    for rule_id, fragment in rows.items():
        assert f"| {RULES[rule_id]['consecutive_days']} |" in _doc_line(fragment)


# Hebrew day names for the scheduler weekday tokens the config declares, so a retargeted treat
# day fails here rather than leaving the guide naming the wrong day.
WEEKDAY_NAMES = {"SUN": "ראשון", "MON": "שני", "TUE": "שלישי", "WED": "רביעי", "THU": "חמישי",
                 "FRI": "שישי", "SAT": "שבת"}


def test_trend_chart_excluded_line():
    # The guide spells out what the chart's second line sums, so a config that excludes another
    # grade or another addition must reach the sentence.
    section = _doc_section("גרף המגמה")
    assert f"בדרגה {CARBS['excluded_grade']} ומעלה" in section
    labels = {addition["id"]: addition["label"] for addition in CARBS["additions"]}
    for addition in CARBS["excluded_additions"]:
        assert f'"{labels[addition]}"' in section


def test_trend_chart_treat_day():
    weekday = WEEKDAY_NAMES[CONFIG["treat_day"]["weekday"]]
    assert f"יום {weekday}" in _doc_section("גרף המגמה")


def test_day_close_bounds():
    day_close = CONFIG["day_close"]
    assert f"עד {day_close['close_until']} בלילה" in DOC
    assert f"עד {day_close['delete_until']}" in DOC
    assert f"{day_close['min_window_hours']} שעות" in _doc_line("משתרעות על")


def test_mail_confirmation_section_names_the_senders_a_user_must_look_for():
    # The confirmation request comes from Amazon's own sender, and the reminders from the deployed
    # SesSender, so the guide's spam-filter steps have to name both; the app's is pinned to the
    # committed deploy parameter template so a sender change is the reminder to update the guide.
    section = _doc_section("אישור כתובת המייל")
    assert "no-reply-aws@amazon.com" in section
    params = (ROOT / "scripts" / "params.example.sh").read_text()
    sender = next(line for line in params.splitlines() if line.startswith("export SES_SENDER="))
    assert sender.split("=", 1)[1].strip('"') in section
