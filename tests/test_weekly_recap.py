from conftest import APP_CONFIG

from common import appconfig, notify, weekly_recap

# 2026-08-19 is a Wednesday, so the week below runs Wed-Fri with Friday the treat day.
WEDNESDAY, THURSDAY, FRIDAY = "2026-08-19", "2026-08-20", "2026-08-21"
HEAVY = {"carbs": 20, "drinking": 4, "vegetables": 2, "fat": 2, "eating_window": 10, "meals": 3}
CLEAN = {"carbs": 5, "drinking": 4, "vegetables": 2, "fat": 2, "eating_window": 10, "meals": 3}
TRENDS = "הגרפים והטבלה של השבוע במסך המגמות באפליקציה."
# The week the days above fall in, Saturday to Friday, as text() is told it, and the week before.
WEEK = ("2026-08-15", "2026-08-21")
LABEL = "15-21/08/2026"
LAST_SATURDAY, LAST_SUNDAY, LAST_MONDAY = "2026-08-08", "2026-08-09", "2026-08-10"
HEADER = notify.table_row(["", "", "השבוע", "שבוע שעבר"])


def questionnaire():
    return appconfig.load(APP_CONFIG).questionnaire


def row(*cells) -> str:
    return notify.table_row([str(cell) for cell in cells])


def recap(days, excluded=None, weights=None, insights=None) -> str:
    return weekly_recap.text(questionnaire(), *WEEK, days, excluded or {}, "FRI", weights or {},
                             insights)


def test_empty_history_message():
    assert recap({}) == f"סיכום שבועי {LABEL} — לא נסגרו ימים השבוע."


def test_the_recap_is_the_title_line_then_the_table_then_the_trends_pointer():
    text = recap({WEDNESDAY: CLEAN}, {WEDNESDAY: 0})
    assert text == "\n".join([f"סיכום שבועי {LABEL} — נסגרו 1 מתוך 7 ימים.",
                              HEADER, row("✅", "ימים נקיים", 1, "–"), "", TRENDS])


def test_each_bound_crossed_this_week_is_a_row_named_as_the_charts_name_it():
    week = {WEDNESDAY: HEAVY, THURSDAY: HEAVY, FRIDAY: {**HEAVY, "drinking": 1}}
    text = recap(week)
    # The subjects follow the questionnaire's order, each counted in days, not in runs.
    # With no last week to measure against, a row that is not clean carries no mark.
    assert text.split("\n")[3:5] == [row("", "חריגות שתיה (ליטרים)", 1, "–"),
                                     row("", "חריגות ציון יומי", 3, "–")]


def test_a_week_inside_every_bound_has_no_crossing_row():
    text = recap({WEDNESDAY: CLEAN, THURSDAY: CLEAN})
    assert "חריגות" not in text


def test_clean_days_are_counted_off_the_treat_day_only():
    week = {WEDNESDAY: CLEAN, THURSDAY: CLEAN, FRIDAY: CLEAN}
    # The Friday is the treat day: what it cost is what it is for, so it is neither clean nor not.
    assert row("", "ימים נקיים", 1, "–") in recap(week, {WEDNESDAY: 7, THURSDAY: 0, FRIDAY: 12})


def test_each_row_opens_with_its_standing_against_last_week():
    days = {WEDNESDAY: HEAVY, THURSDAY: CLEAN, LAST_SATURDAY: HEAVY, LAST_SUNDAY: HEAVY,
            LAST_MONDAY: HEAVY}
    text = recap(days, {WEDNESDAY: 7, LAST_SUNDAY: 5})
    # One clean day fewer is worse, two heavy days fewer is better: direction, not size.
    assert text.split("\n")[1:4] == [HEADER, row("🔴", "ימים נקיים", 1, 2),
                                     row("🟢", "חריגות ציון יומי", 1, 3)]


def test_a_count_level_with_last_week_is_marked_so():
    days = {WEDNESDAY: HEAVY, THURSDAY: CLEAN, LAST_SATURDAY: HEAVY, LAST_SUNDAY: CLEAN}
    assert row("↔️", "חריגות ציון יומי", 1, 1) in recap(days)


def test_more_breaches_than_last_week_are_marked_worse():
    days = {WEDNESDAY: HEAVY, THURSDAY: HEAVY, FRIDAY: HEAVY, LAST_SATURDAY: HEAVY,
            LAST_SUNDAY: CLEAN}
    assert row("🔴", "חריגות ציון יומי", 3, 1) in recap(days)


def test_a_week_with_every_closed_day_clean_meets_the_expectation():
    days = {WEDNESDAY: CLEAN, THURSDAY: CLEAN, FRIDAY: CLEAN, LAST_SATURDAY: CLEAN}
    assert row("✅", "ימים נקיים", 2, 1) in recap(days, {FRIDAY: 12, LAST_SATURDAY: 0})


def test_a_bound_crossed_last_week_alone_shows_only_when_the_difference_is_real():
    days = {WEDNESDAY: CLEAN, LAST_SATURDAY: {**CLEAN, "drinking": 1}}
    # One short day last week and none this week is one day's luck, not a row.
    assert "שתיה" not in recap(days)
    days[LAST_SUNDAY] = {**CLEAN, "drinking": 1}
    assert row("✅", "חריגות שתיה (ליטרים)", 0, 2) in recap(days)


def test_a_loss_past_the_expected_weekly_rate_earns_the_thumb():
    # 1.4 kg off 84.4 is 1.66% in a week, past the one percent a week is expected to take off.
    weights = {"2026-08-14": {"kg": 84.4, "at": "07:30"}, "2026-08-22": {"kg": 83, "at": "07:30"}}
    assert row("👍", 'משקל (ק"ג)', "83 (22/08)", "84.4 (14/08)") in recap({WEDNESDAY: CLEAN},
                                                                          weights=weights)


def test_a_loss_within_the_expected_rate_is_better_and_no_more():
    # 0.6 kg off 84.4 is 0.7%: inside the expected band, so an arrow rather than a thumb.
    weights = {"2026-08-14": {"kg": 84.4, "at": "07:30"}, "2026-08-22": {"kg": 83.8, "at": "07:30"}}
    assert row("🟢", 'משקל (ק"ג)', "83.8 (22/08)", "84.4 (14/08)") in recap({WEDNESDAY: CLEAN},
                                                                            weights=weights)


def test_a_gain_on_the_scale_is_worse():
    weights = {"2026-08-14": {"kg": 83, "at": "07:30"}, "2026-08-22": {"kg": 83.3, "at": "07:30"}}
    assert row("🔴", 'משקל (ק"ג)', "83.3 (22/08)", "83 (14/08)") in recap({WEDNESDAY: CLEAN},
                                                                          weights=weights)


def test_a_weighing_less_than_a_week_old_has_nothing_to_be_set_against():
    weights = {"2026-08-20": {"kg": 84.4, "at": "07:30"}, "2026-08-22": {"kg": 83, "at": "07:30"}}
    assert "משקל" not in recap({WEDNESDAY: CLEAN}, weights=weights)


def test_the_reading_sits_between_the_table_and_the_trends_pointer():
    text = recap({WEDNESDAY: HEAVY}, insights="להקדים את הארוחה האחרונה.")
    assert text == "\n".join([f"סיכום שבועי {LABEL} — נסגרו 1 מתוך 7 ימים.",
                              HEADER, row("✅", "ימים נקיים", 1, "–"),
                              row("", "חריגות ציון יומי", 1, "–"),
                              "", "תובנות לשבוע הבא:", "להקדים את הארוחה האחרונה.", "", TRENDS])


def test_the_chat_title_names_the_weeks_days_as_a_range():
    # A plain hyphen keeps the range inside one left-to-right number run in Hebrew text; a dash
    # between two numbers is flipped by the reader's bidi layout, ending the range on its start.
    assert weekly_recap.chat_title("2026-09-18", "2026-09-24") == "סיכום שבועי 18-24/09/2026"


def test_a_week_across_a_month_or_a_year_writes_both_ends_in_full():
    assert weekly_recap.week_label("2026-09-26", "2026-10-02") == "26/09-02/10/2026"
    assert weekly_recap.week_label("2026-12-26", "2027-01-01") == "26/12/2026-01/01/2027"


def test_the_treat_day_is_judged_like_any_other_day():
    assert row("", "חריגות ציון יומי", 1, "–") in recap({THURSDAY: CLEAN, FRIDAY: HEAVY})


def test_the_follow_up_is_one_question_and_the_brief_stays_out_of_it():
    # The question is what the chat list shows, so it stays one line, carrying the program's
    # vocabulary retrieval embeds; how to answer rides beside the data, out of the transcript.
    assert "\n" not in weekly_recap.INSIGHTS_QUESTION
    assert weekly_recap.INSIGHTS_QUESTION.startswith("מהן התובנות לשבוע הבא")
    assert "איזון הורמונלי" in weekly_recap.INSIGHTS_QUESTION
    assert weekly_recap.INSIGHTS_BRIEF.startswith("הנחיות לתשובה:")
    # Direction is weighed, not thresholded: one day alone is noise, small moves the same way
    # add up, and the largest change is named first.
    assert "מצטברים" in weekly_recap.INSIGHTS_BRIEF
    assert "בשינוי הגדול ביותר בהתנהגות, בשם הנושא שלו" in weekly_recap.INSIGHTS_BRIEF
    # The reading is the conclusion, never the rule it was weighed by.
    assert "בלי לצטט את ההנחיות" in weekly_recap.INSIGHTS_BRIEF
    # Behavior is the way and the weight the outcome; a breach comes with its day.
    assert "המשקל הוא התוצאה, לא הדרך" in weekly_recap.INSIGHTS_BRIEF
    assert "באיזה יום היא היתה" in weekly_recap.INSIGHTS_BRIEF
    # The marks are read the way the app sets them.
    assert "🟢 טוב יותר מהשבוע שעבר" in weekly_recap.INSIGHTS_BRIEF
    assert "👍 ירידה במשקל מעבר לצפוי" in weekly_recap.INSIGHTS_BRIEF
