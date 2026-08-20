from common.digest import weekly_text


def test_empty_history_message(numeric_questionnaire):
    assert weekly_text(numeric_questionnaire, {}) == "לא מולאו שאלונים השבוע"


def test_weekly_text_reports_averages_and_clean_days(numeric_questionnaire):
    history = {
        "2026-08-19": {"carbs": 7, "drinking": 3},
        "2026-08-20": {"carbs": 2, "drinking": 2},
    }
    text = weekly_text(numeric_questionnaire, history)
    assert "מולאו 2 מתוך 7 ימים" in text
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
