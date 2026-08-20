import json

import pytest

from common.questionnaire import load


@pytest.fixture
def numeric_questionnaire(tmp_path):
    """Loads a minimal two-question numeric questionnaire, independent of the repo config, with
    one at_least rule and one below rule so both comparators stay under test."""
    raw = {
        "version": 1,
        "questions": [
            {
                "id": "carbs", "type": "points", "text": "carbs", "max": 30,
                "choices": [
                    {"id": "no_carbs", "label": "no carbs", "value": 0},
                    {"id": "grade3", "label": "grade3", "value": 3},
                    {"id": "grade7_heavy", "label": "heavy", "value": 8},
                ],
            },
            {
                "id": "drinking", "type": "single", "text": "drinking",
                "choices": [
                    {"id": "l2", "label": "2 liters", "value": 2},
                    {"id": "l3", "label": "3 liters", "value": 3},
                ],
            },
        ],
        "rules": [
            {"id": "heavy_carbs", "question_id": "carbs", "at_least": 8,
             "consecutive_days": 2, "message": "heavy carbs {days} days in a row"},
            {"id": "low_drinking", "question_id": "drinking", "below": 2.5,
             "consecutive_days": 2, "message": "low drinking {days} days in a row"},
        ],
    }
    path = tmp_path / "numeric_questionnaire.json"
    path.write_text(json.dumps(raw), encoding="utf-8")
    return load(path)
