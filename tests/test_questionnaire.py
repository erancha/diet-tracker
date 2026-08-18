import json
from pathlib import Path

import pytest

from common.questionnaire import load

CONFIG = Path(__file__).parent.parent / "config" / "questionnaire.json"


def valid_answers(q):
    answers = {}
    for question in q.questions:
        answers[question.id] = [question.choices[0].id] if question.type == "multi" else question.choices[0].id
    return answers


def test_load_parses_repo_config():
    q = load(CONFIG)
    assert q.version == 2
    ids = [question.id for question in q.questions]
    assert ids == ["drinking", "vegetables", "eating_window", "meals", "carbs"]
    assert q.question("meals").choice_label("m2") == "2 ארוחות"
    assert q.question("carbs").type == "single"
    assert q.question("meals").type == "single"


def test_validate_answers_accepts_full_valid_set():
    q = load(CONFIG)
    q.validate_answers(valid_answers(q))


def test_validate_answers_rejects_missing_and_unknown_questions():
    q = load(CONFIG)
    with pytest.raises(ValueError):
        q.validate_answers({})
    with pytest.raises(ValueError):
        q.validate_answers({**valid_answers(q), "bogus": "x"})


def test_validate_answers_rejects_choice_not_in_question():
    q = load(CONFIG)
    with pytest.raises(ValueError):
        q.validate_answers({**valid_answers(q), "meals": "over_12"})


def test_validate_answers_rejects_string_for_multi_question(multi_questionnaire):
    with pytest.raises(ValueError):
        multi_questionnaire.validate_answers({"carbs": "grade3"})


def test_validate_answers_rejects_empty_list_for_multi_question(multi_questionnaire):
    with pytest.raises(ValueError):
        multi_questionnaire.validate_answers({"carbs": []})


def test_validate_answers_rejects_duplicate_choice_ids(multi_questionnaire):
    with pytest.raises(ValueError):
        multi_questionnaire.validate_answers({"carbs": ["grade3", "grade3"]})


def test_validate_answers_rejects_unknown_choice_id_in_multi_question(multi_questionnaire):
    with pytest.raises(ValueError):
        multi_questionnaire.validate_answers({"carbs": ["bogus"]})


def test_validate_answers_rejects_list_for_single_question():
    q = load(CONFIG)
    with pytest.raises(ValueError):
        q.validate_answers({**valid_answers(q), "meals": ["m2"]})


def test_load_rejects_rule_referencing_unknown_question(tmp_path):
    raw = json.loads(CONFIG.read_text(encoding="utf-8"))
    raw["rules"][0]["question_id"] = "nope"
    bad = tmp_path / "q.json"
    bad.write_text(json.dumps(raw), encoding="utf-8")
    with pytest.raises(ValueError):
        load(bad)


def test_load_rejects_question_missing_type(tmp_path):
    raw = json.loads(CONFIG.read_text(encoding="utf-8"))
    del raw["questions"][0]["type"]
    bad = tmp_path / "q.json"
    bad.write_text(json.dumps(raw), encoding="utf-8")
    with pytest.raises(ValueError):
        load(bad)


def test_load_rejects_question_with_unknown_type(tmp_path):
    raw = json.loads(CONFIG.read_text(encoding="utf-8"))
    raw["questions"][0]["type"] = "bogus"
    bad = tmp_path / "q.json"
    bad.write_text(json.dumps(raw), encoding="utf-8")
    with pytest.raises(ValueError):
        load(bad)


# The frontend's 7-day trend chart charts a question only when every one of its choices carries
# a numeric "value" (liters / hours); the loader ignores that extra key, so this config invariant
# has no backend enforcement of its own.
def test_drinking_and_eating_window_choices_all_carry_a_numeric_value():
    raw = json.loads(CONFIG.read_text(encoding="utf-8"))
    questions = {q["id"]: q for q in raw["questions"]}
    for question_id in ("drinking", "eating_window"):
        for choice in questions[question_id]["choices"]:
            assert isinstance(choice.get("value"), (int, float)), \
                f"{question_id} choice {choice['id']!r} is missing a numeric value"
