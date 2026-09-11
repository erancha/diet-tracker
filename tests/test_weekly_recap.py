from common.chat import MAX_CONTEXT_CHARS
from common import weekly_recap

WEIGHTS = {"2026-08-12": {"kg": 84.0}, "2026-08-19": {"kg": 83.2}}


def test_empty_history_message(numeric_questionnaire):
    assert weekly_recap.text(numeric_questionnaire, {}) == "לא נסגרו ימים השבוע"


def test_the_numeric_line_counts_the_days_that_broke_a_rule(numeric_questionnaire):
    history = {
        "2026-08-19": {"carbs": 7, "drinking": 3},
        "2026-08-20": {"carbs": 2, "drinking": 2},
    }
    text = weekly_recap.text(numeric_questionnaire, history)
    # 08-19 is clean; 08-20 violates low_drinking (2 < 2.5). The breaches are what asks to be
    # acted on, so they are what the line counts.
    assert text == "סיכום שבועי — נסגרו 2 מתוך 7 ימים, 1 מהם עם חריגה"


def test_a_week_that_broke_no_rule_says_so_rather_than_counting_to_zero(numeric_questionnaire):
    history = {"2026-08-19": {"carbs": 7, "drinking": 3}}
    assert weekly_recap.text(numeric_questionnaire, history).endswith("כולם ללא חריגה")


def test_the_numeric_line_leaves_the_numbers_to_the_bullets_that_follow(numeric_questionnaire):
    # No per-question averages: the recap bullets name the days that ask for attention, and every
    # average is in the app.
    text = weekly_recap.text(numeric_questionnaire, {"2026-08-19": {"carbs": 7, "drinking": 3}})
    assert "ממוצע" not in text
    assert text.count("\n") == 0


def test_a_day_predating_a_question_still_counts_as_closed(numeric_questionnaire):
    history = {"2026-08-19": {"drinking": 3}, "2026-08-20": {"carbs": 4, "drinking": 3}}
    assert "נסגרו 2 מתוך 7 ימים" in weekly_recap.text(numeric_questionnaire, history)


def test_the_instruction_asks_for_bullets_in_the_questionnaires_own_words():
    assert "תבליטים" in weekly_recap.INSTRUCTION
    assert "המלצה" in weekly_recap.INSTRUCTION
    # Dates and per-day values stay in the app; the email carries counts and reasons.
    assert "בלי לפרט תאריכים" in weekly_recap.INSTRUCTION
    # And in the questionnaire's own words, not a vocabulary the app never shows.
    assert "בלי מילים לועזיות" in weekly_recap.INSTRUCTION


def test_the_question_names_the_subjects_a_recap_may_touch():
    # The question is the only field embedded upstream, so it decides which program pages ground
    # the recap.
    for subject in ("קמחים וסוכרים", "יום פינוק", "חלון אכילה", "ירקות", "שתייה", "ארוחות",
                    "דרגות הפחמימות", "המשקל"):
        assert subject in weekly_recap.QUESTION
    assert "תבליטים" not in weekly_recap.QUESTION


def test_the_instruction_travels_with_the_week_in_the_context(numeric_questionnaire):
    history = {"2026-08-19": {"carbs": 7, "drinking": 3}}
    context = weekly_recap.context(numeric_questionnaire, history, WEIGHTS, 78)
    # How to answer belongs beside the data the answer is about, out of the embedded field.
    assert context.startswith(weekly_recap.INSTRUCTION)
    assert '"2026-08-19"' in context
    assert '"carbs": 7' in context


def test_the_context_carries_the_weigh_ins_and_the_target(numeric_questionnaire):
    history = {"2026-08-19": {"carbs": 7}}
    context = weekly_recap.context(numeric_questionnaire, history, WEIGHTS, 78)
    assert '"2026-08-12": 84.0' in context
    assert '"2026-08-19": 83.2' in context
    assert '"יעד": 78' in context


def test_the_context_omits_an_unset_target(numeric_questionnaire):
    context = weekly_recap.context(numeric_questionnaire, {"2026-08-19": {"carbs": 7}},
                                     WEIGHTS, None)
    assert '"יעד"' not in context


def test_the_context_sheds_oldest_days_to_fit_the_upstream_cap(numeric_questionnaire):
    history = {f"2026-{month:02d}-{day:02d}": {"carbs": 7, "drinking": 3}
               for month in range(1, 13) for day in range(1, 29)}
    context = weekly_recap.context(numeric_questionnaire, history, WEIGHTS, 78)
    assert len(context) <= MAX_CONTEXT_CHARS
    assert "2026-12-28" in context
    assert "2026-01-01" not in context
    # The weight block outlives every shed day: it goes last in the shedding order.
    assert '"יעד": 78' in context


def test_the_chat_title_names_the_sunday_its_week_opened_on():
    assert weekly_recap.chat_title("2026-09-06") == "סיכום שבועי 06/09/2026"
