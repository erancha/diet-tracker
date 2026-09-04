from common.chat import MAX_QUESTION_CHARS
from common.digest import weekly_summary_question, weekly_text


def test_empty_history_message(numeric_questionnaire):
    assert weekly_text(numeric_questionnaire, {}) == "לא נסגרו ימים השבוע"


def test_weekly_text_reports_averages_and_clean_days(numeric_questionnaire):
    history = {
        "2026-08-19": {"carbs": 7, "drinking": 3},
        "2026-08-20": {"carbs": 2, "drinking": 2},
    }
    text = weekly_text(numeric_questionnaire, history)
    assert "נסגרו 2 מתוך 7 ימים" in text
    assert "carbs: ממוצע 4.5" in text
    assert "drinking: ממוצע 2.5" in text
    # 08-19 is clean; 08-20 violates low_drinking (2 < 2.5).
    assert "ימים ללא חריגה: 1 מתוך 2" in text


def test_days_predating_a_question_are_skipped_in_its_average(numeric_questionnaire):
    history = {
        "2026-08-19": {"drinking": 3},
        "2026-08-20": {"carbs": 4, "drinking": 3},
    }
    text = weekly_text(numeric_questionnaire, history)
    assert "carbs: ממוצע 4" in text


def test_averages_round_to_one_decimal_digit(numeric_questionnaire):
    history = {
        "2026-08-19": {"carbs": 7},
        "2026-08-20": {"carbs": 2},
        "2026-08-21": {"carbs": 2},
    }
    assert "carbs: ממוצע 3.7" in weekly_text(numeric_questionnaire, history)


def test_summary_question_asks_for_recap_and_tips_over_labeled_data(numeric_questionnaire):
    history = {"2026-08-19": {"carbs": 7, "drinking": 3}}
    question = weekly_summary_question(numeric_questionnaire, history)
    assert "המלצות" in question
    assert '"2026-08-19"' in question
    assert '"carbs": 7' in question


def test_summary_question_sheds_oldest_days_to_fit_the_upstream_cap(numeric_questionnaire):
    history = {f"2026-{month:02d}-{day:02d}": {"carbs": 7, "drinking": 3}
               for month in range(1, 13) for day in range(1, 29)}
    question = weekly_summary_question(numeric_questionnaire, history)
    assert len(question) <= MAX_QUESTION_CHARS
    assert "2026-12-28" in question
    assert "2026-01-01" not in question
