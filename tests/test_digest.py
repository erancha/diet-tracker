from common.chat import MAX_QUESTION_CHARS
from common.digest import recap_chat_title, weekly_summary_question, weekly_text

WEIGHTS = {"2026-08-12": {"kg": 84.0}, "2026-08-19": {"kg": 83.2}}


def test_empty_history_message(numeric_questionnaire):
    assert weekly_text(numeric_questionnaire, {}) == "לא נסגרו ימים השבוע"


def test_weekly_text_counts_the_days_that_broke_a_rule(numeric_questionnaire):
    history = {
        "2026-08-19": {"carbs": 7, "drinking": 3},
        "2026-08-20": {"carbs": 2, "drinking": 2},
    }
    text = weekly_text(numeric_questionnaire, history)
    # 08-19 is clean; 08-20 violates low_drinking (2 < 2.5). The breaches are what asks to be
    # acted on, so they are what the line counts.
    assert text == "סיכום שבועי — נסגרו 2 מתוך 7 ימים, 1 מהם עם חריגה"


def test_a_week_that_broke_no_rule_says_so_rather_than_counting_to_zero(numeric_questionnaire):
    history = {"2026-08-19": {"carbs": 7, "drinking": 3}}
    assert weekly_text(numeric_questionnaire, history).endswith("כולם ללא חריגה")


def test_weekly_text_leaves_the_numbers_to_the_bullets_that_follow(numeric_questionnaire):
    # No per-question averages: the recap bullets name the days that ask for attention, and every
    # average is in the app.
    text = weekly_text(numeric_questionnaire, {"2026-08-19": {"carbs": 7, "drinking": 3}})
    assert "ממוצע" not in text
    assert text.count("\n") == 0


def test_a_day_predating_a_question_still_counts_as_closed(numeric_questionnaire):
    history = {"2026-08-19": {"drinking": 3}, "2026-08-20": {"carbs": 4, "drinking": 3}}
    assert "נסגרו 2 מתוך 7 ימים" in weekly_text(numeric_questionnaire, history)


def test_summary_question_asks_for_bullets_over_the_labeled_data(numeric_questionnaire):
    history = {"2026-08-19": {"carbs": 7, "drinking": 3}}
    question = weekly_summary_question(numeric_questionnaire, history, WEIGHTS, 78)
    assert "תבליטים" in question
    assert "המלצה" in question
    # Dates and per-day values stay in the app; the email carries counts and reasons.
    assert "בלי לפרט תאריכים" in question
    # And in the questionnaire's own words, not a vocabulary the app never shows.
    assert "בלי מילים לועזיות" in question
    assert '"2026-08-19"' in question
    assert '"carbs": 7' in question


def test_summary_question_carries_the_weigh_ins_and_the_target(numeric_questionnaire):
    history = {"2026-08-19": {"carbs": 7}}
    question = weekly_summary_question(numeric_questionnaire, history, WEIGHTS, 78)
    assert '"2026-08-12": 84.0' in question
    assert '"2026-08-19": 83.2' in question
    assert '"יעד": 78' in question


def test_summary_question_omits_an_unset_target(numeric_questionnaire):
    question = weekly_summary_question(numeric_questionnaire, {"2026-08-19": {"carbs": 7}},
                                       WEIGHTS, None)
    assert '"יעד"' not in question


def test_summary_question_sheds_oldest_days_to_fit_the_upstream_cap(numeric_questionnaire):
    history = {f"2026-{month:02d}-{day:02d}": {"carbs": 7, "drinking": 3}
               for month in range(1, 13) for day in range(1, 29)}
    question = weekly_summary_question(numeric_questionnaire, history, WEIGHTS, 78)
    assert len(question) <= MAX_QUESTION_CHARS
    assert "2026-12-28" in question
    assert "2026-01-01" not in question
    # The weight block outlives every shed day: it goes last in the shedding order.
    assert '"יעד": 78' in question


def test_recap_chat_title_names_the_sunday_its_week_opened_on():
    assert recap_chat_title("2026-09-06") == "סיכום שבועי 06/09/2026"
