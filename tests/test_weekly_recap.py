from conftest import APP_CONFIG

from common import appconfig, weekly_recap

# 2026-08-19 is a Wednesday, so the week below runs Wed-Fri with Friday the treat day.
WEDNESDAY, THURSDAY, FRIDAY = "2026-08-19", "2026-08-20", "2026-08-21"
HEAVY = {"carbs": 20, "drinking": 4, "vegetables": 2, "eating_window": 10, "meals": 3}
CLEAN = {"carbs": 5, "drinking": 4, "vegetables": 2, "eating_window": 10, "meals": 3}


def questionnaire():
    return appconfig.load(APP_CONFIG).questionnaire


def test_empty_history_message():
    assert weekly_recap.text(questionnaire(), {}, {}, "FRI") == "לא נסגרו ימים השבוע"


def test_a_week_inside_every_bound_names_no_finding():
    text = weekly_recap.text(questionnaire(), {WEDNESDAY: CLEAN}, {WEDNESDAY: 0}, "FRI")
    assert text.startswith("סיכום שבועי — נסגרו 1 מתוך 7 ימים")
    assert "חריגה" not in text


def test_each_crossed_bound_is_named_with_the_wording_the_charts_use():
    text = weekly_recap.text(questionnaire(), {WEDNESDAY: HEAVY, THURSDAY: HEAVY}, {}, "FRI")
    # The bound reads as the chart legend writes it, and the count is of days, not of runs.
    assert "• ציון יומי — חריגה (מעל 12) ב-2 ימים" in text


def test_one_day_is_written_as_a_day_rather_than_a_numeral():
    text = weekly_recap.text(questionnaire(), {WEDNESDAY: HEAVY}, {}, "FRI")
    assert "• ציון יומי — חריגה (מעל 12) ביום אחד" in text


def test_flours_and_sugars_are_counted_off_the_treat_day_only():
    week = {WEDNESDAY: CLEAN, THURSDAY: CLEAN, FRIDAY: CLEAN}
    # The Friday is the treat day: what it cost is what it is for, so it is never a finding.
    text = weekly_recap.text(questionnaire(), week,
                             {WEDNESDAY: 7, THURSDAY: 0, FRIDAY: 12}, "FRI")
    assert "• קמחים וסוכרים ביום אחד שאינו יום פינוק" in text


def test_the_recap_ends_by_pointing_at_the_trends_screen():
    text = weekly_recap.text(questionnaire(), {WEDNESDAY: CLEAN}, {}, "FRI")
    assert text.endswith("הגרפים והטבלה של השבוע במסך המגמות באפליקציה.")


def test_the_chat_title_names_the_sunday_its_week_opened_on():
    assert weekly_recap.chat_title("2026-09-06") == "סיכום שבועי 06/09/2026"
