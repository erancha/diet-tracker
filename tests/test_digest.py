from pathlib import Path

from common.digest import weekly_text
from common.questionnaire import load

CONFIG = Path(__file__).parent.parent / "config" / "questionnaire.json"
Q = load(CONFIG)


def test_empty_week():
    assert weekly_text(Q, {}) == "לא מולאו שאלונים השבוע"


def test_digest_counts_days_choices_and_clean_days():
    history = {
        "2026-08-16": {
            "drinking": "l3", "vegetables": "meals2", "eating_window": "over_12",
            "meals": "m3", "carbs": "grade3",
        },
        "2026-08-17": {
            "drinking": "l3", "vegetables": "meals2", "eating_window": "h10",
            "meals": "m3", "carbs": "grade3",
        },
    }
    text = weekly_text(Q, history)
    assert "מולאו 2 מתוך 7 ימים" in text
    assert "10 שעות: 1" in text and "מעל 12 שעות !!: 1" in text
    # 2026-08-16 answered a violating choice (over_12), so one of two days is clean.
    assert "ימים ללא חריגה: 1 מתוך 2" in text


def test_digest_counts_each_selected_id_in_multi_question(multi_questionnaire):
    history = {
        "2026-08-16": {"carbs": ["grade3", "grade1_2"]},
        "2026-08-17": {"carbs": ["grade3"]},
    }
    text = weekly_text(multi_questionnaire, history)
    carbs_line = next(
        line for line in text.splitlines() if line.startswith(multi_questionnaire.question("carbs").text)
    )
    assert "grade3: 2" in carbs_line
    assert "grade1_2: 1" in carbs_line
