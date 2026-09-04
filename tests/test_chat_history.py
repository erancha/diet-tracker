import pytest

from common import chat_history


@pytest.fixture
def table(ddb):
    return ddb.Table("chat_history")


def test_an_appended_turn_comes_back_complete(table):
    sources = [{"fileName": "מדריך.pdf", "score": 0.83}]
    chat_history.append(table, "u1", "כמה פחמימות מותר ביום?", "עד 4 נקודות", sources)

    (turn,) = chat_history.turns(table, "u1")
    assert turn["question"] == "כמה פחמימות מותר ביום?"
    assert turn["answer"] == "עד 4 נקודות"
    assert turn["sources"] == sources
    assert "T" in turn["at"]


def test_turns_come_newest_first_and_only_for_the_asking_user(table):
    chat_history.append(table, "u1", "ראשונה", "ת1", [])
    chat_history.append(table, "u2", "של אחר", "ת", [])
    chat_history.append(table, "u1", "שנייה", "ת2", [])

    questions = [turn["question"] for turn in chat_history.turns(table, "u1")]
    assert questions == ["שנייה", "ראשונה"]


def test_append_returns_the_stored_sort_key(table):
    at = chat_history.append(table, "u1", "שאלה?", "תשובה", [])

    (turn,) = chat_history.turns(table, "u1")
    assert turn["at"] == at


def test_append_with_an_explicit_at_overwrites_that_turn_in_place(table):
    at = chat_history.append(table, "u1", "שאלה מקורית", "תשובה ראשונה", [])

    returned = chat_history.append(table, "u1", "שרשור מלא", "תשובה חדשה",
                                   [{"fileName": "מדריך.pdf", "score": 0.9}], at=at)

    assert returned == at
    (turn,) = chat_history.turns(table, "u1")
    assert turn == {"question": "שרשור מלא", "answer": "תשובה חדשה",
                    "sources": [{"fileName": "מדריך.pdf", "score": 0.9}], "at": at}


def test_append_with_an_at_that_holds_no_turn_raises(table):
    with pytest.raises(KeyError):
        chat_history.append(table, "u1", "שאלת המשך", "תשובה", [], at="2026-09-01T10:00:00+00:00")

    assert chat_history.turns(table, "u1") == []


def test_append_with_an_at_cannot_touch_another_users_turn(table):
    at = chat_history.append(table, "u1", "שאלה", "תשובה", [])

    with pytest.raises(KeyError):
        chat_history.append(table, "u2", "שרשור", "ת", [], at=at)

    assert [turn["question"] for turn in chat_history.turns(table, "u1")] == ["שאלה"]
    assert chat_history.turns(table, "u2") == []


def test_delete_removes_only_the_named_turn(table):
    kept = chat_history.append(table, "u1", "נשארת", "ת", [])
    removed = chat_history.append(table, "u1", "נמחקת", "ת", [])
    chat_history.append(table, "u2", "של אחר", "ת", [])

    chat_history.delete(table, "u1", removed)

    assert [turn["at"] for turn in chat_history.turns(table, "u1")] == [kept]
    assert [turn["question"] for turn in chat_history.turns(table, "u2")] == ["של אחר"]


def test_delete_of_a_missing_turn_raises(table):
    at = chat_history.append(table, "u1", "שאלה?", "תשובה", [])

    with pytest.raises(KeyError):
        chat_history.delete(table, "u2", at)


def test_count_range_covers_whole_boundary_days_for_the_asking_user_alone(table):
    for sk in ("2026-08-29T00:00:00+00:00", "2026-09-04T23:59:59+00:00"):
        table.put_item(Item={"pk": "u1", "sk": sk, "question": "ש", "answer": "ת",
                             "sources": "[]"})
    table.put_item(Item={"pk": "u1", "sk": "2026-08-28T23:59:59+00:00", "question": "ש",
                         "answer": "ת", "sources": "[]"})
    table.put_item(Item={"pk": "u2", "sk": "2026-08-30T12:00:00+00:00", "question": "ש",
                         "answer": "ת", "sources": "[]"})

    assert chat_history.count_range(table, "u1", "2026-08-29", "2026-09-04") == 2
    assert chat_history.count_range(table, "u2", "2026-08-29", "2026-09-04") == 1


def test_turns_follows_pagination_to_the_end():
    # A fake table standing in for DynamoDB's 1MB page cap, which moto cannot be made to hit
    # at reasonable test cost.
    class PagedTable:
        def __init__(self):
            self.seen_start_keys = []

        def query(self, **kwargs):
            self.seen_start_keys.append(kwargs.get("ExclusiveStartKey"))
            if kwargs.get("ExclusiveStartKey") is None:
                return {"Items": [{"question": "שנייה", "answer": "ת2", "sources": "[]",
                                   "sk": "2026-09-01T10:00:00"}],
                        "LastEvaluatedKey": {"pk": "u1", "sk": "2026-09-01T10:00:00"}}
            return {"Items": [{"question": "ראשונה", "answer": "ת1", "sources": "[]",
                               "sk": "2026-09-01T09:00:00"}]}

    paged = PagedTable()
    questions = [turn["question"] for turn in chat_history.turns(paged, "u1")]
    assert questions == ["שנייה", "ראשונה"]
    assert paged.seen_start_keys == [None, {"pk": "u1", "sk": "2026-09-01T10:00:00"}]
