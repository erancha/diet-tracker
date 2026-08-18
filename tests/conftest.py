import json

import pytest

from common.questionnaire import load


@pytest.fixture
def multi_questionnaire(tmp_path):
    """Loads a minimal questionnaire whose one question is multi-select, independent of the
    repo config (whose questions are all single) — keeps multi-select behavior under test."""
    raw = {
        "version": 1,
        "questions": [
            {
                "id": "carbs",
                "type": "multi",
                "text": "carbs",
                "choices": [
                    {"id": "grade1_2", "label": "grade1_2"},
                    {"id": "grade3", "label": "grade3"},
                    {"id": "grade7_heavy", "label": "grade7_heavy"},
                    {"id": "off_reset", "label": "off_reset"},
                ],
            }
        ],
        "rules": [
            {
                "id": "heavy_carbs",
                "question_id": "carbs",
                "violating_choice_ids": ["grade7_heavy", "off_reset"],
                "consecutive_days": 2,
                "message": "heavy carbs {days} days in a row",
            }
        ],
    }
    path = tmp_path / "multi_questionnaire.json"
    path.write_text(json.dumps(raw), encoding="utf-8")
    return load(path)
